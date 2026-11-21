import { useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";

// Template columns. The uploaded file must contain exactly these headers (same order).
export const BULK_TEMPLATE_HEADERS = [
  "Product Name*",
  "Category*",
  "Sub Category",
  "Brand",
  "Manufacturer",
  "HSN Code",
  "MRP*",
  "Selling Price*",
  "Cost Price",
  "Opening Stock",
  "Current Stock*",
  "Reserved Stock",
  "Warehouse",
  "Rack Location",
  "Batch Number",
  "Lot Number",
  "Serial Number",
  "Manufacturing Date (YYYY-MM-DD)",
  "Expiry Date (YYYY-MM-DD)",
  "Minimum Stock",
  "Maximum Stock",
  "Reorder Level",
  "Inventory Type",
  "Description",
];

const INVENTORY_TYPES = ["Normal", "Serialized", "Batch Managed", "Lot Managed", "Digital"];
const MAX_ROWS = 200;
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const INVALID_FILE_MESSAGE =
  "Invalid file. Only the Machinichi bulk upload template (.csv) with your data filled in is accepted. Please download the template, fill it and upload it again.";

// Small RFC-4180 style CSV parser (quotes, escaped quotes, CRLF, BOM).
function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

// Accepts YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY (Excel may reformat dates). Returns YYYY-MM-DD or null.
function normalizeDate(value) {
  const v = value.trim();
  if (!v) return "";
  let y;
  let m;
  let d;
  let match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [, y, m, d] = match;
  else {
    match = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!match) return null;
    [, d, m, y] = match;
  }
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(m) - 1 || dt.getDate() !== Number(d)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function BulkUploadModal({ api, categories, onClose, onDone }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [rows, setRows] = useState([]); // { line, payload, errors[] }
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // { created, failed: [{line,name,message}] }

  const topCategories = categories.filter((c) => !c.parentCategory);
  const hasErrors = rows.some((r) => r.errors.length > 0);

  const downloadTemplate = () => {
    const csv = `${BULK_TEMPLATE_HEADERS.map(csvCell).join(",")}\r\n`;
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "machinichi-inventory-bulk-upload-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFileName("");
    setFileError("");
    setRows([]);
    setResult(null);
    setProgress(0);
  };

  const buildRows = (dataRows) =>
    dataRows.map(({ line, cells }) => {
      const get = (i) => (cells[i] ?? "").trim();
      const errors = [];
      const name = get(0);
      if (!name) errors.push("Product Name is required");

      const catName = get(1);
      const category = categories.find((c) => !c.parentCategory && c.name.trim().toLowerCase() === catName.toLowerCase());
      if (!catName) errors.push("Category is required");
      else if (!category) errors.push(`Category "${catName}" does not exist`);

      const subName = get(2);
      let subCategory;
      if (subName) {
        subCategory = category
          ? categories.find((c) => c.parentCategory === category._id && c.name.trim().toLowerCase() === subName.toLowerCase())
          : undefined;
        if (category && !subCategory) errors.push(`Sub Category "${subName}" does not belong to "${category.name}"`);
      }

      const num = (idx, label, { required = false, integer = false } = {}) => {
        const raw = get(idx);
        if (raw === "") {
          if (required) errors.push(`${label} is required`);
          return undefined;
        }
        const n = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(n) || n < 0) {
          errors.push(`${label} must be a number of 0 or more`);
          return undefined;
        }
        if (integer && !Number.isInteger(n)) {
          errors.push(`${label} must be a whole number`);
          return undefined;
        }
        return n;
      };

      const mrp = num(6, "MRP", { required: true });
      const selling = num(7, "Selling Price", { required: true });
      const cost = num(8, "Cost Price");
      const opening = num(9, "Opening Stock", { integer: true });
      const current = num(10, "Current Stock", { required: true, integer: true });
      const reserved = num(11, "Reserved Stock", { integer: true });
      const minStock = num(19, "Minimum Stock", { integer: true });
      const maxStock = num(20, "Maximum Stock", { integer: true });
      const reorder = num(21, "Reorder Level", { integer: true });

      if (current !== undefined && reserved !== undefined && reserved > current) errors.push("Reserved Stock cannot exceed Current Stock");
      if (minStock !== undefined && maxStock !== undefined && minStock > maxStock) errors.push("Maximum Stock must be ≥ Minimum Stock");

      const mfg = normalizeDate(get(17));
      const exp = normalizeDate(get(18));
      if (mfg === null) errors.push("Manufacturing Date must look like 2026-01-31");
      if (exp === null) errors.push("Expiry Date must look like 2026-12-31");
      if (mfg && exp && new Date(exp) <= new Date(mfg)) errors.push("Expiry Date must be after Manufacturing Date");

      const typeRaw = get(22);
      let inventoryType = "Normal";
      if (typeRaw) {
        const found = INVENTORY_TYPES.find((t) => t.toLowerCase() === typeRaw.toLowerCase());
        if (!found) errors.push(`Inventory Type must be one of: ${INVENTORY_TYPES.join(", ")}`);
        else inventoryType = found;
      }

      const payload = {
        name,
        hsnCode: get(5) || "0000",
        brand: get(3) || "",
        description: get(23) || "",
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        category: category?._id,
        subCategory: subCategory?._id,
        manufacturerName: get(4) || undefined,
        mrpPrice: mrp ?? 0,
        sellingPrice: selling ?? 0,
        costPrice: cost ?? 0,
        unitType: "Kilogram",
        images: [],
        tags: category ? [category.name.toLowerCase()] : [],
        openingStock: opening ?? 0,
        quantity: current ?? 0,
        reservedQuantity: reserved ?? 0,
        warehouse: get(12) || undefined,
        rackLocation: get(13) || undefined,
        batchNumber: get(14) || undefined,
        lotNumber: get(15) || undefined,
        serialNumber: get(16) || undefined,
        manufacturingDate: mfg || undefined,
        expiryDate: exp || undefined,
        minStock: minStock ?? 5,
        maxStock,
        reorderLevel: reorder,
        lowStockThreshold: reorder ?? 10,
        inventoryType,
      };
      return { line, payload, errors };
    });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    reset();
    setFileName(file.name);

    const isCsv = /\.csv$/i.test(file.name);
    const okMime = !file.type || ["text/csv", "application/vnd.ms-excel", "text/plain"].includes(file.type);
    if (!isCsv || !okMime) {
      setFileError(INVALID_FILE_MESSAGE);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("File is too large. Maximum size is 2 MB.");
      return;
    }

    let text;
    try {
      text = await file.text();
    } catch {
      setFileError("Could not read the file. Please try again.");
      return;
    }
    if (text.includes("\u0000")) {
      setFileError(INVALID_FILE_MESSAGE);
      return;
    }

    const parsed = parseCsv(text);
    const header = (parsed[0] || []).map((h) => h.trim().toLowerCase());
    const expected = BULK_TEMPLATE_HEADERS.map((h) => h.toLowerCase());
    const headerMatches = header.length >= expected.length && expected.every((h, i) => header[i] === h);
    if (!headerMatches) {
      setFileError(INVALID_FILE_MESSAGE);
      return;
    }

    const dataRows = parsed
      .slice(1)
      .map((cells, idx) => ({ line: idx + 2, cells }))
      .filter(({ cells }) => cells.some((c) => String(c).trim() !== ""));

    if (dataRows.length === 0) {
      setFileError("The template has no data. Please enter your products in the template and upload it again.");
      return;
    }
    if (dataRows.length > MAX_ROWS) {
      setFileError(`Too many rows. You can upload up to ${MAX_ROWS} products at a time (found ${dataRows.length}).`);
      return;
    }
    setRows(buildRows(dataRows));
  };

  const startImport = async () => {
    if (hasErrors || !rows.length) return;
    setImporting(true);
    setProgress(0);
    const failed = [];
    let created = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const { line, payload } = rows[i];
      try {
        await api.post("/admin/products", payload);
        created += 1;
      } catch (err) {
        const issues = err.response?.data?.errors;
        const message = Array.isArray(issues) && issues.length
          ? issues.map((it) => `${it.path?.length ? `${it.path.join(".")}: ` : ""}${it.message}`).join(" • ")
          : err.response?.data?.message || err.message || "Failed to create product";
        failed.push({ line, name: payload.name, message });
      }
      setProgress(i + 1);
    }
    setImporting(false);
    setResult({ created, failed });
    if (created > 0) onDone?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#21150f]/50 px-4 py-6 backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !importing) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#efe5dc] bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[#f5eee8] bg-[#faf7f4] px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-[17px] font-black text-[#3a1100]">
              <FileSpreadsheet size={16} className="text-[#fd761a]" /> Bulk Upload Products
            </h2>
            <p className="mt-0.5 text-[11px] font-bold uppercase text-[#9a8b82]">Download the template → fill it → upload it</p>
          </div>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#efe5dc] text-gray-400 hover:text-gray-600 disabled:opacity-40"
            disabled={importing}
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto bg-[#faf9f6]/40 p-6">
          {result ? (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${result.failed.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                {result.failed.length ? <AlertTriangle size={18} className="mt-0.5 text-amber-600" /> : <CheckCircle2 size={18} className="mt-0.5 text-emerald-600" />}
                <div className="text-[13px] font-bold text-[#3a1100]">
                  {result.created} product{result.created === 1 ? "" : "s"} added to inventory
                  {result.failed.length ? `, ${result.failed.length} failed.` : "."}
                </div>
              </div>
              {result.failed.length ? (
                <ul className="space-y-1.5 rounded-xl border border-rose-100 bg-rose-50/60 p-4 text-[12px] font-semibold text-rose-700">
                  {result.failed.map((f) => (
                    <li key={f.line}>Row {f.line} ({f.name}): {f.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[#efe5dc] bg-white p-5">
                  <p className="text-[11px] font-black uppercase tracking-wider text-[#9a8b82]">Step 1</p>
                  <h3 className="mt-1 text-[14px] font-black text-[#3a1100]">Download the template</h3>
                  <p className="mt-1 text-[12px] font-semibold text-[#796d66]">
                    Columns marked * are required. Category names must match your existing categories. Dates: YYYY-MM-DD.
                  </p>
                  <button
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#3a1100] px-4 text-[12px] font-black text-white transition hover:bg-[#fd761a]"
                    onClick={downloadTemplate}
                    type="button"
                  >
                    <Download size={14} /> Download Template
                  </button>
                </div>
                <div className="rounded-xl border border-[#efe5dc] bg-white p-5">
                  <p className="text-[11px] font-black uppercase tracking-wider text-[#9a8b82]">Step 2</p>
                  <h3 className="mt-1 text-[14px] font-black text-[#3a1100]">Upload the filled template</h3>
                  <p className="mt-1 text-[12px] font-semibold text-[#796d66]">Only the downloaded template (.csv) containing your data is accepted. Max {MAX_ROWS} products.</p>
                  <input accept=".csv,text/csv" className="hidden" onChange={handleFile} ref={fileRef} type="file" />
                  <button
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-[#fd761a] bg-white px-4 text-[12px] font-black text-[#fd761a] transition hover:bg-[#fff2ee] disabled:opacity-50"
                    disabled={importing}
                    onClick={() => fileRef.current?.click()}
                    type="button"
                  >
                    <Upload size={14} /> {fileName ? "Choose another file" : "Choose File"}
                  </button>
                  {fileName ? <p className="mt-2 break-all text-[11px] font-bold text-[#5c514b]">{fileName}</p> : null}
                </div>
              </div>

              {topCategories.length ? (
                <p className="text-[11px] font-semibold text-[#9a8b82]">
                  Valid categories: {topCategories.map((c) => c.name).join(", ")}
                </p>
              ) : null}

              {fileError ? (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] font-bold text-rose-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{fileError}</span>
                </div>
              ) : null}

              {rows.length ? (
                <div className="overflow-hidden rounded-xl border border-[#efe5dc] bg-white">
                  <div className="flex items-center justify-between border-b border-[#f5eee8] bg-[#faf8f5] px-4 py-3 text-[12px] font-black text-[#3a1100]">
                    <span>{rows.length} row{rows.length === 1 ? "" : "s"} found</span>
                    {hasErrors ? (
                      <span className="text-rose-600">Fix the highlighted rows in your file and upload it again</span>
                    ) : (
                      <span className="text-emerald-600">All rows are valid</span>
                    )}
                  </div>
                  <div className="max-h-[320px] overflow-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead className="sticky top-0 bg-white text-[10px] font-black uppercase tracking-wider text-[#9a8b82]">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">MRP / Price</th>
                          <th className="px-3 py-2">Stock</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f5eee8]">
                        {rows.map((r) => (
                          <tr key={r.line} className={r.errors.length ? "bg-rose-50/50" : ""}>
                            <td className="px-3 py-2 font-bold text-[#796d66]">{r.line}</td>
                            <td className="px-3 py-2 font-bold text-[#3a1100]">{r.payload.name || "—"}</td>
                            <td className="px-3 py-2 text-[#5c514b]">₹{r.payload.mrpPrice} / ₹{r.payload.sellingPrice}</td>
                            <td className="px-3 py-2 text-[#5c514b]">{r.payload.quantity}</td>
                            <td className="px-3 py-2">
                              {r.errors.length ? (
                                <ul className="list-disc space-y-0.5 pl-4 font-semibold text-rose-600">
                                  {r.errors.map((er) => (
                                    <li key={er}>{er}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-black text-emerald-600">
                                  <Check size={12} /> Valid
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#f5eee8] bg-[#faf7f4] px-6 py-4">
          <button
            className="h-10 rounded-xl border border-[#efe5dc] bg-white px-5 text-[12px] font-black text-[#5c514b] disabled:opacity-50"
            disabled={importing}
            onClick={onClose}
            type="button"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {result ? (
            <button className="h-10 rounded-xl bg-[#3a1100] px-5 text-[12px] font-black text-white hover:bg-[#fd761a]" onClick={reset} type="button">
              Upload Another File
            </button>
          ) : (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#3a1100] px-6 text-[12px] font-black text-white hover:bg-[#fd761a] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!rows.length || hasErrors || importing}
              onClick={startImport}
              type="button"
            >
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {importing ? `Importing ${progress}/${rows.length}…` : `Import ${rows.length || ""} Product${rows.length === 1 ? "" : "s"}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
