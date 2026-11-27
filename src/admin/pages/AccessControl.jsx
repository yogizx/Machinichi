import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Monitor, ShieldCheck } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import PermissionMatrix from '../components/PermissionMatrix';
import {
  ConfirmDialog, ErrorBanner, PageHeader, PrimaryButton, SecondaryButton, Spinner, SuccessBanner, apiErrorMessage, formatDate, inputClass,
} from '../components/StaffUi';
import { usePermissions } from '../../contexts/PermissionContext';
import api from '../../services/api';

/**
 * Access Control: for one sub-admin, see what they can really do (role + overrides), grant or deny individual
 * permissions on top of the role, and see / end their sessions. Everything is re-validated by the server.
 */
export default function AccessControl({ onAdminLogout }) {
  const { hasPermission, loading: permsLoading } = usePermissions();
  const canAssign = hasPermission('admin.permission.assign');
  const canRevoke = hasPermission('admin.session.revoke');

  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [draft, setDraft] = useState({}); // permissionKey -> 'allow' | 'deny'
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null); // 'save' | 'revoke'
  const [busy, setBusy] = useState(false);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, c] = await Promise.all([
        api.get('/admin/staff/sub-admins', { params: { limit: 100 } }),
        api.get('/admin/staff/permissions').catch(() => null),
      ]);
      setPeople((p.data.data || []).filter((x) => x.accountStatus !== 'revoked'));
      if (c?.data?.success) setCatalog({ permissions: c.data.data, modules: c.data.modules, grantable: c.data.grantable });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load sub-admins.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    setDetailLoading(true);
    setError('');
    try {
      const [d, s] = await Promise.all([
        api.get(`/admin/staff/sub-admins/${id}`),
        api.get(`/admin/staff/sub-admins/${id}/sessions`).catch(() => ({ data: { data: [] } })),
      ]);
      setDetail(d.data.data);
      setSessions(s.data.data || []);
      setDraft(Object.fromEntries((d.data.data.overrides || []).map((o) => [o.permissionKey, o.effect])));
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this account.'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { if (!permsLoading) loadPeople(); }, [permsLoading, loadPeople]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const grantable = useMemo(() => new Set(catalog?.grantable || []), [catalog]);
  const groups = useMemo(() => {
    if (!catalog) return [];
    const labels = new Map(catalog.modules.map((m) => [m.key, m.label]));
    const byModule = new Map();
    catalog.permissions.filter((p) => p.enforced).forEach((p) => {
      if (!byModule.has(p.module)) byModule.set(p.module, []);
      byModule.get(p.module).push(p);
    });
    return catalog.modules.filter((m) => byModule.has(m.key)).map((m) => ({ key: m.key, label: labels.get(m.key), perms: byModule.get(m.key) }));
  }, [catalog]);

  const originalOverrides = useMemo(() => Object.fromEntries((detail?.overrides || []).map((o) => [o.permissionKey, o.effect])), [detail]);
  const dirty = JSON.stringify(Object.entries(draft).sort()) !== JSON.stringify(Object.entries(originalOverrides).sort());

  const setEffect = (key, value) => {
    setDraft((d) => {
      const next = { ...d };
      if (value === 'inherit') delete next[key]; else next[key] = value;
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/admin/staff/sub-admins/${selectedId}/permissions`, {
        overrides: Object.entries(draft).map(([permissionKey, effect]) => ({ permissionKey, effect })),
      });
      setNotice('Permission overrides saved. They apply to this person’s next request.');
      setConfirm(null);
      await loadDetail(selectedId);
    } catch (err) {
      setConfirm(null);
      setError(apiErrorMessage(err, 'The overrides could not be saved.'));
    } finally { setBusy(false); }
  };

  const revokeSessions = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/staff/sub-admins/${selectedId}/sessions/revoke`);
      setNotice('All sessions revoked.');
      setConfirm(null);
      await loadDetail(selectedId);
    } catch (err) {
      setConfirm(null);
      setError(apiErrorMessage(err, 'Sessions could not be revoked.'));
    } finally { setBusy(false); }
  };

  return (
    <AdminLayout onAdminLogout={onAdminLogout}>
      <PageHeader title="Access Control" subtitle="Inspect and fine-tune what each sub-admin can do" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {loading ? <Spinner /> : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
          <div className="rounded-[16px] border border-[#eadfd7] bg-white p-3">
            <p className="px-3 pb-2 pt-1 text-[11px] font-black uppercase tracking-wider text-[#796d66]">Sub-admins</p>
            {people.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-[#796d66]">No sub-admins yet.</p>}
            <div className="max-h-[560px] overflow-y-auto">
              {people.map((p) => (
                <button key={p._id} type="button" onClick={() => { setSelectedId(p._id); setNotice(''); }}
                  className={`mb-1 flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left transition ${selectedId === p._id ? 'bg-[#fff1e4]' : 'hover:bg-[#fffaf5]'}`}>
                  <span>
                    <span className="block text-[14px] font-bold text-[#27201c]">{p.fullName}</span>
                    <span className="block text-[12px] text-[#796d66]">{p.role?.roleName || 'No role'}</span>
                  </span>
                  <span className={`h-2.5 w-2.5 rounded-full ${p.accountStatus === 'active' ? 'bg-emerald-500' : p.accountStatus === 'suspended' ? 'bg-red-500' : 'bg-amber-400'}`} title={p.accountStatus} />
                </button>
              ))}
            </div>
          </div>

          <div>
            {!selectedId && (
              <div className="rounded-[16px] border border-dashed border-[#eadfd7] bg-white py-20 text-center text-[#796d66]">
                <ShieldCheck size={44} className="mx-auto text-[#cdbfb5]" />
                <p className="mt-3 text-[15px] font-bold text-[#27201c]">Select a sub-admin</p>
                <p className="mt-1 text-[13px]">to see their effective permissions and sessions.</p>
              </div>
            )}
            {selectedId && detailLoading && <Spinner />}
            {selectedId && !detailLoading && detail && (
              <div className="space-y-6">
                <div className="rounded-[16px] border border-[#eadfd7] bg-white p-5">
                  <h2 className="text-[20px] font-black text-[#27201c]">{detail.fullName}</h2>
                  <p className="text-[13px] text-[#796d66]">{detail.email} · {detail.role?.roleName || 'No role'} · {detail.accountStatus.replace('_', ' ')}</p>
                  <p className="mt-2 text-[12px] text-[#988b84]">Role permissions plus the overrides below. This is exactly what the server enforces right now.</p>
                </div>

                <div>
                  <h3 className="mb-2 text-[15px] font-black text-[#27201c]">Effective permissions ({detail.permissions.length})</h3>
                  {catalog && <PermissionMatrix catalog={catalog} value={detail.permissions} readOnly onChange={() => {}} />}
                </div>

                <div className="rounded-[16px] border border-[#eadfd7] bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-[15px] font-black text-[#27201c]">Individual overrides</h3>
                      <p className="text-[12px] text-[#796d66]">“Allow” adds a permission on top of the role, “Deny” removes one. You can only allow what you hold yourself.</p>
                    </div>
                    {canAssign && <PrimaryButton disabled={!dirty || busy} onClick={() => setConfirm('save')}>Save overrides</PrimaryButton>}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto rounded-[10px] border border-[#f1e8e1]">
                    {groups.map((g) => (
                      <div key={g.key}>
                        <p className="sticky top-0 bg-[#fffaf5] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-[#796d66]">{g.label}</p>
                        {g.perms.map((p) => {
                          const value = draft[p.key] || 'inherit';
                          return (
                            <div key={p.key} className="flex items-center justify-between gap-3 border-t border-[#f6efe9] px-4 py-2">
                              <div>
                                <p className="text-[13px] font-semibold text-[#27201c]">{p.description}</p>
                                <p className="font-mono text-[11px] text-[#988b84]">{p.key}</p>
                              </div>
                              <select value={value} disabled={!canAssign} onChange={(e) => setEffect(p.key, e.target.value)} className={`${inputClass} !w-32 !py-1.5 !text-[13px]`} aria-label={`Override for ${p.key}`}>
                                <option value="inherit">Inherit</option>
                                <option value="allow" disabled={!grantable.has(p.key) && value !== 'allow'}>Allow</option>
                                <option value="deny">Deny</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[16px] border border-[#eadfd7] bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[15px] font-black text-[#27201c]">Active sessions ({sessions.length})</h3>
                    {canRevoke && sessions.length > 0 && <SecondaryButton className="!text-[#b3361b]" onClick={() => setConfirm('revoke')}><LogOut size={15} /> Revoke all</SecondaryButton>}
                  </div>
                  {sessions.length === 0 ? <p className="text-[13px] text-[#796d66]">No active sessions.</p> : (
                    <ul className="divide-y divide-[#f1e8e1]">
                      {sessions.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                          <Monitor size={18} className="text-[#988b84]" />
                          <div>
                            <p className="font-semibold text-[#27201c]">{s.ip || 'Unknown IP'} · started {formatDate(s.startedAt, true)}</p>
                            <p className="max-w-xl truncate text-[12px] text-[#988b84]">{s.userAgent || 'Unknown device'}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {confirm === 'save' && (
        <ConfirmDialog busy={busy} title="Save permission overrides?" confirmLabel="Save overrides" onCancel={() => setConfirm(null)} onConfirm={save}
          message={`${detail?.fullName}'s permissions change immediately, even while they are signed in.`} />
      )}
      {confirm === 'revoke' && (
        <ConfirmDialog danger busy={busy} title="Sign out everywhere?" confirmLabel="Revoke sessions" onCancel={() => setConfirm(null)} onConfirm={revokeSessions}
          message={`Every active session of ${detail?.fullName} ends immediately.`} />
      )}
    </AdminLayout>
  );
}
