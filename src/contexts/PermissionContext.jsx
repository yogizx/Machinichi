import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import { findRule, firstAccessiblePath, isAllowed } from '../config/adminAccess';

/**
 * Permission state for the admin panel.
 *
 * The permission list is fetched from the server (GET /admin/staff/my-permissions) - never read from local storage
 * or from the token - and refreshed:
 *   - every 60 seconds
 *   - when the browser tab regains focus
 *   - whenever the API answers 403 (the "permissions-stale" event from services/api.js)
 * so a change made by a Super Admin shows up in the navigation almost immediately.
 *
 * This only drives what the UI shows. The server decides what is actually allowed.
 */

const PermissionContext = createContext({
  permissions: [],
  role: '',
  roleName: '',
  fullName: '',
  isFullAdmin: false,
  loading: true,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  hasAllPermissions: () => false,
  canAccessPath: () => false,
  defaultRoute: '/admin/profile',
  refreshPermissions: async () => {},
});

const REFRESH_INTERVAL_MS = 60 * 1000;
const STALE_EVENT_COOLDOWN_MS = 5 * 1000;

export function PermissionProvider({ children }) {
  const [state, setState] = useState({
    permissions: [],
    role: '',
    roleName: '',
    fullName: '',
    isFullAdmin: false,
    version: 0,
  });
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef(0);

  const fetchPermissions = useCallback(async () => {
    lastFetchRef.current = Date.now();
    try {
      if (!localStorage.getItem('accessToken')) {
        setState((s) => ({ ...s, permissions: [], role: '', isFullAdmin: false }));
        return;
      }
      const { data } = await api.get('/admin/staff/my-permissions');
      if (data?.success && data.data) {
        setState({
          permissions: data.data.permissions || [],
          role: data.data.role || '',
          roleName: data.data.roleName || '',
          fullName: data.data.fullName || '',
          isFullAdmin: !!data.data.isFullAdmin,
          version: data.data.permissionVersion ?? 0,
        });
      }
    } catch (err) {
      // Deny by default: if the server cannot confirm access, nothing is unlocked.
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        setState((s) => ({ ...s, permissions: [], isFullAdmin: false }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
    const timer = setInterval(fetchPermissions, REFRESH_INTERVAL_MS);
    const onFocus = () => fetchPermissions();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchPermissions(); };
    const onStale = () => {
      if (Date.now() - lastFetchRef.current > STALE_EVENT_COOLDOWN_MS) fetchPermissions();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('permissions-stale', onStale);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('permissions-stale', onStale);
    };
  }, [fetchPermissions]);

  const value = useMemo(() => {
    const set = new Set(state.permissions);
    const full = state.isFullAdmin;
    const hasPermission = (key) => full || set.has(key);
    const hasAnyPermission = (keys) => full || (keys || []).some((k) => set.has(k));
    const hasAllPermissions = (keys) => full || (keys || []).every((k) => set.has(k));
    const canAccessPath = (path) => isAllowed(findRule(path), hasAnyPermission);
    return {
      permissions: state.permissions,
      role: state.role,
      roleName: state.roleName,
      fullName: state.fullName,
      isFullAdmin: full,
      loading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      canAccessPath,
      defaultRoute: firstAccessiblePath(hasAnyPermission),
      refreshPermissions: fetchPermissions,
    };
  }, [state, loading, fetchPermissions]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionContext);
}

// No default export - named exports only, for fast refresh compatibility
