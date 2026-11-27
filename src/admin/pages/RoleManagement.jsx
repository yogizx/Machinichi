import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eye, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import PermissionMatrix from '../components/PermissionMatrix';
import {
  ConfirmDialog, ErrorBanner, Field, Modal, PageHeader, PrimaryButton, SecondaryButton, Spinner, SuccessBanner,
  apiErrorMessage, inputClass,
} from '../components/StaffUi';
import { usePermissions } from '../../contexts/PermissionContext';
import api from '../../services/api';

/**
 * Roles & Permissions.
 * Every button here is a convenience: the server decides whether a role may be created, changed or deleted, and
 * refuses anything the signed-in admin could not grant themselves.
 */
export default function RoleManagement({ onAdminLogout }) {
  const { hasPermission, loading: permsLoading } = usePermissions();
  const canCreate = hasPermission('admin.role.create');
  const canEdit = hasPermission('admin.role.edit');
  const canAssign = hasPermission('admin.permission.assign');
  const canDelete = hasPermission('admin.role.delete');

  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editor, setEditor] = useState(null); // { mode: 'create' | 'edit' | 'view', role?, name, description, permissions }
  const [editorError, setEditorError] = useState('');
  const [confirmSave, setConfirmSave] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, catalogRes] = await Promise.all([
        api.get('/admin/staff/roles'),
        api.get('/admin/staff/permissions').catch(() => null),
      ]);
      setRoles(rolesRes.data?.data || []);
      if (catalogRes?.data?.success) {
        setCatalog({ permissions: catalogRes.data.data, modules: catalogRes.data.modules, grantable: catalogRes.data.grantable });
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load roles.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!permsLoading) load(); }, [permsLoading, load]);

  const moduleLabel = useMemo(() => new Map((catalog?.modules || []).map((m) => [m.key, m.label])), [catalog]);

  const openCreate = () => {
    setEditorError('');
    setEditor({ mode: 'create', name: '', description: '', permissions: [] });
  };

  const openRole = (role) => {
    setEditorError('');
    const editable = canEdit && !role.isSuperAdminRole;
    setEditor({ mode: editable ? 'edit' : 'view', role, name: role.roleName, description: role.description || '', permissions: [...role.permissions] });
  };

  const changes = useMemo(() => {
    if (!editor?.role) return { added: 0, removed: 0, meta: false };
    const before = new Set(editor.role.permissions);
    const after = new Set(editor.permissions);
    return {
      added: [...after].filter((k) => !before.has(k)).length,
      removed: [...before].filter((k) => !after.has(k)).length,
      meta: editor.name.trim() !== editor.role.roleName || editor.description.trim() !== (editor.role.description || ''),
    };
  }, [editor]);

  const requestSave = () => {
    setEditorError('');
    if (editor.name.trim().length < 2) { setEditorError('Role name must be at least 2 characters.'); return; }
    setConfirmSave(true);
  };

  const doSave = async () => {
    setBusy(true);
    setEditorError('');
    try {
      if (editor.mode === 'create') {
        await api.post('/admin/staff/roles', { roleName: editor.name.trim(), description: editor.description.trim() || undefined, permissions: editor.permissions });
        setNotice(`Role "${editor.name.trim()}" created.`);
      } else {
        const role = editor.role;
        if (changes.meta) {
          const body = { description: editor.description.trim() };
          if (!role.isSystemRole && editor.name.trim() !== role.roleName) body.roleName = editor.name.trim();
          await api.put(`/admin/staff/roles/${role._id}`, body);
        }
        if ((changes.added || changes.removed) && canAssign) {
          await api.put(`/admin/staff/roles/${role._id}/permissions`, { permissions: editor.permissions });
        }
        setNotice(`Role "${editor.name.trim()}" updated. Changes apply to its users immediately.`);
      }
      setConfirmSave(false);
      setEditor(null);
      await load();
    } catch (err) {
      setConfirmSave(false);
      setEditorError(apiErrorMessage(err, 'The role could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const doDuplicate = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/staff/roles/${duplicateTarget._id}/duplicate`, { roleName: duplicateName.trim() });
      setNotice(`Role duplicated as "${duplicateName.trim()}".`);
      setDuplicateTarget(null);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'The role could not be duplicated.'));
      setDuplicateTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/staff/roles/${deleteTarget._id}`);
      setNotice(`Role "${deleteTarget.roleName}" deleted.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'The role could not be deleted.'));
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const readOnlyMatrix = editor?.mode === 'view' || !(canAssign || editor?.mode === 'create');

  return (
    <AdminLayout onAdminLogout={onAdminLogout}>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Create and manage roles with granular permissions"
        action={canCreate && <PrimaryButton onClick={openCreate}><Plus size={16} /> Create Role</PrimaryButton>}
      />

      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={notice} />

      {loading ? (
        <Spinner />
      ) : roles.length === 0 ? (
        <div className="rounded-[16px] border border-[#eadfd7] bg-white py-16 text-center">
          <ShieldCheck size={44} className="mx-auto text-[#cdbfb5]" />
          <p className="mt-4 text-[16px] font-bold text-[#27201c]">No roles yet</p>
          <p className="mt-1 text-[14px] text-[#796d66]">
            {canCreate ? 'Create your first role to start delegating access.' : 'Ask a Super Admin to create roles.'}
          </p>
          <p className="mt-3 text-[12px] text-[#988b84]">If the predefined roles are missing, run <code className="rounded bg-[#fff1e4] px-1.5 py-0.5">npm run rbac:setup</code> once on the server.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <div key={role._id} className="flex flex-col rounded-[16px] border border-[#eadfd7] bg-white p-5 shadow-[0_10px_28px_rgba(80,40,10,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[18px] font-black text-[#27201c]">{role.roleName}</h3>
                {role.isSuperAdminRole ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#321304] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white"><Lock size={10} /> Protected</span>
                ) : role.isSystemRole ? (
                  <span className="rounded-full bg-[#fff1e4] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#ad4d00]">System</span>
                ) : (
                  <span className="rounded-full bg-[#f1e8e1] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#5a3322]">Custom</span>
                )}
              </div>
              <p className="mt-1.5 min-h-[40px] text-[13px] leading-5 text-[#796d66]">{role.description || 'No description'}</p>

              <div className="mt-4 flex items-center gap-4 text-[13px] text-[#5a3322]">
                <span className="inline-flex items-center gap-1.5 font-bold"><Users size={15} /> {role.userCount} {role.userCount === 1 ? 'user' : 'users'}</span>
                <span className="font-bold">{role.permissionCount} permissions</span>
              </div>

              <div className="mt-3 flex min-h-[52px] flex-wrap content-start gap-1.5">
                {role.modules.length === 0 && <span className="text-[12px] text-[#b6a79e]">No modules assigned</span>}
                {role.modules.map((m) => (
                  <span key={m} className="rounded-full border border-[#eadfd7] bg-[#fffaf5] px-2.5 py-1 text-[11px] font-bold text-[#5a3322]">{moduleLabel.get(m) || m}</span>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#f1e8e1] pt-4">
                <SecondaryButton className="!h-9 !px-4 !text-[12px]" onClick={() => openRole(role)}>
                  {canEdit && !role.isSuperAdminRole ? <><Pencil size={13} /> Edit</> : <><Eye size={13} /> View</>}
                </SecondaryButton>
                {canCreate && !role.isSuperAdminRole && (
                  <SecondaryButton className="!h-9 !px-4 !text-[12px]" onClick={() => { setDuplicateTarget(role); setDuplicateName(`${role.roleName} (Copy)`); }}>
                    <Copy size={13} /> Duplicate
                  </SecondaryButton>
                )}
                {canDelete && !role.isSystemRole && (
                  <SecondaryButton className="!h-9 !px-4 !text-[12px] !text-[#b3361b]" onClick={() => setDeleteTarget(role)}>
                    <Trash2 size={13} /> Delete
                  </SecondaryButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <Modal
          wide
          busy={busy}
          title={editor.mode === 'create' ? 'Create Role' : editor.mode === 'edit' ? `Edit Role — ${editor.role.roleName}` : `Role — ${editor.role.roleName}`}
          onClose={() => !busy && setEditor(null)}
          footer={editor.mode === 'view' ? (
            <SecondaryButton onClick={() => setEditor(null)}>Close</SecondaryButton>
          ) : (
            <>
              <SecondaryButton onClick={() => setEditor(null)} disabled={busy}>Cancel</SecondaryButton>
              <PrimaryButton
                onClick={requestSave}
                disabled={busy || (editor.mode === 'edit' && !changes.meta && !changes.added && !changes.removed)}
              >
                {editor.mode === 'create' ? 'Create Role' : 'Save changes'}
              </PrimaryButton>
            </>
          )}
        >
          <ErrorBanner message={editorError} />
          {editor.mode === 'view' && editor.role?.isSuperAdminRole && (
            <p className="mb-4 rounded-[10px] bg-[#fff8f1] px-4 py-3 text-[13px] text-[#5a3322]">The Super Admin role is protected. It always has full access and cannot be changed or assigned to a sub-admin.</p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Role name">
              <input className={inputClass} value={editor.name} maxLength={60} disabled={editor.mode === 'view' || editor.role?.isSystemRole}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="e.g. Regional Product Lead" />
            </Field>
            <Field label="Description" hint="Optional">
              <input className={inputClass} value={editor.description} maxLength={200} disabled={editor.mode === 'view'}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })} placeholder="What is this role for?" />
            </Field>
          </div>

          <div className="mb-2 mt-6 flex items-center justify-between">
            <h3 className="text-[15px] font-black text-[#27201c]">Permissions</h3>
            <span className="text-[12px] font-bold text-[#796d66]">{editor.permissions.length} selected</span>
          </div>
          {!catalog ? (
            <p className="rounded-[10px] bg-[#fff8f1] px-4 py-3 text-[13px] text-[#5a3322]">The permission catalog could not be loaded.</p>
          ) : (
            <PermissionMatrix
              catalog={catalog}
              value={editor.permissions}
              readOnly={readOnlyMatrix}
              onChange={(permissions) => setEditor({ ...editor, permissions })}
            />
          )}
          {editor.mode === 'edit' && !canAssign && (
            <p className="mt-3 text-[12px] text-[#988b84]">You can edit the name and description, but assigning permissions requires the “Assign permissions” permission.</p>
          )}
        </Modal>
      )}

      {confirmSave && editor && (
        <ConfirmDialog
          title={editor.mode === 'create' ? 'Create this role?' : 'Save changes to this role?'}
          confirmLabel={editor.mode === 'create' ? 'Create role' : 'Save changes'}
          busy={busy}
          onCancel={() => setConfirmSave(false)}
          onConfirm={doSave}
          message={editor.mode === 'create'
            ? `"${editor.name.trim()}" will be created with ${editor.permissions.length} permission(s).`
            : `${changes.added} permission(s) will be added and ${changes.removed} removed. ${editor.role.userCount > 0 ? `${editor.role.userCount} account(s) with this role are affected immediately, even if they are signed in.` : 'No accounts use this role yet.'}`}
        />
      )}

      {duplicateTarget && (
        <Modal
          title={`Duplicate "${duplicateTarget.roleName}"`}
          busy={busy}
          onClose={() => !busy && setDuplicateTarget(null)}
          footer={(
            <>
              <SecondaryButton onClick={() => setDuplicateTarget(null)} disabled={busy}>Cancel</SecondaryButton>
              <PrimaryButton onClick={doDuplicate} disabled={busy || duplicateName.trim().length < 2}>Duplicate</PrimaryButton>
            </>
          )}
        >
          <Field label="Name of the new role">
            <input className={inputClass} value={duplicateName} maxLength={60} onChange={(e) => setDuplicateName(e.target.value)} />
          </Field>
          <p className="mt-3 text-[12px] text-[#988b84]">You can only copy permissions that you could grant yourself.</p>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          danger
          busy={busy}
          title="Delete this role?"
          confirmLabel="Delete role"
          message={`"${deleteTarget.roleName}" will be permanently deleted. A role that is still assigned to accounts or open invitations cannot be deleted.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={doDelete}
        />
      )}
    </AdminLayout>
  );
}
