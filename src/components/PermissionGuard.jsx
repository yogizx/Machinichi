import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions } from '../contexts/PermissionContext';

/**
 * PermissionGuard - Protects routes based on required permissions.
 *
 * Usage:
 *   <PermissionGuard permission="product.view">
 *     <ProductListing />
 *   </PermissionGuard>
 *
 *   <PermissionGuard permissions={['product.view', 'product.edit']} requireAll>
 *     <ProductEditor />
 *   </PermissionGuard>
 */
export default function PermissionGuard({ children, permission, permissions, requireAll = false }) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = usePermissions();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf5]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#eadfd7] border-t-[#fd761a]" />
          <p className="text-sm font-medium text-[#796d66]">Loading permissions...</p>
        </div>
      </div>
    );
  }

  // Check permissions
  let allowed = true;
  if (permission) {
    allowed = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    allowed = requireAll ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
  }

  if (!allowed) {
    // Redirect to unauthorized page
    return <Navigate to="/admin/unauthorized" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/**
 * AdminRouteGuard - Ensures user is an admin before rendering admin routes.
 */
export function AdminRouteGuard({ children }) {
  const { role, loading } = usePermissions();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf5]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#eadfd7] border-t-[#fd761a]" />
          <p className="text-sm font-medium text-[#796d66]">Loading...</p>
        </div>
      </div>
    );
  }

  const isAdmin = role === 'admin' || role === 'super_admin' || role === 'sub_admin';
  if (!isAdmin) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}