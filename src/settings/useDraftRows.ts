import { useEffect, useMemo, useRef, useState } from 'react';
import { withBusy } from '../lib/busy';
import { errorText, fieldErrors } from '../lib/http';

/** A row being edited: `key` is the server id, or a temporary one for a row that isn't saved yet. */
export type Draft<T> = T & { key: string; isNew: boolean };

type Saver<T> = {
  create: (row: T) => Promise<unknown>;
  update: (id: string, changes: Partial<T>, version: number) => Promise<unknown>;
  /** What the busy layer says while saving, e.g. 'Saving departments…'. */
  label?: string;
};

/**
 * Inline-edit table state, as in the UX: edit any cell, add rows, then "Save changes" sends only what changed
 * (POST for new rows, PATCH with If-Match for edited ones) or "Reset" throws the edits away.
 */
export function useDraftRows<T extends { id: string; version: number }>(server: T[] | undefined, fields: (keyof T)[], blank: () => Omit<T, 'id' | 'version'>, saver: Saver<T>) {
  const [rows, setRows] = useState<Draft<T>[]>([]);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const original = useMemo(() => new Map((server ?? []).map((r) => [r.id, r])), [server]);
  const kept = useRef<Map<string, Draft<T>>>(new Map());
  const reset = () => {
    kept.current.clear();
    setRows((server ?? []).map((r) => ({ ...r, key: r.id, isNew: false })));
    setErrors({});
    setBanner(null);
  };
  // Fresh data from the server replaces the table, except rows whose save failed: those keep the user's edits.
  useEffect(() => {
    const keep = kept.current;
    const fromServer = (server ?? []).map((r) => {
      const f = keep.get(r.id);
      return f ? { ...f, version: r.version } : { ...r, key: r.id, isNew: false };
    });
    setRows([...fromServer, ...[...keep.values()].filter((r) => r.isNew)]);
  }, [server]);

  const changesOf = (r: Draft<T>): Partial<T> => {
    const o = original.get(r.id);
    const out: Partial<T> = {};
    if (!o) return out;
    for (const f of fields) if (JSON.stringify(r[f] ?? null) !== JSON.stringify(o[f] ?? null)) out[f] = r[f];
    return out;
  };
  const dirtyRows = rows.filter((r) => r.isNew || Object.keys(changesOf(r)).length > 0);

  const set = (key: string, patch: Partial<T>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((e) => (e[key] ? { ...e, [key]: Object.fromEntries(Object.entries(e[key]).filter(([k]) => !(k in patch))) } : e));
  };
  const add = () => {
    const key = `new-${crypto.randomUUID()}`;
    setRows((rs) => [...rs, { ...(blank() as T), id: '', version: 0, key, isNew: true }]);
    return key;
  };
  const drop = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  /** Saves every changed row; rows that fail keep their edits and show the API's field messages. */
  const save = (): Promise<boolean> => withBusy(async () => {
    setSaving(true);
    setBanner(null);
    const errs: Record<string, Record<string, string>> = {};
    let failed = 0;
    for (const r of dirtyRows) {
      try {
        if (r.isNew) {
          const { key: _k, isNew: _n, id: _i, version: _v, ...body } = r;
          await saver.create(body as unknown as T);
        } else {
          await saver.update(r.id, changesOf(r), r.version);
        }
      } catch (e) {
        failed++;
        const fe = fieldErrors(e);
        errs[r.key] = Object.keys(fe).length ? fe : { _row: errorText(e) };
      }
    }
    kept.current = new Map(dirtyRows.filter((r) => errs[r.key]).map((r) => [r.isNew ? r.key : r.id, r]));
    setErrors(errs);
    setSaving(false);
    if (failed) setBanner(failed === dirtyRows.length ? 'Nothing was saved. Fix the highlighted rows and try again.' : `${failed} row${failed === 1 ? '' : 's'} could not be saved; the other changes were saved.`);
    return failed === 0;
  }, saver.label ?? 'Saving changes…');

  return { rows, set, add, drop, reset, save, saving, dirty: dirtyRows.length, errors, banner, setBanner };
}
