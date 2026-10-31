import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { errorText } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { PersonPicker, useLocations } from '../onboarding/shared';
import { settingsApi, type Department } from './api';
import { SettingsHead } from './SettingsLayout';
import { SaveBar } from './EmploymentTypesPage';
import { useDraftRows } from './useDraftRows';
import { Cell, SelectCell, Toggle, useBeforeUnload } from './cells';
import { BlockLoader } from '../components/Splash';

type Row = {
  id: string;
  version: number;
  name: string;
  code: string;
  parentId: string;
  headEmployeeId: string;
  headName: string;
  costCentre: string;
  defaultLocationId: string;
  active: boolean;
  headcount: number | null;
  sort: number;
};

const FIELDS: (keyof Row)[] = ['name', 'code', 'parentId', 'headEmployeeId', 'costCentre', 'defaultLocationId', 'active'];
const MAX_DEPTH = 5;

const toRow = (d: Department): Row => ({
  id: d.id,
  version: d.version,
  name: d.name,
  code: d.code ?? '',
  parentId: d.parentId ?? '',
  headEmployeeId: d.head?.employeeId ?? '',
  headName: d.head?.name ?? '',
  costCentre: d.costCentre ?? '',
  defaultLocationId: d.defaultLocation?.id ?? '',
  active: d.active,
  headcount: d.headcount,
  sort: d.sort,
});

/** What the API takes: ids or null, never empty strings. */
const body = (r: Partial<Row>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'headName' || k === 'headcount' || k === 'id' || k === 'version') continue;
    out[k] = typeof v === 'string' ? v.trim() || null : v;
  }
  return out;
};

export function DepartmentsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings', 'departments'], queryFn: settingsApi.departments });
  const locs = useLocations();
  const server = useMemo(() => q.data?.map(toRow), [q.data]);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const d = useDraftRows<Row>(server, FIELDS, () => ({ name: '', code: '', parentId: '', headEmployeeId: '', headName: '', costCentre: '', defaultLocationId: '', active: true, headcount: null, sort: (q.data?.length ?? 0) * 10 + 10 }), {
    label: 'Saving departments…',
    create: (r) => settingsApi.createDepartment(body(r)),
    update: (id, c, v) => settingsApi.updateDepartment(id, body(c), v),
  });
  useBeforeUnload(d.dirty > 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['settings', 'departments'] });
    qc.invalidateQueries({ queryKey: ['lookup', 'departments'] });
  };
  const save = async () => {
    await d.save();
    refresh();
  };
  const remove = async (r: Row) => {
    if (!confirm(`Delete "${r.name}"? This only works when no people, titles, teams or sub-departments use it.`)) return;
    try {
      await settingsApi.deleteDepartment(r.id);
      refresh();
    } catch (e) {
      setRowErr(`${r.name}: ${errorText(e)} You can switch it off (Active) instead.`);
    }
  };

  // Parent choices: anything except the department itself and what's under it (no loops).
  const childrenOf = useMemo(() => {
    const m = new Map<string, string[]>();
    d.rows.forEach((r) => r.parentId && m.set(r.parentId, [...(m.get(r.parentId) ?? []), r.id]));
    return m;
  }, [d.rows]);
  const below = (id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (x: string) => (childrenOf.get(x) ?? []).forEach((c) => !out.has(c) && (out.add(c), walk(c)));
    walk(id);
    return out;
  };

  const tree = useMemo(() => buildTree(q.data ?? []), [q.data]);
  const depth = Math.max(0, ...tree.map((t) => t.level));

  return (
    <>
      <SettingsHead title="Departments" sub="Nested departments, heads, cost centres and default locations.">
        <SaveBar dirty={d.dirty} saving={d.saving} onReset={d.reset} onSave={save} />
      </SettingsHead>
      <PermissionsNotice errors={[q.error, locs.error]} />
      {d.banner && <Alert>{d.banner}</Alert>}
      {rowErr && <Alert>{rowErr}</Alert>}

      <div className="card">
        <div className="card-head">
          <span>Hierarchy</span>
          <span className="field-hint" style={{ fontWeight: 400 }}>
            {depth} level{depth === 1 ? '' : 's'} · max {MAX_DEPTH}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Department</th>
                <th>Code</th>
                <th>Head</th>
                <th>People</th>
                <th>Children</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr className="loading-row">
                  <td colSpan={6}>
                    <BlockLoader height={140} size={28} label="Loading departments…" />
                  </td>
                </tr>
              )}
              {tree.map(({ d: x, level }) => (
                <tr key={x.id} style={{ cursor: 'default', opacity: x.active ? 1 : 0.55 }}>
                  <td style={{ paddingLeft: 12 + (level - 1) * 22 }}>
                    {level > 1 && <span style={{ color: 'var(--fg-3)', marginRight: 6 }}>└</span>}
                    {x.name}
                  </td>
                  <td className="mono muted">{x.code}</td>
                  <td>{x.head?.name ?? <span className="muted">—</span>}</td>
                  <td className="muted">
                    {x.headcountTotal ?? x.headcount ?? 0} {(x.headcountTotal ?? x.headcount ?? 0) === 1 ? 'person' : 'people'}
                  </td>
                  <td className="muted">{x.childCount ? `${x.childCount} sub-dept${x.childCount === 1 ? '' : 's'}` : ''}</td>
                  <td className="muted">L{level}</td>
                </tr>
              ))}
              {q.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="card-empty">
                    No departments yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="field-hint" style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          Set the parent in the table below to nest a department. Department heads get the Department head role for their department and everything under it.
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ alignItems: 'flex-start' }}>
          <span>
            Organisation · Departments
            <span className="field-hint" style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>
              Departments available across onboarding, directory filters and approvals. The head is the default approver and manager for new hires.
            </span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={d.add}>
            + Add department
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl edit-tbl">
            <thead>
              <tr>
                <th>Department</th>
                <th>Code</th>
                <th>Department head</th>
                <th>Parent</th>
                <th>Cost centre</th>
                <th>Default location</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr className="loading-row">
                  <td colSpan={20}>
                    <BlockLoader height={140} size={28} label="Loading departments…" />
                  </td>
                </tr>
              )}
              {d.rows.map((r) => {
                const e = d.errors[r.key] ?? {};
                const blocked = r.isNew ? new Set<string>() : below(r.id);
                return (
                  <tr key={r.key} className={r.isNew ? 'is-new' : ''}>
                    <td>
                      <Cell value={r.name} onChange={(v) => d.set(r.key, { name: v })} error={e.name} placeholder="e.g. Finance" />
                      {e._row && <span className="field-err">{e._row}</span>}
                    </td>
                    <td>
                      <Cell value={r.code} onChange={(v) => d.set(r.key, { code: v.toUpperCase() })} error={e.code} mono width={90} />
                    </td>
                    <td style={{ minWidth: 190 }}>
                      <PersonPicker
                        value={r.headEmployeeId ? { id: r.headEmployeeId, name: r.headName } : null}
                        onChange={(p) => d.set(r.key, { headEmployeeId: p?.id ?? '', headName: p?.name ?? '' })}
                        invalid={!!e.headEmployeeId}
                      />
                      {r.headEmployeeId && (
                        <button type="button" className="link-btn" style={{ fontSize: 11 }} onClick={() => d.set(r.key, { headEmployeeId: '', headName: '' })}>
                          clear
                        </button>
                      )}
                      {e.headEmployeeId && <span className="field-err">{e.headEmployeeId}</span>}
                    </td>
                    <td>
                      <SelectCell value={r.parentId} onChange={(v) => d.set(r.key, { parentId: v })} error={e.parentId}>
                        <option value="">None · top level</option>
                        {d.rows
                          .filter((o) => !o.isNew && o.id !== r.id && !blocked.has(o.id))
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                      </SelectCell>
                    </td>
                    <td>
                      <Cell value={r.costCentre} onChange={(v) => d.set(r.key, { costCentre: v })} error={e.costCentre} mono width={100} />
                    </td>
                    <td>
                      <SelectCell value={r.defaultLocationId} onChange={(v) => d.set(r.key, { defaultLocationId: v })} error={e.defaultLocationId}>
                        <option value="">Select</option>
                        {locs.data?.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </SelectCell>
                    </td>
                    <td>
                      <Toggle on={r.active} onChange={(v) => d.set(r.key, { active: v })} label="Active" />
                    </td>
                    <td>
                      <button type="button" className="dfx-icon-btn" title={r.isNew ? 'Remove row' : 'Delete'} onClick={() => (r.isNew ? d.drop(r.key) : remove(r))}>
                        {Icon.trash}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Depth-first order with levels, for the hierarchy view. */
function buildTree(list: Department[]): { d: Department; level: number }[] {
  const kids = new Map<string, Department[]>();
  const ids = new Set(list.map((d) => d.id));
  list.forEach((d) => {
    const p = d.parentId && ids.has(d.parentId) ? d.parentId : '';
    kids.set(p, [...(kids.get(p) ?? []), d]);
  });
  kids.forEach((v) => v.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)));
  const out: { d: Department; level: number }[] = [];
  const walk = (p: string, level: number, seen: Set<string>) =>
    (kids.get(p) ?? []).forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      out.push({ d, level });
      walk(d.id, level + 1, seen);
    });
  walk('', 1, new Set());
  return out;
}
