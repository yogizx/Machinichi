import { useMemo } from 'react';
import { Lock } from 'lucide-react';

/**
 * Permission matrix: modules (and their features) as rows, actions as columns.
 *
 * Props
 *   catalog   { permissions: [{key,module,action,description,enforced}], modules: [{key,label}], grantable: string[] }
 *             - from GET /admin/staff/permissions
 *   value     string[]   selected permission keys
 *   onChange  (keys: string[]) => void
 *   readOnly  boolean
 *
 * A cell is locked (not clickable) when
 *   - the permission is "reserved" (the product has no endpoint for it yet), or
 *   - the signed-in admin may not grant it (you can only grant what you hold yourself).
 * The server re-checks every grant, so this is only a guide for the person using the screen.
 */

const STANDARD = ['view', 'create', 'edit', 'delete', 'publish', 'approve', 'export', 'import'];
const COLUMN_LABEL = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', publish: 'Publish', approve: 'Approve', export: 'Export', import: 'Import', other: 'Other' };

const titleCase = (s) => s.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function splitAction(action) {
  const parts = action.split('.');
  const last = parts[parts.length - 1];
  if (STANDARD.includes(last)) {
    return { feature: parts.slice(0, -1).join(' '), column: last, otherLabel: null };
  }
  return { feature: parts.length > 1 ? parts.slice(0, -1).join(' ') : '', column: 'other', otherLabel: titleCase(action) };
}

export function buildMatrixRows(catalog) {
  if (!catalog) return [];
  const rows = new Map();
  const moduleLabel = new Map((catalog.modules || []).map((m) => [m.key, m.label]));
  const moduleOrder = (catalog.modules || []).map((m) => m.key);

  for (const p of catalog.permissions || []) {
    const { feature, column, otherLabel } = splitAction(p.action);
    const rowKey = `${p.module}|${feature}`;
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        rowKey,
        module: p.module,
        label: feature ? `${moduleLabel.get(p.module) || titleCase(p.module)} — ${titleCase(feature)}` : (moduleLabel.get(p.module) || titleCase(p.module)),
        cells: {},
        others: [],
      });
    }
    const row = rows.get(rowKey);
    if (column === 'other') row.others.push({ ...p, otherLabel });
    else row.cells[column] = p;
  }
  return [...rows.values()].sort((a, b) => moduleOrder.indexOf(a.module) - moduleOrder.indexOf(b.module));
}

export default function PermissionMatrix({ catalog, value = [], onChange, readOnly = false }) {
  const selected = useMemo(() => new Set(value), [value]);
  const grantable = useMemo(() => new Set(catalog?.grantable || []), [catalog]);
  const rows = useMemo(() => buildMatrixRows(catalog), [catalog]);

  if (!catalog) return null;

  const stateOf = (p) => {
    if (!p.enforced) return { locked: true, reason: 'Not available yet - this feature has no endpoint to protect.' };
    if (readOnly) return { locked: true, reason: '' };
    if (!grantable.has(p.key)) return { locked: true, reason: 'You can only grant permissions that you hold yourself.' };
    return { locked: false, reason: '' };
  };

  const toggle = (p) => {
    const next = new Set(selected);
    if (next.has(p.key)) next.delete(p.key);
    else next.add(p.key);
    onChange?.([...next]);
  };

  const toggleRow = (row) => {
    const all = [...Object.values(row.cells), ...row.others].filter((p) => !stateOf(p).locked);
    if (all.length === 0) return;
    const everySelected = all.every((p) => selected.has(p.key));
    const next = new Set(selected);
    all.forEach((p) => (everySelected ? next.delete(p.key) : next.add(p.key)));
    onChange?.([...next]);
  };

  const renderCell = (p) => {
    if (!p) return <span className="text-[#cdbfb5]">—</span>;
    const { locked, reason } = stateOf(p);
    const checked = selected.has(p.key);
    if (!p.enforced) {
      return <span title={reason} className="inline-flex text-[#c7bab0]"><Lock size={14} /></span>;
    }
    return (
      <label title={locked && reason ? reason : p.description} className={`inline-flex items-center justify-center ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#ad4d00]"
          checked={checked}
          disabled={locked}
          onChange={() => toggle(p)}
          aria-label={p.description}
        />
        {locked && !readOnly && !checked && <Lock size={11} className="ml-1 text-[#c7bab0]" />}
      </label>
    );
  };

  return (
    <div className="overflow-x-auto rounded-[12px] border border-[#eadfd7] bg-white">
      <table className="w-full min-w-[860px] text-[13px]">
        <thead>
          <tr className="border-b border-[#eadfd7] bg-[#fffaf5] text-[11px] font-black uppercase tracking-wider text-[#796d66]">
            <th className="px-4 py-3 text-left">Module</th>
            {[...STANDARD, 'other'].map((c) => (
              <th key={c} className="px-2 py-3 text-center">{COLUMN_LABEL[c]}</th>
            ))}
            {!readOnly && <th className="px-3 py-3 text-center">All</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowPerms = [...Object.values(row.cells), ...row.others];
            const grantableHere = rowPerms.filter((p) => !stateOf(p).locked);
            const allOn = grantableHere.length > 0 && grantableHere.every((p) => selected.has(p.key));
            const noneEnforced = rowPerms.every((p) => !p.enforced);
            return (
              <tr key={row.rowKey} className={`border-b border-[#f1e8e1] last:border-0 ${noneEnforced ? 'bg-[#fbf8f5] text-[#a89c94]' : 'hover:bg-[#fffaf5]'}`}>
                <td className="px-4 py-2.5 font-bold text-[#27201c]">
                  {row.label}
                  {noneEnforced && <span className="ml-2 rounded-full bg-[#f1e8e1] px-2 py-0.5 text-[10px] font-bold uppercase text-[#988b84]">Coming soon</span>}
                </td>
                {STANDARD.map((c) => (
                  <td key={c} className="px-2 py-2.5 text-center">{renderCell(row.cells[c])}</td>
                ))}
                <td className="px-2 py-2.5 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {row.others.length === 0 && <span className="text-[#cdbfb5]">—</span>}
                    {row.others.map((p) => {
                      const { locked, reason } = stateOf(p);
                      const checked = selected.has(p.key);
                      return (
                        <label
                          key={p.key}
                          title={locked && reason ? reason : p.description}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                            !p.enforced ? 'border-[#eadfd7] text-[#c7bab0]' : checked ? 'border-[#ad4d00] bg-[#fff1e4] text-[#ad4d00]' : 'border-[#eadfd7] text-[#796d66]'
                          } ${locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                        >
                          {!p.enforced ? <Lock size={10} /> : (
                            <input type="checkbox" className="h-3 w-3 accent-[#ad4d00]" checked={checked} disabled={locked} onChange={() => toggle(p)} />
                          )}
                          {p.otherLabel}
                        </label>
                      );
                    })}
                  </div>
                </td>
                {!readOnly && (
                  <td className="px-3 py-2.5 text-center">
                    <button
                      type="button"
                      disabled={grantableHere.length === 0}
                      onClick={() => toggleRow(row)}
                      className="rounded-full border border-[#eadfd7] px-2.5 py-1 text-[11px] font-black text-[#796d66] transition hover:border-[#fd761a] hover:text-[#ad4d00] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {allOn ? 'Clear' : 'All'}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
