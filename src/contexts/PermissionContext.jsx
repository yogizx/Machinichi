import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../services/api';

const PermissionContext = createContext({
  permissions: [],
  role: '',
  loading: true,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  hasAllPermissions: () => false,
  refreshPermissions: async () => {},
});

export function PermissionProvider({ children }) {
  const [permissions, setPermissions] = useState([]);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setPermissions([]);
        setRole('');
        setLoading(false);
        return;
      }
      const { data } = await api.get('/admin/staff/my-permissions');
      if (data?.success) {
        setPermissions(data.data?.permissions || []);
        setRole(data.data?.role || '');
      }
    } catch (err) {
      console.error('[PERMISSIONS] Failed to load:', err);
      setPermissions([]);
      setRole('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback((key) => {
    if (role === 'super_admin' || role === 'admin') return true;
    return permissions.includes(key);
  }, [permissions, role]);

  const hasAnyPermission = useCallback((keys) => {
    if (role === 'super_admin' || role === 'admin') return true;
    return keys.some(k => permissions.includes(k));
  }, [permissions, role]);

  const hasAllPermissions = useCallback((keys) => {
    if (role === 'super_admin' || role === 'admin') return true;
    return keys.every(k => permissions.includes(k));
  }, [permissions, role]);

  return (
    <PermissionContext.Provider value={{
      permissions,
      role,
      loading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refreshPermissions: fetchPermissions,
    }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}

// No default export - use named exports only for fast refresh compatibility