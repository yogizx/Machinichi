import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Clock, KeyRound, LogOut, Mail, MoreVertical, Pencil, Plus, Search, ShieldOff, Trash2, UserCheck, UserPlus, Users, XCircle,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import {
  ConfirmDialog, ErrorBanner, Field, Modal, PageHeader, PrimaryButton, SecondaryButton, Spinner, SuccessBanner,
  apiErrorMessage, formatDate, inputClass,
} from '../components/StaffUi';
import { usePermissions } from '../../contexts/PermissionContext';
import api from '../../services/api';

const STATUS_META = {
  pending_invitation: { label: 'Pending Invitation', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  suspended: { label: 'Suspended', cls: 'bg-red-50 text-red-700 border-red-200' },
  revoked: { label: 'Revoked', cls: 'bg-stone-100 text-stone-600 border-stone-200' },
};

const toExpiryIso = (dateStr) => (dateStr ? new Date(`${dateStr}T23:59:59`).toISOString() : undefined);
const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

function StatCard({ icon: Icon, value, label, tint }) {
  return (
    <div className="flex items-center gap-4 rounded-[16px] border border-[#eadfd7] bg-white p-5 shadow-[0_10px_28px_rgba(80,40,10,0.05)]">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${tint}`}><Icon size={22} /></div>
      <div>
        <p className="text-[28px] font-black leading-none text-[#27201c]">{value}</p>
        <p className="mt-1 text-[13px] text-[#796d66]">{label}</p>
      </div>
    </div>
  );
}

export default function SubAdminManagement({ onAdminLogout, startCreating = false }) {
  const navigate = useNavigate();
  const { hasPermission, loading: permsLoading } = usePermissions();
  const can = {
    create: hasPermission('admin.create'),
    edit: hasPermission('admin.edit'),
    suspend: hasPermission('admin.suspend'),
    remove: hasPermission('admin.delete'),
    sessions: hasPermission('admin.session.revoke'),
  };

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending_invitation: 0, suspended: 0, revoked: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  const [menuFor, setMenuFor] = useState(null);
  const [form, setForm] = useState(null); // create / edit modal
  const [formError, setFormError] = useState('');
  const [action, setAction] = useState(null); // { type, row }
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuFor(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/staff/roles');
      setRoles((data?.data || []).filter((r) => !r.isSuperAdminRole));
    } catch { setRoles([]); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 15 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (roleFilter) params.role = roleFilter;
      const { data } = await api.get('/admin/staff/sub-admins', { params });
      setRows(data.data || []);
      setStats(data.stats || {});
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load sub-admins.'));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, roleFilter]);

  useEffect(() => { if (!permsLoading) load(); }, [permsLoading, load]);
  useEffect(() => { if (!permsLoading) loadRoles(); }, [permsLoading, loadRoles]);
  useEffect(() => { if (startCreating && can.create && !permsLoading) openCreate(); /* eslint-disable-next-line */ }, [startCreating, permsLoading]);

  const openCreate = () => {
    setFormError('');
    setForm({ mode: 'create', fullName: '', email: '', mobile: '', profileImage: '', roleId: '', accessExpiry: '' });
  };
  const openEdit = (row) => {
    setMenuFor(null);
    setFormError('');
    setForm({ mode: 'edit', row, fullName: row.fullName, mobile: row.mobile || '', roleId: row.roleId || '', accessExpiry: toDateInput(row.accessExpiry), profileImage: row.profileImage || '' });
  };
  const closeForm = () => { if (!busy) { setForm(null); if (startCreating) navigate('/admin/sub-admins', { replace: true }); } };

  const submitForm = async () => {
    setFormError('');
    if (form.fullName.trim().length < 2) return setFormError('Enter the full name.');
    if (form.mode === 'create' && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setFormError('Enter a valid e-mail address.');
    if (!form.roleId) return setFormError('Select a role.');
    if (form.accessExpiry && form.accessExpiry < tomorrow()) return setFormError('Access expiry must be a future date.');

    setBusy(true);
    try {
      if (form.mode === 'create') {
        const body = { fullName: form.fullName.trim(), email: form.email.trim().toLowerCase(), roleId: form.roleId };
        if (form.mobile.trim()) body.mobile = form.mobile.trim();
        if (form.profileImage.trim()) body.profileImage = form.profileImage.trim();
        if (form.accessExpiry) body.accessExpiry = toExpiryIso(form.accessExpiry);
        const { data } = await api.post('/admin/staff/sub-admins', body);
        setNotice(data.message || 'Invitation sent.');
        setInviteLink(data.inviteUrl || '');
      } else {
        const row = form.row;
        const body = {};
        if (form.fullName.trim() !== row.fullName) body.fullName = form.fullName.trim();
        if ((form.mobile.trim() || null) !== (row.mobile || null)) body.mobile = form.mobile.trim() || null;
        if ((form.profileImage.trim() || null) !== (row.profileImage || null)) body.profileImage = form.profileImage.trim() || null;
        if (form.roleId !== row.roleId) body.roleId = form.roleId;
        if (form.accessExpiry !== toDateInput(row.accessExpiry)) body.accessExpiry = form.accessExpiry ? toExpiryIso(form.accessExpiry) : null;
        if (Object.keys(body).length === 0) { setForm(null); return; }
        await api.put(`/admin/staff/sub-admins/${row._id}`, body);
        setNotice(body.roleId ? 'Sub-admin updated. The new role applies immediately.' : 'Sub-admin updated.');
        setInviteLink('');
      }
      setForm(null);
      if (startCreating) navigate('/admin/sub-admins', { replace: true });
      await load();
    } catch (err) {
      setFormError(apiErrorMessage(err, 'The change could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const ACTIONS = {
    suspend: { title: 'Suspend this account?', label: 'Suspend', danger: true, text: (r) => `${r.fullName} will be signed out immediately and cannot sign in until you reactivate the account.`, run: (r) => api.post(`/admin/staff/sub-admins/${r._id}/status`, { status: 'suspended' }), done: 'Account suspended.' },
    reactivate: { title: 'Reactivate this account?', label: 'Reactivate', text: (r) => `${r.fullName} will be able to sign in again with their existing password and authenticator.`, run: (r) => api.post(`/admin/staff/sub-admins/${r._id}/status`, { status: 'active' }), done: 'Account reactivated.' },
    revoke: { title: 'Revoke this account?', label: 'Revoke', danger: true, text: (r) => `${r.fullName}'s access is permanently revoked and all sessions end now. To give access again you must invite them anew.`, run: (r) => api.post(`/admin/staff/sub-admins/${r._id}/status`, { status: 'revoked' }), done: 'Access revoked.' },
    sessions: { title: 'Sign out everywhere?', label: 'Revoke sessions', danger: true, text: (r) => `Every active session of ${r.fullName} ends immediately. They can sign in again.`, run: (r) => api.post(`/admin/staff/sub-admins/${r._id}/sessions/revoke`), done: 'All sessions revoked.' },
    reset: { title: 'Send password recovery?', label: 'Send e-mail', text: (r) => `A password recovery link is e-mailed to ${r.email}. Their current sessions end now.`, run: (r) => api.post(`/admin/staff/sub-admins/${r._id}/password-reset`), done: 'Password recovery e-mail sent.' },
    resend: { title: 'Re-send the invitation?', label: 'Re-send', text: (r) => `A new invitation link is sent to ${r.email}. Earlier links stop working.`, run: (r) => api.post(`/admin/staff/sub-admins/${r._id}/resend-invitation`), done: 'Invitation re-sent.' },
    remove: { title: 'Delete this sub-admin?', label: 'Delete', danger: true, text: (r) => `${r.fullName} is removed and all access ends immediately. The audit history is kept.`, run: (r) => api.delete(`/admin/staff/sub-admins/${r._id}`), done: 'Sub-admin deleted.' },
  };

  const runAction = async () => {
    const def = ACTIONS[action.type];
    setBusy(true);
    try {
      const { data } = await def.run(action.row);
      setNotice(data?.message || def.done);
      setInviteLink(data?.inviteUrl || '');
      setAction(null);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'The action could not be completed.'));
      setAction(null);
    } finally {
      setBusy(false);
    }
  };

  const menuItems = (row) => {
    const items = [];
    if (can.edit) items.push({ key: 'edit', icon: Pencil, label: 'Edit', onClick: () => openEdit(row) });
    if (can.create && row.accountStatus === 'pending_invitation') items.push({ key: 'resend', icon: Mail, label: 'Re-send invitation' });
    if (can.suspend && row.accountStatus === 'active') items.push({ key: 'suspend', icon: ShieldOff, label: 'Suspend' });
    if (can.suspend && row.accountStatus === 'suspended') items.push({ key: 'reactivate', icon: UserCheck, label: 'Reactivate' });
    if (can.sessions && row.accountStatus === 'active') items.push({ key: 'sessions', icon: LogOut, label: 'Revoke sessions' });
    if (can.edit && row.accountStatus === 'active') items.push({ key: 'reset', icon: KeyRound, label: 'Send password recovery' });
    if (can.suspend && row.accountStatus !== 'revoked') items.push({ key: 'revoke', icon: XCircle, label: 'Revoke access', danger: true });
    if (can.remove) items.push({ key: 'remove', icon: Trash2, label: 'Delete', danger: true });
    return items;
  };

  const roleOptions = useMemo(() => roles.map((r) => <option key={r._id} value={r._id}>{r.roleName}</option>), [roles]);

  return (
    <AdminLayout onAdminLogout={onAdminLogout}>
      <PageHeader
        title="Sub-Admin Management"
        subtitle="Manage sub-admin accounts, roles, and permissions"
        action={can.create && <PrimaryButton onClick={openCreate}><UserPlus size={16} /> Create Sub-Admin</PrimaryButton>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} value={stats.total ?? 0} label="Total Sub-Admins" tint="bg-orange-50 text-[#fd761a]" />
        <StatCard icon={CheckCircle2} value={stats.active ?? 0} label="Active Accounts" tint="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Clock} value={stats.pending_invitation ?? 0} label="Pending Invitations" tint="bg-amber-50 text-amber-600" />
        <StatCard icon={XCircle} value={stats.suspended ?? 0} label="Suspended Accounts" tint="bg-red-50 text-red-600" />
      </div>

      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={notice} />
      {inviteLink && (
        <div className="mb-5 rounded-[10px] border border-[#eadfd7] bg-white px-4 py-3 text-[13px] text-[#5a3322]">
          <p className="font-black">Development only — invitation link</p>
          <p className="mt-1 break-all font-mono text-[12px]">{inviteLink}</p>
          <p className="mt-1 text-[12px] text-[#988b84]">This is shown only when the server is not in production mode. In production the link is only ever e-mailed.</p>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#988b84]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." maxLength={80} className={`${inputClass} !rounded-[12px] !py-3 pl-11`} />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={`${inputClass} md:!w-48`} aria-label="Filter by status">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className={`${inputClass} md:!w-48`} aria-label="Filter by role">
          <option value="">All Roles</option>
          {roleOptions}
        </select>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-[#eadfd7] bg-white shadow-[0_10px_28px_rgba(80,40,10,0.05)]">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={44} className="mx-auto text-[#cdbfb5]" />
            <p className="mt-4 text-[16px] font-bold text-[#27201c]">No sub-admins found</p>
            <p className="mt-1 text-[14px] text-[#796d66]">{can.create ? 'Use “Create Sub-Admin” to invite your first team member.' : 'Nothing matches your filters.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="border-b border-[#eadfd7] bg-[#fffaf5] text-left text-[11px] font-black uppercase tracking-wider text-[#796d66]">
                  <th className="px-5 py-3">Sub-admin</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">2-step</th>
                  <th className="px-3 py-3">Access until</th>
                  <th className="px-3 py-3">Last sign-in</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = STATUS_META[row.accountStatus] || STATUS_META.revoked;
                  const items = menuItems(row);
                  return (
                    <tr key={row._id} className="border-b border-[#f1e8e1] last:border-0 hover:bg-[#fffaf5]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {row.profileImage ? (
                            <img src={row.profileImage} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff1e4] text-[13px] font-black text-[#ad4d00]">{initials(row.fullName)}</div>
                          )}
                          <div>
                            <p className="font-bold text-[#27201c]">{row.fullName}</p>
                            <p className="text-[12px] text-[#796d66]">{row.email}</p>
                            {row.mobile && <p className="text-[12px] text-[#988b84]">{row.mobile}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-[#5a3322]">{row.role?.roleName || '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${meta.cls}`}>{meta.label}</span>
                        {row.invitationExpired && <p className="mt-1 text-[11px] font-bold text-[#b3361b]">Invitation expired</p>}
                      </td>
                      <td className="px-3 py-3 text-[#5a3322]">{row.mfaEnabled ? 'On' : '—'}</td>
                      <td className="px-3 py-3 text-[#5a3322]">{row.accessExpiry ? formatDate(row.accessExpiry) : 'No expiry'}</td>
                      <td className="px-3 py-3 text-[#5a3322]">{formatDate(row.lastLogin, true)}</td>
                      <td className="px-3 py-3 text-right">
                        {items.length > 0 && (
                          <div className="relative inline-block text-left" ref={menuFor === row._id ? menuRef : null}>
                            <button type="button" onClick={() => setMenuFor(menuFor === row._id ? null : row._id)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#796d66] hover:bg-[#fff1e4]" aria-label={`Actions for ${row.fullName}`}>
                              <MoreVertical size={18} />
                            </button>
                            {menuFor === row._id && (
                              <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-[12px] border border-[#eadfd7] bg-white py-1 shadow-[0_16px_40px_rgba(25,12,6,0.16)]">
                                {items.map((it) => (
                                  <button
                                    key={it.key}
                                    type="button"
                                    onClick={() => { setMenuFor(null); if (it.onClick) it.onClick(); else setAction({ type: it.key, row }); }}
                                    className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-bold hover:bg-[#fffaf5] ${it.danger ? 'text-[#b3361b]' : 'text-[#5a3322]'}`}
                                  >
                                    <it.icon size={15} /> {it.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#eadfd7] px-5 py-3 text-[13px] text-[#796d66]">
            <span>{pagination.total} sub-admins · page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <SecondaryButton className="!h-9 !px-4" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</SecondaryButton>
              <SecondaryButton className="!h-9 !px-4" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</SecondaryButton>
            </div>
          </div>
        )}
      </div>

      {form && (
        <Modal
          busy={busy}
          title={form.mode === 'create' ? 'Create Sub-Admin' : `Edit — ${form.row.fullName}`}
          onClose={closeForm}
          footer={(
            <>
              <SecondaryButton onClick={closeForm} disabled={busy}>Cancel</SecondaryButton>
              <PrimaryButton onClick={submitForm} disabled={busy}>{busy ? 'Saving…' : form.mode === 'create' ? <><Plus size={15} /> Send invitation</> : 'Save changes'}</PrimaryButton>
            </>
          )}
        >
          <ErrorBanner message={formError} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Full name"><input className={inputClass} value={form.fullName} maxLength={80} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Rahul Kumar" /></Field>
            <Field label="E-mail address" hint={form.mode === 'edit' ? 'The e-mail cannot be changed.' : 'The invitation is sent here.'}>
              <input className={inputClass} type="email" value={form.mode === 'edit' ? form.row.email : form.email} disabled={form.mode === 'edit'} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
            </Field>
            <Field label="Mobile number" hint="Optional"><input className={inputClass} value={form.mobile} maxLength={20} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="+91 98765 43210" /></Field>
            <Field label="Profile image URL" hint="Optional (https link)"><input className={inputClass} value={form.profileImage} maxLength={500} onChange={(e) => setForm({ ...form, profileImage: e.target.value })} placeholder="https://…" /></Field>
            <Field label="Assigned role" hint={form.mode === 'edit' ? 'Changing the role replaces all permissions immediately.' : 'You can only assign roles whose permissions you hold.'}>
              <select className={inputClass} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                <option value="">Select a role…</option>
                {roleOptions}
              </select>
            </Field>
            <Field label="Account status" hint={form.mode === 'create' ? 'New accounts start as Pending Invitation until the invitee activates them.' : 'Use the actions menu to suspend or revoke.'}>
              <input className={inputClass} disabled value={form.mode === 'create' ? 'Pending Invitation' : (STATUS_META[form.row.accountStatus]?.label || '')} readOnly />
            </Field>
            <Field label="Access expiry" hint="Optional - access stops automatically after this date.">
              <input className={inputClass} type="date" min={tomorrow()} value={form.accessExpiry} onChange={(e) => setForm({ ...form, accessExpiry: e.target.value })} />
            </Field>
          </div>
          {form.mode === 'create' && (
            <p className="mt-5 rounded-[10px] bg-[#fff8f1] px-4 py-3 text-[12px] leading-5 text-[#5a3322]">
              The invitee receives a single-use link (valid 48 hours), chooses their own password and sets up an authenticator app. Passwords are never e-mailed.
            </p>
          )}
        </Modal>
      )}

      {action && (
        <ConfirmDialog
          danger={!!ACTIONS[action.type].danger}
          busy={busy}
          title={ACTIONS[action.type].title}
          confirmLabel={ACTIONS[action.type].label}
          message={ACTIONS[action.type].text(action.row)}
          onCancel={() => setAction(null)}
          onConfirm={runAction}
        />
      )}
    </AdminLayout>
  );
}
