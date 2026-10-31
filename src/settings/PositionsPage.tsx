import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { api, del, errorText, get, post } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { SaveBar } from './EmploymentTypesPage';
import { SettingsHead } from './SettingsLayout';
import { Cell, SelectCell, Toggle, useBeforeUnload } from './cells';
import { useDraftRows } from './useDraftRows';
import { BlockLoader } from '../components/Splash';

type Position = {
  id: string;
  name: string;
  grade: string | null;
  level: number | null;
  track: string | null;
  bandMin: number | null;
  bandMax: number | null;
  hasBand: boolean;
  reportsToId: string | null;
  minExp: number | null;
  approves: boolean;
  active: boolean;
  headcount: number | null;
  titleCount: number | null;
  version: number;
};
type Row = { id: string; version: number; name: string; grade: string; level: string; track: string; bandMin: string; bandMax: string; reportsToId: string; minExp: string; approves: boolean; active: boolean; headcount: number | null; titleCount: number | null };

const TRACKS = [
  ['EXECUTIVE', 'Executive'],
  ['MANAGEMENT', 'Management'],
  ['INDIVIDUAL_CONTRIBUTOR', 'Individual contributor'],
];
const FIELDS: (keyof Row)[] = ['name', 'grade', 'level', 'track', 'bandMin', 'bandMax', 'reportsToId', 'minExp', 'approves', 'active'];
const NUM = new Set(['level', 'bandMin', 'bandMax', 'minExp']);
const s = (v: unknown) => (v == null ? '' : String(v));

const toRow = (p: Position): Row => ({ id: p.id, version: p.version, name: p.name, grade: s(p.grade), level: s(p.level), track: s(p.track), bandMin: s(p.bandMin), bandMax: s(p.bandMax), reportsToId: s(p.reportsToId), minExp: s(p.minExp), approves: p.approves, active: p.active, headcount: p.headcount, titleCount: p.titleCount });
const body = (r: Partial<Row>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (['id', 'version', 'headcount', 'titleCount'].includes(k)) continue;
    out[k] = typeof v === 'string' ? (v.trim() === '' ? null : NUM.has(k) ? Number(v) : v.trim()) : v;
  }
  return out;
};

const positionsApi = {
  list: () => get<Position[]>('/positions?include=stats&sort=level'),
  create: (b: Record<string, unknown>) => post<Position>('/positions', b),
  update: (id: string, b: Record<string, unknown>, v: number) => api<Position>(`/positions/${id}`, { method: 'PATCH', body: b, headers: { 'If-Match': `"${v}"` } }),
  remove: (id: string) => del<void>(`/positions/${id}`),
};

export function PositionsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings', 'positions'], queryFn: positionsApi.list });
  const server = useMemo(() => q.data?.map(toRow).sort((a, b) => Number(b.level || 0) - Number(a.level || 0)), [q.data]);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const d = useDraftRows<Row>(server, FIELDS, () => ({ name: '', grade: '', level: '', track: 'INDIVIDUAL_CONTRIBUTOR', bandMin: '', bandMax: '', reportsToId: '', minExp: '', approves: false, active: true, headcount: null, titleCount: null }), {
    label: 'Saving positions…',
    create: (r) => positionsApi.create(body(r)),
    update: (id, c, v) => positionsApi.update(id, body(c), v),
  });
  useBeforeUnload(d.dirty > 0);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['settings', 'positions'] });
    qc.invalidateQueries({ queryKey: ['lookup'] });
  };
  const remove = async (r: Row) => {
    if (!confirm(`Delete "${r.name}"? Only possible when no titles or people use it.`)) return;
    try {
      await positionsApi.remove(r.id);
      refresh();
    } catch (e) {
      setRowErr(`${r.name}: ${errorText(e)} You can switch it off (Active) instead.`);
    }
  };
  const bandsHidden = q.data?.some((p) => p.hasBand && p.bandMin == null);

  return (
    <>
      <SettingsHead title="Positions" sub="Job levels with seniority, salary bands and the usual manager position.">
        <SaveBar dirty={d.dirty} saving={d.saving} onReset={d.reset} onSave={async () => (await d.save(), refresh())} />
      </SettingsHead>
      <PermissionsNotice errors={[q.error]} />
      {d.banner && <Alert>{d.banner}</Alert>}
      {rowErr && <Alert>{rowErr}</Alert>}
      {bandsHidden && <Alert kind="info">Salary bands are hidden for your roles.</Alert>}
      <div className="card">
        <div className="card-head" style={{ alignItems: 'flex-start' }}>
          <span>
            Organisation · Positions
            <span className="field-hint" style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>
              Job levels. Level sets seniority (1 = entry), the band sets the salary range, and Reports to is the usual manager position. Titles map to a position.
            </span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={d.add}>
            + Add position
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl edit-tbl">
            <thead>
              <tr>
                <th>Position</th>
                <th>Code</th>
                <th>Level</th>
                <th>Track</th>
                <th>Band min (₹ L)</th>
                <th>Band max (₹ L)</th>
                <th>Reports to</th>
                <th>Min. exp (yrs)</th>
                <th>Approves</th>
                <th>Active</th>
                <th>Used by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr className="loading-row">
                  <td colSpan={12}>
                    <BlockLoader height={140} size={28} label="Loading positions…" />
                  </td>
                </tr>
              )}
              {d.rows.map((r) => {
                const e = d.errors[r.key] ?? {};
                return (
                  <tr key={r.key} className={r.isNew ? 'is-new' : ''}>
                    <td>
                      <Cell value={r.name} onChange={(v) => d.set(r.key, { name: v })} error={e.name} placeholder="e.g. Principal" />
                      {e._row && <span className="field-err">{e._row}</span>}
                    </td>
                    <td>
                      <Cell value={r.grade} onChange={(v) => d.set(r.key, { grade: v.toUpperCase() })} error={e.grade} mono width={70} />
                    </td>
                    <td>
                      <Cell type="number" value={r.level} onChange={(v) => d.set(r.key, { level: v })} error={e.level} width={70} />
                    </td>
                    <td>
                      <SelectCell value={r.track} onChange={(v) => d.set(r.key, { track: v })} error={e.track}>
                        <option value="">Select</option>
                        {TRACKS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </SelectCell>
                    </td>
                    <td>
                      <Cell type="number" value={r.bandMin} onChange={(v) => d.set(r.key, { bandMin: v })} error={e.bandMin} width={90} />
                    </td>
                    <td>
                      <Cell type="number" value={r.bandMax} onChange={(v) => d.set(r.key, { bandMax: v })} error={e.bandMax} width={90} />
                    </td>
                    <td>
                      <SelectCell value={r.reportsToId} onChange={(v) => d.set(r.key, { reportsToId: v })} error={e.reportsToId}>
                        <option value="">Select</option>
                        {d.rows
                          .filter((o) => !o.isNew && o.id !== r.id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                      </SelectCell>
                    </td>
                    <td>
                      <Cell type="number" value={r.minExp} onChange={(v) => d.set(r.key, { minExp: v })} error={e.minExp} width={70} />
                    </td>
                    <td>
                      <Toggle on={r.approves} onChange={(v) => d.set(r.key, { approves: v })} label="Approves" />
                    </td>
                    <td>
                      <Toggle on={r.active} onChange={(v) => d.set(r.key, { active: v })} label="Active" />
                    </td>
                    <td className="muted">{r.isNew ? '' : `${r.headcount ?? 0} people · ${r.titleCount ?? 0} titles`}</td>
                    <td>
                      <button type="button" className="dfx-icon-btn" title={r.isNew ? 'Remove row' : 'Delete'} onClick={() => (r.isNew ? d.drop(r.key) : remove(r))}>
                        {Icon.trash}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {q.data?.length === 0 && (
                <tr>
                  <td colSpan={12} className="card-empty">
                    No positions yet. Add your job levels, top to bottom.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
