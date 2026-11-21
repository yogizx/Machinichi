import { useEffect, useState } from 'react';

import { Plus, Search, Shield, Users, MoreVertical, Edit, Trash2, CheckCircle, XCircle, Clock, X } from 'lucide-react';
import api from '../../services/api';
import AdminLayout from '../components/AdminLayout';
import { usePermissions } from '../../contexts/PermissionContext';

const statusColors = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending_invitation: 'bg-amber-50 text-amber-700 border-amber-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
  revoked: 'bg-gray-50 text-gray-700 border-gray-200',
};

const statusLabels = {
  active: 'Active',
  pending_invitation: 'Pending',
  suspended: 'Suspended',
  revoked: 'Revoked',
};

export default function SubAdminManagement() {
  const { hasPermission } = usePermissions();
  const [subAdmins, setSubAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [roles, setRoles] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Stats
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, suspended: 0 });

  const fetchSubAdmins = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (roleFilter) params.set('role', roleFilter);
      const { data } = await api.get(`/admin/staff/sub-admins?${params}`);
      if (data?.success) {
        setSubAdmins(data.data || []);
        const all = data.data || [];
        setStats({
          total: data.total || all.length,
          active: all.filter((u) => u.accountStatus === 'active').length,
          pending: all.filter((u) => u.accountStatus === 'pending_invitation').length,
          suspended: all.filter((u) => u.accountStatus === 'suspended').length,
        });
      }
    } catch (err) {
      console.error('Failed to fetch sub-admins:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const { data } = await api.get('/admin/staff/roles');
      if (data?.success) setRoles(data.data || []);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  };

  useEffect(() => {
    fetchSubAdmins();
    fetchRoles();
  }, [search, statusFilter, roleFilter]);

  const canCreate = hasPermission('admin.create');
  const canEdit = hasPermission('admin.edit');
  const canDelete = hasPermission('admin.delete');

  return (
    <AdminLayout onAdminLogout={() => {}}>
      <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[28px] font-black text-[#27201c] tracking-[-0.02em]">Sub-Admin Management</h1>
          <p className="mt-1 text-[14px] text-[#796d66]">Manage sub-admin accounts, roles, and permissions</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#fd761a] px-6 text-[13px] font-black text-white shadow-[0_10px_22px_rgba(253,118,26,0.25)] transition hover:-translate-y-0.5"
          >
            <Plus size={16} strokeWidth={2.5} /> Create Sub-Admin
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-[12px] border border-[#eadfd7] bg-white p-5 shadow-[0_4px_12px_rgba(65,38,20,0.06)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff8f1] text-[#fd761a]">
              <Users size={18} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[24px] font-black text-[#27201c]">{stats.total}</p>
              <p className="text-[12px] text-[#796d66]">Total Sub-Admins</p>
            </div>
          </div>
        </div>
        <div className="rounded-[12px] border border-[#eadfd7] bg-white p-5 shadow-[0_4px_12px_rgba(65,38,20,0.06)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle size={18} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[24px] font-black text-[#27201c]">{stats.active}</p>
              <p className="text-[12px] text-[#796d66]">Active Accounts</p>
            </div>
          </div>
        </div>
        <div className="rounded-[12px] border border-[#eadfd7] bg-white p-5 shadow-[0_4px_12px_rgba(65,38,20,0.06)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Clock size={18} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[24px] font-black text-[#27201c]">{stats.pending}</p>
              <p className="text-[12px] text-[#796d66]">Pending Invitations</p>
            </div>
          </div>
        </div>
        <div className="rounded-[12px] border border-[#eadfd7] bg-white p-5 shadow-[0_4px_12px_rgba(65,38,20,0.06)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <XCircle size={18} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[24px] font-black text-[#27201c]">{stats.suspended}</p>
              <p className="text-[12px] text-[#796d66]">Suspended Accounts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#988b84]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-[10px] border border-[#eadfd7] bg-white pl-10 pr-4 py-2.5 text-[14px] text-[#27201c] outline-none focus:border-[#fd761a] focus:shadow-[0_0_0_4px_rgba(253,118,26,0.1)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-[10px] border border-[#eadfd7] bg-white px-4 py-2.5 text-[14px] text-[#27201c] outline-none focus:border-[#fd761a]"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending_invitation">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="revoked">Revoked</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-[10px] border border-[#eadfd7] bg-white px-4 py-2.5 text-[14px] text-[#27201c] outline-none focus:border-[#fd761a]"
        >
          <option value="">All Roles</option>
          {roles.map((r) => (
            <option key={r._id} value={r._id}>{r.roleName}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-[12px] border border-[#eadfd7] bg-white shadow-[0_4px_12px_rgba(65,38,20,0.06)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#eadfd7] border-t-[#fd761a]" />
          </div>
        ) : subAdmins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={40} className="text-[#c7bab0] mb-3" />
            <p className="text-[14px] font-medium text-[#796d66]">No sub-admins found</p>
            {canCreate && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#fd761a] px-5 text-[13px] font-black text-white"
              >
                <Plus size={14} /> Create First Sub-Admin
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eadfd7] bg-[#fffaf5]">
                  <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-wider text-[#796d66]">Name</th>
                  <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-wider text-[#796d66]">Email</th>
                  <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-wider text-[#796d66]">Role</th>
                  <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-wider text-[#796d66]">Status</th>
                  <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-wider text-[#796d66]">Created</th>
                  <th className="px-4 py-3 text-right text-[12px] font-black uppercase tracking-wider text-[#796d66]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subAdmins.map((user) => (
                  <tr key={user._id} className="border-b border-[#eadfd7] last:border-0 hover:bg-[#fffaf5] transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fd761a]/10 text-[#fd761a] font-black text-[13px]">
                          {user.fullName?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-[#27201c]">{user.fullName}</p>
                          <p className="text-[12px] text-[#988b84]">{user.phone || 'No phone'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[14px] text-[#27201c]">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff8f1] px-2.5 py-1 text-[12px] font-bold text-[#ad4d00]">
                        <Shield size={12} /> {user.roleId?.roleName || 'No Role'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusColors[user.accountStatus] || statusColors.active}`}>
                        {statusLabels[user.accountStatus] || 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#796d66]">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button className="flex h-8 w-8 items-center justify-center rounded-full text-[#796d66] transition hover:bg-[#fff8f1] hover:text-[#fd761a]" title="Edit">
                            <Edit size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button className="flex h-8 w-8 items-center justify-center rounded-full text-[#796d66] transition hover:bg-red-50 hover:text-red-600" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        )}
                        <button className="flex h-8 w-8 items-center justify-center rounded-full text-[#796d66] transition hover:bg-[#fff8f1] hover:text-[#fd761a]" title="More">
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-[16px] bg-white p-6 shadow-[0_24px_60px_rgba(25,12,6,0.28)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[20px] font-black text-[#27201c]">Create Sub-Admin</h2>
              <button onClick={() => setShowCreateModal(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-[#796d66] hover:bg-[#fff8f1]">
                <X size={18} />
              </button>
            </div>
            <p className="text-[14px] text-[#796d66] mb-6">Sub-admin creation form will be implemented here.</p>
            <div className="flex justify-end">
              <button onClick={() => setShowCreateModal(false)} className="h-10 rounded-full bg-[#fd761a] px-6 text-[13px] font-black text-white">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AdminLayout>
  );
}