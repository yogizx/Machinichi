import { Response, NextFunction } from 'express';
import { Payment } from '../models/Payment';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { Coupon } from '../models/Coupon';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendSuccess, sendError } from '../services/apiResponse';
import {
  createPaymentOrderSchema,
  createDirectPaymentOrderSchema,
  verifyPaymentSchema,
  refundPaymentSchema,
} from '../validators';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  capturePayment,
  createRefund,
  verifyWebhookSignature,
} from '../services/razorpay.service';
import { generateOrderId, generateInvoiceNumber } from '../services/orderId.service';
import { reserveStock } from '../services/inventory.service';
import {
  buildDefaultScratchReward,
  filterOffersForCart,
  getActiveOfferCoupons,
  hasLiveAdminScratchOffer,
  OfferCartItem,
  resolveAppliedOffer,
  resolveFreeDeliveryOffer,
} from '../services/offer.service';
import { Types } from 'mongoose';

import { mapAddressForDb } from './checkout.controller';
import { APPROVED_ORDER_STATUSES, logAnalyticsEvent } from '../services/regionalAnalytics.service';

// Delivery prices the checkout page offers (standard / express). Anything else sent by a browser is ignored.
const ALLOWED_SHIPPING_CHARGES = [50, 120] as const;

export const createPaymentOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      return sendError(res, 'Authentication required', 401);
    }

    const validation = createPaymentOrderSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400, validation.error.issues);
    }

    // SECURITY: the amount sent by the browser is deliberately ignored - what is charged is the order's own total.
    const { orderId, currency } = validation.data;

    const order = await Order.findById(orderId);
    if (!order) return sendError(res, 'Order not found', 404);
    if (order.userId.toString() !== req.user.userId) {
      return sendError(res, 'Not authorized', 403);
    }
    if (order.paymentStatus === 'Paid') {
      return sendError(res, 'This order has already been paid', 400);
    }

    const amount = Math.round(Number(order.totalAmount ?? order.orderTotal ?? 0));
    if (!Number.isFinite(amount) || amount < 1) {
      return sendError(res, 'Order total is invalid', 400);
    }

    const razorpayOrder = await createRazorpayOrder(amount, currency, `ord_${orderId}`);

    const payment = await Payment.create({
      userId: new Types.ObjectId(req.user.userId),
      orderId: new Types.ObjectId(orderId),
      razorpayOrderId: razorpayOrder.id,
      amount,
      currency: currency || 'INR',
      status: 'created',
    });

    sendSuccess(res, {
      data: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt,
        key: process.env.RAZORPAY_KEY_ID,
        paymentDbId: payment._id,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createDirectPaymentOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    console.log(`[CREATE DIRECT PAYMENT] Called - user: ${req.user?.userId}, body keys: ${Object.keys(req.body).join(', ')}`);

    if (!req.user?.userId) {
      return sendError(res, 'Authentication required', 401);
    }

    const validation = createDirectPaymentOrderSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400, validation.error.issues);
    }

    const { amount, currency, items, shippingAddress, subtotal, shippingCharges, discountAmount, promoCode, promoDiscount, coupon, scratchCouponId, scratchDefault } = validation.data;

    const userId = new Types.ObjectId(req.user.userId);

    // SECURITY / DATA-INTEGRITY: never trust the client for what product was
    // actually bought. Every item must resolve to a real, active product in
    // MongoDB via productId — the order snapshot (name/image/category) is
    // built from that authoritative record, not from whatever the browser
    // happened to send. This is what previously let a stale/placeholder cart
    // payload silently create an order for the wrong product.
    const productIds = (items || []).map(item => item.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true,
      isDeleted: false,
    });
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    const missing = productIds.filter(id => !productMap.has(id));
    if (missing.length > 0) {
      return sendError(res, 'One or more items in your order are no longer available. Please refresh your cart and try again.', 400);
    }

    // SECURITY: the unit price sent by the browser must be a price this product really has: its base price or
    // the price of one of its variants. Any other value is a tampered price and the order is refused.
    const validUnitPrices = (product: any): number[] => {
      const prices: number[] = [Number(product.sellingPrice)];
      const walk = (variants: any[] | undefined) => {
        for (const variant of variants || []) {
          prices.push(Number(variant.sellingPrice));
          walk(variant.subVariants);
        }
      };
      walk(product.variants);
      return prices.filter((price) => Number.isFinite(price) && price > 0);
    };
    const tamperedItem = (items || []).find((item) => {
      const product = productMap.get(item.productId)!;
      return !validUnitPrices(product).some((price) => Math.abs(price - item.sellingPrice) < 0.01);
    });
    if (tamperedItem) {
      return sendError(res, 'The price of an item in your cart has changed. Please refresh your cart and try again.', 400);
    }

    const orderItems = (items || []).map(item => {
      const product = productMap.get(item.productId)!;
      return {
        productId: product._id,
        name: product.name,
        image: product.images?.[0]?.url || item.image || '',
        sku: product.sku || '',
        sellingPrice: item.sellingPrice,
        quantity: item.quantity,
        mrpPrice: item.sellingPrice,
        gstRate: product.gstRate ?? 5,
        gstAmount: Math.round((item.sellingPrice * item.quantity * (product.gstRate ?? 5)) / 100),
        lineTotal: item.sellingPrice * item.quantity,
      };
    });

    const totalGst = orderItems.reduce((s, i: any) => s + i.gstAmount, 0);

    const cartSubtotal = orderItems.reduce((s, i: any) => s + i.lineTotal, 0);
    const cartQuantity = orderItems.reduce((s, i: any) => s + i.quantity, 0);
    const deliveryDistrict = shippingAddress?.city;
    // Which store owns each line (read from the product itself): a vendor's offer only discounts that vendor's own items.
    const offerItems: OfferCartItem[] = orderItems.map((item: any) => {
      const product: any = productMap.get(String(item.productId));
      return {
        productId: String(item.productId),
        vendor: product?.vendor ? String(product.vendor) : null,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      };
    });

    const scratchResolution = await resolveAppliedOffer({
      couponId: scratchCouponId,
      district: deliveryDistrict,
      totalQuantity: cartQuantity,
      orderAmount: cartSubtotal,
      items: offerItems,
    });
    if (scratchCouponId && scratchResolution.error) {
      return sendError(res, scratchResolution.error, 400);
    }

    const promoResolution = coupon?.couponId
      ? await resolveAppliedOffer({
        couponId: coupon.couponId,
        district: deliveryDistrict,
        totalQuantity: cartQuantity,
        orderAmount: cartSubtotal,
        items: offerItems,
      })
      : { coupon: null as any, scratchReward: null, freeDelivery: false, discountAmount: 0, error: null as string | null };
    if (promoResolution.error) {
      return sendError(res, promoResolution.error, 400);
    }

    let scratchReward = scratchResolution.scratchReward;

    // Default 3% scratch card: only valid while the admin has no live scratch card offer (a vendor's own scratch card doesn't switch it off).
    if (!scratchReward && scratchDefault && !scratchCouponId) {
      const liveOffers = await getActiveOfferCoupons();
      if (await hasLiveAdminScratchOffer(liveOffers)) {
        return sendError(res, 'The scratch card offer has changed. Please refresh checkout and try again.', 400);
      }
      scratchReward = buildDefaultScratchReward(cartSubtotal);
    }
    const resolvedScratchDiscount = scratchReward?.discountAmount ?? 0;
    // SECURITY: a discount only exists when the SERVER resolved a real offer for it. A free-text `promoDiscount`
    // sent by the browser is ignored.
    const resolvedPromoDiscount = promoResolution.coupon ? promoResolution.discountAmount : 0;

    // Delivery is free only when the server itself finds a live free-delivery offer (coupon or district offer);
    // otherwise it must be one of the delivery options the checkout page really offers.
    const freeDeliveryOffer = resolveFreeDeliveryOffer(
      await filterOffersForCart(await getActiveOfferCoupons(), offerItems),
      deliveryDistrict,
    );
    const isFreeDelivery = promoResolution.freeDelivery || !!freeDeliveryOffer?.districtMatched;
    const requestedShipping = Math.max(Number(shippingCharges) || 0, 0);
    const resolvedShipping = isFreeDelivery
      ? 0
      : (ALLOWED_SHIPPING_CHARGES as readonly number[]).includes(requestedShipping)
        ? requestedShipping
        : ALLOWED_SHIPPING_CHARGES[0];

    const serverDiscount = resolvedScratchDiscount + resolvedPromoDiscount;
    // Same total the checkout page shows and has always charged: items + delivery - discounts (GST is recorded
    // on the order but, as before, not added on top).
    const payableAmount = Math.round(Math.max(cartSubtotal + resolvedShipping - serverDiscount, 0));

    // The total the customer saw must match the server's own total, otherwise the cart or offer is stale or was tampered with.
    if (Math.abs(Math.round(amount) - payableAmount) > 2) {
      return sendError(res, 'The order total has changed. Please refresh the page and try again.', 400);
    }

    if (payableAmount < 1) {
      return sendError(res, 'The applied offer covers the entire order amount. Please remove the offer to continue.', 400);
    }

    const order = await Order.create({
      orderId: generateOrderId(),
      userId,
      customerName: shippingAddress?.fullName || 'Customer',
      items: orderItems,
      shippingAddress: mapAddressForDb(shippingAddress),
      billingAddress: mapAddressForDb(shippingAddress),
      shippingMethod: 'standard',
      shippingAmount: resolvedShipping,
      subtotal: cartSubtotal,
      totalDiscount: serverDiscount,
      scratchDiscount: scratchReward
        ? {
          discountType: scratchReward.discountType,
          discountValue: scratchReward.discountValue,
          discountAmount: scratchReward.discountAmount,
          label: scratchReward.label,
        }
        : null,
      promoDiscount: promoResolution.coupon
        ? {
          code: promoResolution.coupon.code,
          discountType: promoResolution.coupon.discountType,
          discountValue: promoResolution.coupon.discountValue,
          discountAmount: resolvedPromoDiscount,
          description: promoResolution.coupon.description,
        }
        : promoCode
          ? { code: promoCode, discountAmount: resolvedPromoDiscount }
          : null,
      cgst: Math.round(totalGst / 2),
      sgst: Math.round(totalGst / 2),
      igst: 0,
      totalGst,
      orderTotal: payableAmount,
      totalAmount: payableAmount,
      couponCode: promoResolution.coupon?.code,
      couponId: promoResolution.coupon?._id,
      scratchCouponId: scratchReward?.couponId || undefined,
      paymentStatus: 'Pending',
      paymentMethod: 'razorpay',
      orderStatus: 'Pending Approval',
      status: 'pending_approval',
      statusHistory: [{ status: 'pending_approval', changedBy: userId }],
      invoiceNumber: generateInvoiceNumber(),
    } as any);

    if (coupon?.couponId) {
      try {
        await Coupon.findByIdAndUpdate(coupon.couponId, { $inc: { usedCount: 1 } });
      } catch (couponErr: any) {
        console.error(`[CREATE DIRECT PAYMENT] Failed to increment coupon usedCount for ${coupon.couponId}:`, couponErr?.message || couponErr);
      }
    }

    if (scratchCouponId && String(scratchCouponId) !== String(coupon?.couponId || '')) {
      try {
        await Coupon.findByIdAndUpdate(scratchCouponId, { $inc: { usedCount: 1 } });
      } catch (scratchErr: any) {
        console.error(`[CREATE DIRECT PAYMENT] Failed to increment scratch offer usedCount for ${scratchCouponId}:`, scratchErr?.message || scratchErr);
      }
    }

    const razorpayOrder = await createRazorpayOrder(payableAmount, currency, `ord_${order._id}`);

    const payment = await Payment.create({
      userId,
      orderId: order._id,
      razorpayOrderId: razorpayOrder.id,
      amount: payableAmount,
      currency: currency || 'INR',
      status: 'created',
    });

    sendSuccess(res, {
      data: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt,
        key: process.env.RAZORPAY_KEY_ID,
        paymentDbId: payment._id,
        orderDbId: order._id,
        orderId: order.orderId,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      return sendError(res, 'Authentication required', 401);
    }

    const validation = verifyPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400, validation.error.issues);
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = validation.data;

    // SECURITY: the payment being verified must belong to THIS user AND to THIS order. Without this, a valid
    // signature for a cheap payment could be replayed against any other order id to mark that order as paid.
    const existing = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (
      !existing ||
      existing.userId.toString() !== req.user.userId ||
      existing.orderId.toString() !== String(orderId)
    ) {
      return sendError(res, 'Payment verification failed', 400);
    }

    const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      // A bad signature can only fail the owner's own, still-unpaid payment and order.
      if (existing.status !== 'captured') {
        await Payment.updateOne({ _id: existing._id }, { status: 'failed', failureReason: 'Signature verification failed' });
        await Order.updateOne(
          { _id: orderId, userId: existing.userId, paymentStatus: { $ne: 'Paid' } },
          { orderStatus: 'Cancelled', status: 'cancelled', paymentStatus: 'Failed' }
        );
      }
      return sendError(res, 'Payment verification failed', 400);
    }

    // Replay protection: a payment that is already captured is never processed (or stock-reserved) twice.
    if (existing.status === 'captured') {
      return sendSuccess(res, { data: existing, message: 'Payment already verified' });
    }

    // The amount that was really paid must cover this order's total.
    const orderToPay = await Order.findById(orderId);
    if (!orderToPay || orderToPay.userId.toString() !== req.user.userId) {
      return sendError(res, 'Order not found', 404);
    }
    const orderTotalToPay = Math.round(Number(orderToPay.totalAmount ?? orderToPay.orderTotal ?? 0));
    if (Math.round(existing.amount) < orderTotalToPay) {
      console.error(`[VERIFY PAYMENT] Amount mismatch for order ${orderId}: paid ${existing.amount}, order total ${orderTotalToPay}`);
      return sendError(res, 'The amount paid does not match the order total. Please contact support.', 400);
    }

    // Claim the payment atomically, so two simultaneous requests cannot both process it.
    const payment = await Payment.findOneAndUpdate(
      { _id: existing._id, status: { $in: ['created', 'attempted', 'failed'] } },
      {
        status: 'captured',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
      },
      { new: true }
    );
    if (!payment) {
      return sendSuccess(res, { data: existing, message: 'Payment already verified' });
    }

    const order = await Order.findByIdAndUpdate(orderId, {
      paymentStatus: 'Paid',
      status: 'pending_approval',
      orderStatus: 'Pending Approval',
      paidAt: new Date(),
    }, { new: true });

    if (order) {
      for (const item of order.items) {
        if (item.productId) {
          try {
            await reserveStock(item.productId, item.quantity, item.variantSize, `payment_${order._id}`);
          } catch (stockErr: any) {
            console.error(`[VERIFY PAYMENT] reserveStock failed for product ${item.productId}:`, stockErr?.message || stockErr);
          }
        }
      }

      // Analytics and stock-commit moved to order.controller.ts
      // updateOrderStatus (the 'accepted' transition) — stock must NOT
      // change on payment, only when the seller confirms the order.
    }

    sendSuccess(res, { data: payment, message: 'Payment verified successfully' });
  } catch (error) {
    next(error);
  }
};

export const initiateRefund = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isAdmin) {
      return sendError(res, 'Admin access required', 403);
    }

    const validation = refundPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400, validation.error.issues);
    }

    const { paymentId, amount, reason } = validation.data;

    const payment = await Payment.findById(paymentId);
    if (!payment) return sendError(res, 'Payment not found', 404);
    if (payment.status !== 'captured') {
      return sendError(res, `Payment is in ${payment.status} status, cannot refund`, 400);
    }

    const refund = await createRefund(payment.razorpayPaymentId!, amount);

    payment.status = 'refunded';
    payment.refundId = refund.id;
    payment.refundAmount = amount || payment.amount;
    payment.refundReason = reason;
    payment.refundedAt = new Date();
    await payment.save();

    const order = await Order.findById(payment.orderId);
    if (order) {
      const wasApproved = APPROVED_ORDER_STATUSES.includes(order.status);
      if (wasApproved || order.paymentMethod === 'cod') {
        const refundAmt = amount || payment.amount || order.totalAmount || order.orderTotal || 0;
        await logAnalyticsEvent(
          order._id,
          order.orderId,
          order.shippingAddress?.state || 'Unknown',
          'order_refunded',
          order.status,
          'refunded',
          -refundAmt,
          req.user?.userId
        );
      }
      order.paymentStatus = 'Refunded';
      order.status = 'refunded';
      await order.save();
    }

    sendSuccess(res, { data: payment, message: 'Refund initiated' });
  } catch (error) {
    next(error);
  }
};

export const getPaymentById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      return sendError(res, 'Authentication required', 401);
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) return sendError(res, 'Payment not found', 404);

    if (payment.userId.toString() !== req.user.userId && !req.user.isAdmin) {
      return sendError(res, 'Not authorized', 403);
    }

    sendSuccess(res, { data: payment });
  } catch (error) {
    next(error);
  }
};

export const getPaymentByOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.userId) {
      return sendError(res, 'Authentication required', 401);
    }

    const payment = await Payment.findOne({ orderId: req.params.orderId });
    if (!payment) return sendError(res, 'Payment not found for this order', 404);

    if (payment.userId.toString() !== req.user.userId && !req.user.isAdmin) {
      return sendError(res, 'Not authorized', 403);
    }

    sendSuccess(res, { data: payment });
  } catch (error) {
    next(error);
  }
};

export const handleWebhook = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

    // Fail closed: without a configured secret nobody can prove that a request really came from Razorpay.
    if (!secret) {
      console.error('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not set - rejecting the webhook');
      return res.status(503).json({ success: false, message: 'Webhook is not configured' });
    }

    // The signature covers the exact bytes Razorpay sent, so it is checked against the RAW body
    // (server.ts mounts express.raw() for this route), never against re-serialised JSON.
    const rawBody: Buffer | undefined = Buffer.isBuffer(req.body) ? req.body : undefined;
    if (!rawBody || !verifyWebhookSignature(rawBody, signature, secret)) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload' });
    }

    const event = body.event;
    const payload = body.payload;

    switch (event) {
      case 'payment.captured': {
        const paymentData = payload.payment.entity;
        await Payment.findOneAndUpdate(
          { razorpayPaymentId: paymentData.id },
          {
            status: 'captured',
            amount: paymentData.amount / 100,
            method: paymentData.method,
            paidAt: new Date(paymentData.created_at * 1000),
            bank: paymentData.bank,
            wallet: paymentData.wallet,
            vpa: paymentData.vpa,
          }
        );
        break;
      }

      case 'payment.failed': {
        const failedPayment = payload.payment.entity;
        await Payment.findOneAndUpdate(
          { razorpayPaymentId: failedPayment.id },
          {
            status: 'failed',
            failureReason: failedPayment.error_description || 'Payment failed',
          }
        );
        break;
      }

      case 'refund.created': {
        const refundData = payload.refund.entity;
        const refundedPayment = await Payment.findOne({ razorpayPaymentId: refundData.payment_id });
        if (refundedPayment) {
          // Only a refund of the WHOLE payment closes it. A partial refund (e.g. one returned item) must leave
          // it 'captured' so the remaining amount can still be refunded later.
          refundedPayment.refundId = refundData.id;
          if (refundData.amount / 100 >= refundedPayment.amount - 0.5) refundedPayment.status = 'refunded';
          await refundedPayment.save();
        }
        break;
      }
    }

    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
};
