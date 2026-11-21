import { useEffect, useState } from 'react';
import { Plus, Shield, Edit, Trash2, Lock, X } from 'lucide-react';
import api from '../../services/api';
import AdminLayout from '../components/AdminLayout';
import { usePermissions } from '../../contexts/PermissionContext';

export default function RoleManagement() {
  const { hasPermission } = usePermissions();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/staff/roles');
      if (data?.success) setRoles(data.data || []);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const { data } = await api.post('/admin/staff/roles', {
        roleName: newRoleName.trim(),
        description: newRoleDesc.trim(),
      });
      if (data?.success) {
        setNewRoleName('');
        setNewRoleDesc('');
        setShowCreateModal(false);
        fetchRoles();
      }
    } catch (err) {
      console.error('Failed to create role:', err);
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    try {
      const { data } = await api.delete(`/admin/staff/roles/${roleId}`);
      if (data?.success) fetchRoles();
    } catch (err) {
      console.error('Failed to delete role:', err);
      alert(err?.response?.data?.message || 'Failed to delete role');
    }
  };

  const canCreate = hasPermission('admin.role.create');
  const canEdit = hasPermission('admin.role.edit');
  const canDelete = hasPermission('admin.role.delete');

  return (
    <AdminLayout onAdminLogout={() => {}}>
      <div className="p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[28px] font-black text-[#27201c] tracking-[-0.02em]">Roles & Permissions</h1>
          <p className="mt-1 text-[14px] text-[#796d66]">Create and manage roles with granular permissions</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#fd761a] px-6 text-[13px] font-black text-white shadow-[0_10px_22px_rgba(253,118,26,0.25)] transition hover:-translate-y-0.5"
          >
            <Plus size={16} strokeWidth={2.5} /> Create Role
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#eadfd7] border-t-[#fd761a]" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <div key={role._id} className="rounded-[12px] border border-[#eadfd7] bg-white p-5 shadow-[0_4px_12px_rgba(65,38,20,0.06)]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fd761a]/10 text-[#fd761a]">
                    <Shield size={16} strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-black text-[#27201c]">{role.roleName}</h3>
                    <p className="text-[12px] text-[#796d66]">{role.userCount || 0} users</p>
                  </div>
                </div>
                {role.isSystemRole && (
                  <span className="rounded-full bg-[#fff8f1] px-2 py-0.5 text-[10px] font-black text-[#ad4d00] uppercase">System</span>
                )}
              </div>
              <p className="text-[13px] text-[#796d66] mb-4 line-clamp-2">{role.description || 'No description'}</p>
              <div className="flex items-center gap-2 text-[12px] text-[#988b84] mb-4">
                <Lock size={12} /> {role.permissionCount || 0} permissions
              </div>
              <div className="flex items-center gap-2">
                {canEdit && !role.isSuperAdminRole && (
                  <button className="flex-1 h-9 rounded-full border border-[#eadfd7] text-[12px] font-bold text-[#796d66] transition hover:border-[#fd761a] hover:text-[#fd761a]">
                    <Edit size={12} className="inline mr-1" /> Edit
                  </button>
                )}
                {canDelete && !role.isSystemRole && !role.isSuperAdminRole && (
                  <button
                    onClick={() => handleDeleteRole(role._id)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#eadfd7] text-[#796d66] transition hover:border-red-300 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Role Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[16px] bg-white p-6 shadow-[0_24px_60px_rgba(25,12,6,0.28)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[20px] font-black text-[#27201c]">Create Role</h2>
              <button onClick={() => setShowCreateModal(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-[#796d66] hover:bg-[#fff8f1]">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-black uppercase tracking-[0.08em] text-[#8a7a70] mb-1.5">Role Name</label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Content Manager"
                  className="w-full rounded-[10px] border border-[#eadfd7] bg-white px-4 py-2.5 text-[14px] text-[#27201c] outline-none focus:border-[#fd761a]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-black uppercase tracking-[0.08em] text-[#8a7a70] mb-1.5">Description</label>
                <textarea
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Brief description of this role"
                  rows={3}
                  className="w-full rounded-[10px] border border-[#eadfd7] bg-white px-4 py-2.5 text-[14px] text-[#27201c] outline-none focus:border-[#fd761a] resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="h-10 rounded-full border border-[#eadfd7] px-5 text-[13px] font-bold text-[#796d66]">
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={!newRoleName.trim()}
                className="h-10 rounded-full bg-[#fd761a] px-6 text-[13px] font-black text-white disabled:opacity-50"
              >
                Create Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AdminLayout>
  );
}