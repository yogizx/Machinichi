import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { ErrorBanner, PageHeader, SecondaryButton, Spinner, apiErrorMessage, formatDate, inputClass } from '../components/StaffUi';
import { usePermissions } from '../../contexts/PermissionContext';
import api from '../../services/api';

const OUTCOME_CLS = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  denied: 'bg-amber-50 text-amber-700 border-amber-200',
  failure: 'bg-red-50 text-red-700 border-red-200',
};

const MODULE_OPTIONS = ['admin', 'auth', 'product', 'order', 'vendor', 'customer', 'inventory', 'payment', 'marketing', 'content', 'report'];

/** Read-only audit trail. There is deliberately no way to edit or delete entries - not here and not in the API. */
export default function ActivityLogs({ onAdminLogout }) {
  const { loading: permsLoading } = usePermissions();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [filters, setFilters] = useState({ module: '', outcome: '', action: '', from: '', to: '' });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 25 };
      if (filters.module) params.module = filters.module;
      if (filters.outcome) params.outcome = filters.outcome;
      if (filters.action.trim()) params.action = filters.action.trim();
      if (filters.from) params.from = new Date(`${filters.from}T00:00:00`).toISOString();
      if (filters.to) params.to = new Date(`${filters.to}T23:59:59`).toISOString();
      const { data } = await api.get('/admin/staff/audit-logs', { params });
      setRows(data.data || []);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the activity log.'));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { if (!permsLoading) load(); }, [permsLoading, load]);

  const setFilter = (key, value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1); };

  return (
    <AdminLayout onAdminLogout={onAdminLogout}>
      <PageHeader title="Activity Logs" subtitle="Security-sensitive actions across staff and access management" />
      <ErrorBanner message={error} onRetry={load} />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-5">
        <select className={inputClass} value={filters.module} onChange={(e) => setFilter('module', e.target.value)} aria-label="Module">
          <option value="">All modules</option>
          {MODULE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={inputClass} value={filters.outcome} onChange={(e) => setFilter('outcome', e.target.value)} aria-label="Outcome">
          <option value="">All outcomes</option>
          <option value="success">Success</option>
          <option value="denied">Denied</option>
          <option value="failure">Failure</option>
        </select>
        <input className={inputClass} placeholder="Action starts with… (e.g. sub_admin.)" maxLength={80} value={filters.action} onChange={(e) => setFilter('action', e.target.value)} />
        <input className={inputClass} type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="From date" />
        <input className={inputClass} type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="To date" />
      </div>

      <div className="overflow-hidden rounded-[16px] border border-[#eadfd7] bg-white shadow-[0_10px_28px_rgba(80,40,10,0.05)]">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <div className="py-16 text-center">
            <ScrollText size={44} className="mx-auto text-[#cdbfb5]" />
            <p className="mt-4 text-[16px] font-bold text-[#27201c]">No activity found</p>
            <p className="mt-1 text-[14px] text-[#796d66]">Try widening the filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="border-b border-[#eadfd7] bg-[#fffaf5] text-left text-[11px] font-black uppercase tracking-wider text-[#796d66]">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3">Actor</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Target</th>
                  <th className="px-3 py-3">Outcome</th>
                  <th className="px-3 py-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r._id}>
                    <tr className="cursor-pointer border-b border-[#f1e8e1] hover:bg-[#fffaf5]" onClick={() => setOpen(open === r._id ? null : r._id)}>
                      <td className="px-3 py-2.5 text-[#988b84]">{open === r._id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[#5a3322]">{formatDate(r.createdAt, true)}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-bold text-[#27201c]">{r.actorId?.fullName || 'Unknown / system'}</p>
                        {r.actorId?.email && <p className="text-[12px] text-[#988b84]">{r.actorId.email}</p>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-[#5a3322]">{r.action}</td>
                      <td className="px-3 py-2.5 text-[#5a3322]">{r.targetUserId?.fullName || '—'}</td>
                      <td className="px-3 py-2.5"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-black ${OUTCOME_CLS[r.outcome] || OUTCOME_CLS.success}`}>{r.outcome}</span></td>
                      <td className="px-3 py-2.5 text-[#988b84]">{r.ipAddress || '—'}</td>
                    </tr>
                    {open === r._id && (
                      <tr className="border-b border-[#f1e8e1] bg-[#fbf8f5]">
                        <td />
                        <td colSpan={6} className="px-3 py-3">
                          <p className="text-[12px] text-[#796d66]">Module: <b>{r.module}</b>{r.resourceId ? <> · Resource: <span className="font-mono">{r.resourceId}</span></> : null}</p>
                          {r.userAgent && <p className="mt-1 truncate text-[12px] text-[#988b84]">{r.userAgent}</p>}
                          {r.metadata && <pre className="mt-2 max-h-48 overflow-auto rounded-[8px] bg-white p-3 text-[12px] text-[#5a3322]">{JSON.stringify(r.metadata, null, 2)}</pre>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#eadfd7] px-5 py-3 text-[13px] text-[#796d66]">
            <span>{pagination.total} entries · page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <SecondaryButton className="!h-9 !px-4" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</SecondaryButton>
              <SecondaryButton className="!h-9 !px-4" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</SecondaryButton>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
