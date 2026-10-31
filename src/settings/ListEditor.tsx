import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { SaveBar } from './EmploymentTypesPage';
import { SettingsHead } from './SettingsLayout';
import { Cell, SelectCell, Toggle, useBeforeUnload } from './cells';
import { useDraftRows } from './useDraftRows';

export type RowBase = { id: string; version: number };
export type Col<R> = {
  key: keyof R & string;
  label: string;
  kind: 'text' | 'mono' | 'number' | 'select' | 'toggle';
  width?: number;
  placeholder?: string;
  options?: [string, string][];
  /** First option text when nothing is picked; defaults to "Select". */
  none?: string;
};

/**
 * A Configuration list edited inline, as in the design: add rows, change cells, then Save changes (or Reset). Each changed row is sent with
 * its version; rows that fail stay with their errors. Used for titles, teams, projects and the module lists.
 */
export function ListEditor<T, R extends RowBase>({
  title,
  sub,
  card,
  desc,
  addLabel,
  empty,
  queryKey,
  list,
  toRow,
  blank,
  cols,
  body,
  create,
  update,
  remove,
  removeHint,
  extra,
  refresh = [],
  saving,
  sort,
}: {
  title: string;
  sub: string;
  card: string;
  desc: string;
  addLabel: string;
  empty: string;
  queryKey: unknown[];
  list: () => Promise<T[]>;
  toRow: (t: T) => R;
  blank: () => Omit<R, 'id' | 'version'>;
  cols: Col<R>[];
  body: (r: Partial<R>) => Record<string, unknown>;
  create: (b: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, b: Record<string, unknown>, v: number) => Promise<unknown>;
  remove?: (r: R) => Promise<unknown>;
  removeHint?: string;
  extra?: { label: string; render: (r: R & { isNew: boolean }) => ReactNode };
  refresh?: unknown[][];
  saving: string;
  sort?: (a: R, b: R) => number;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey, queryFn: list });
  // Only rebuilt when the data changes: the draft resets whenever this changes identity.
  const server = useMemo(() => (q.data ? (sort ? q.data.map(toRow).sort(sort) : q.data.map(toRow)) : undefined), [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rowErr, setRowErr] = useState<string | null>(null);
  const d = useDraftRows<R>(server, cols.map((c) => c.key), blank as () => Omit<R, 'id' | 'version'>, {
    label: saving,
    create: (r) => create(body(r as Partial<R>)),
    update: (id, c, v) => update(id, body(c as Partial<R>), v),
  });
  useBeforeUnload(d.dirty > 0);
  const reload = () => {
    qc.invalidateQueries({ queryKey });
    refresh.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    qc.invalidateQueries({ queryKey: ['lookup'] });
  };
  const del = async (r: R) => {
    if (!remove) return;
    const name = String((r as Record<string, unknown>).name ?? 'this row');
    if (!confirm(`Delete "${name}"?${removeHint ? ` ${removeHint}` : ''}`)) return;
    try {
      await remove(r);
      setRowErr(null);
      reload();
    } catch (e) {
      setRowErr(`${name}: ${errorText(e)} You can switch it off (Active) instead.`);
    }
  };
  const span = cols.length + (extra ? 1 : 0) + 1;

  return (
    <>
      <SettingsHead title={title} sub={sub}>
        <SaveBar dirty={d.dirty} saving={d.saving} onReset={d.reset} onSave={async () => (await d.save(), reload())} />
      </SettingsHead>
      <PermissionsNotice errors={[q.error]} />
      {d.banner && <Alert>{d.banner}</Alert>}
      {rowErr && <Alert>{rowErr}</Alert>}
      <div className="card">
        <div className="card-head" style={{ alignItems: 'flex-start' }}>
          <span>
            {card}
            <span className="field-hint" style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>
              {desc}
            </span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={d.add}>
            + {addLabel}
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl edit-tbl">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                {extra && <th>{extra.label}</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr className="loading-row">
                  <td colSpan={span}>
                    <BlockLoader height={140} size={28} label={`Loading ${title.toLowerCase()}…`} />
                  </td>
                </tr>
              )}
              {d.rows.map((r) => {
                const e = d.errors[r.key] ?? {};
                const row = r as unknown as Record<string, unknown>;
                return (
                  <tr key={r.key} className={r.isNew ? 'is-new' : ''}>
                    {cols.map((c, i) => {
                      const v = row[c.key];
                      const setV = (x: unknown) => d.set(r.key, { [c.key]: x } as Partial<R>);
                      return (
                        <td key={c.key}>
                          {c.kind === 'toggle' ? (
                            <Toggle on={!!v} onChange={setV} label={c.label} />
                          ) : c.kind === 'select' ? (
                            <SelectCell value={String(v ?? '')} onChange={setV} error={e[c.key]} width={c.width}>
                              <option value="">{c.none ?? 'Select'}</option>
                              {c.options?.map(([ov, ol]) => (
                                <option key={ov} value={ov}>
                                  {ol}
                                </option>
                              ))}
                            </SelectCell>
                          ) : (
                            <Cell
                              type={c.kind === 'number' ? 'number' : 'text'}
                              value={String(v ?? '')}
                              onChange={(x) => setV(c.kind === 'mono' ? x.toUpperCase() : x)}
                              error={e[c.key]}
                              mono={c.kind === 'mono'}
                              width={c.width}
                              placeholder={c.placeholder}
                            />
                          )}
                          {i === 0 && e._row && <span className="field-err">{e._row}</span>}
                        </td>
                      );
                    })}
                    {extra && <td className="muted">{extra.render(r as R & { isNew: boolean })}</td>}
                    <td>
                      {(r.isNew || remove) && (
                        <button type="button" className="dfx-icon-btn" title={r.isNew ? 'Remove row' : 'Delete'} onClick={() => (r.isNew ? d.drop(r.key) : del(r as unknown as R))}>
                          {Icon.trash}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {q.data?.length === 0 && d.rows.length === 0 && (
                <tr>
                  <td colSpan={span} className="card-empty">
                    {empty}
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

/** Turns a row's string cells into the API body: blanks become null, numbers become numbers. */
export function toBody<R>(r: Partial<R>, opts: { skip?: string[]; numbers?: string[] } = {}) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
    if (['id', 'version', 'key', 'isNew', ...(opts.skip ?? [])].includes(k)) continue;
    out[k] = typeof v === 'string' ? (v.trim() === '' ? null : opts.numbers?.includes(k) ? Number(v) : v.trim()) : v;
  }
  return out;
}
