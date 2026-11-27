import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions } from '../contexts/PermissionContext';
import { findRule, isAllowed } from '../config/adminAccess';
import Unauthorized from '../pages/Unauthorized';

function Spinner({ label = 'Loading permissions...' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fffaf5]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#eadfd7] border-t-[#fd761a]" />
        <p className="text-sm font-medium text-[#796d66]">{label}</p>
      </div>
    </div>
  );
}

/**
 * RequireAccess - route guard driven by the central access map (config/adminAccess.js).
 *
 *   <Route path="/admin/orders" element={<RequireAccess path="/admin/orders"><AdminOrders /></RequireAccess>} />
 *
 * While permissions are loading nothing renders. If access is not granted the protected component is NEVER
 * mounted (so it cannot fetch data) and a 403 page is shown instead. A path without a rule is denied.
 * This is a UX layer: the backend enforces the same permissions independently on every API call.
 */
export function RequireAccess({ path, children }) {
  const { hasAnyPermission, loading } = usePermissions();
  if (loading) return <Spinner />;
  if (!isAllowed(findRule(path), hasAnyPermission)) return <Unauthorized />;
  return <>{children}</>;
}

/**
 * PermissionGuard - protects a component by explicit permission(s).
 *
 *   <PermissionGuard permission="product.view"><ProductListing /></PermissionGuard>
 *   <PermissionGuard permissions={['a', 'b']} requireAll>...</PermissionGuard>
 */
export default function PermissionGuard({ children, permission, permissions, requireAll = false }) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = usePermissions();

  if (loading) return <Spinner />;

  let allowed = false; // deny by default: a guard with no requirement protects nothing
  if (permission) {
    allowed = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    allowed = requireAll ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
  }

  if (!allowed) return <Unauthorized />;
  return <>{children}</>;
}

/** AdminRouteGuard - ensures the user is signed in as staff before rendering admin routes. */
export function AdminRouteGuard({ children }) {
  const { role, loading } = usePermissions();
  const location = useLocation();

  if (loading) return <Spinner label="Loading..." />;

  const isStaff = role === 'admin' || role === 'super_admin' || role === 'sub_admin';
  if (!isStaff) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
