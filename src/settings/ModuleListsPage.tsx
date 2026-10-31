import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { ApiError, api, errorText, get } from '../lib/http';
import { TYPE_COLORS } from '../leave/api';
import { Seg } from '../leave/ui';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { useLocations } from '../onboarding/shared';
import { usePeople } from './OrgListsPages';
import { SettingsHead } from './SettingsLayout';
import { useBeforeUnload } from './cells';

type Column = { key: string; label: string; type: 'text' | 'mono' | 'number' | 'select' | 'toggle' | 'color' | 'icon'; options: string[]; ref: string | null; refBy: 'id' | 'name' | null; required: boolean; unique: boolean };
type Spec = { module: string; lists: { key: string; label: string; columns: Column[] }[] };
type Row = Record<string, unknown> & { id?: string; lock?: boolean };
type Data = { module: string; version: number; lists: Record<string, Row[]> };
type CellErr = Record<string, Record<number, Record<string, string>>>;

/** What each list is for, from the design. */
const DESC: Record<string, string> = {
  cfields: 'Extra fields on employees, departments, positions and titles. Access decides who can see a value; masked fields show only the last 4 characters.',
  steps: 'Steps HR goes through when creating a new hire. Order with #, rename, switch off, or add your own field steps.',
  fields: 'Fields filled in for each record, grouped by step or type. Core fields can be renamed but not removed.',
  m365: 'Work account defaults per employment type. Groups accept {department} and {location}.',
  invites: 'The welcome email new hires get, per employment type. Use {first}, {company}, {doj}, {title} and {docs}.',
  portal: 'Fields new hires fill in themselves on the onboarding portal, by section.',
  docs: 'Documents new hires upload before day 1, per employment type.',
  checklist: 'Tasks done for every new hire, by phase and owner.',
  statuses: 'Lifecycle statuses. Assignable statuses can be given to a person.',
  categories: 'Groups shown in filters and reports.',
  types: 'What you track. Age is the replacement cycle in years.',
  ownership: 'Who owns the asset; each has its own ID format and return rules.',
  idformat: 'Tokens: {TYPE} code and #### running number.',
  alerts: 'Alerts trigger this many days before the event date.',
};
const ICONS: Record<string, string> = { laptop: '💻', monitor: '🖥️', phone: '📱', headphones: '🎧', globe: '🌐', box: '📦', apps: '🧩', file: '📄', briefcase: '💼', users: '👥', wallet: '👛' };

/**
 * One or more lists of a configuration module, edited inline from the API's own spec (columns, types, options and references). Each list
 * is a draft until Save; only changed lists are sent, with the module's version.
 */
export function ModuleListsPage({ title, sub, modules, only }: { title: string; sub: string; modules: { key: string; label: string }[]; only?: string[] }) {
  const [mod, setMod] = useState(modules[0].key);
  return (
    <>
      <SettingsHead title={title} sub={sub} />
      {modules.length > 1 && (
        <Seg
          value={mod}
          onChange={setMod}
          options={modules.map((m) => [m.key, m.label] as [string, string])}
        />
      )}
      <ModuleLists key={mod} module={mod} only={only} />
    </>
  );
}

function ModuleLists({ module, only }: { module: string; only?: string[] }) {
  const qc = useQueryClient();
  const spec = useQuery({ queryKey: ['config-lists', module, 'spec'], queryFn: () => get<Spec>(`/config/lists/${module}/spec`), staleTime: 10 * 60_000, retry: false });
  const data = useQuery({ queryKey: ['config-lists', module], queryFn: () => get<Data>(`/config/lists/${module}`), retry: false });
  const people = usePeople();
  const locs = useLocations();
  const lists = (spec.data?.lists ?? []).filter((l) => !only || only.includes(l.key));
  const [tab, setTab] = useState('');
  const cur = lists.find((l) => l.key === tab) ?? lists[0];
  const [draft, setDraft] = useState<Record<string, Row[]>>({});
  const [errs, setErrs] = useState<CellErr>({});
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success'; text: string } | null>(null);
  const server = useMemo(() => data.data?.lists ?? {}, [data.data]);
  useEffect(() => setDraft(structuredClone(server)), [server]);
  const changedKeys = lists.map((l) => l.key).filter((k) => JSON.stringify(draft[k] ?? []) !== JSON.stringify(server[k] ?? []));
  useBeforeUnload(changedKeys.length > 0);

  const save = useMutation({
    meta: { busy: 'Saving configuration…' },
    mutationFn: () => api<Data>(`/config/lists/${module}`, { method: 'PUT', body: { lists: Object.fromEntries(changedKeys.map((k) => [k, draft[k]])) }, headers: { 'If-Match': `"${data.data!.version}"` } }),
    onSuccess: (d) => {
      qc.setQueryData(['config-lists', module], d);
      qc.invalidateQueries({ queryKey: ['lookup'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['onboarding', 'hire-form'] });
      setErrs({});
      setMsg({ kind: 'success', text: 'Saved' });
    },
    onError: (e) => {
      const items = e instanceof ApiError && Array.isArray(e.extra.errors) ? (e.extra.errors as { listKey?: string; index?: number; column?: string; fieldKey?: string; message: string }[]) : [];
      const m: CellErr = {};
      items.forEach((it) => {
        if (it.listKey != null && it.index != null) ((m[it.listKey] ??= {})[it.index] ??= {})[it.column ?? '_row'] = it.message;
      });
      setErrs(m);
      setMsg({ kind: 'danger', text: items.length ? `Nothing was saved. ${items.length} ${items.length === 1 ? 'problem' : 'problems'} to fix${items[0].listKey ? '' : `: ${items[0].message}`}.` : errorText(e) });
    },
  });

  /** Choices for a referencing column: people, locations, or rows of another list in this module (current draft). */
  const refOptions = (c: Column): [string, string][] => {
    if (c.ref === 'employee') return people.data ?? [];
    if (c.ref === 'location') return (locs.data ?? []).map((l) => [l.id, l.name]);
    if (c.ref) return (draft[c.ref] ?? []).filter((r) => r.name).map((r) => [String(c.refBy === 'name' ? r.name : r.id), String(r.name)]);
    return c.options.map((o) => [o, o]);
  };
  const rows = cur ? (draft[cur.key] ?? []) : [];
  const setRow = (i: number, p: Row) => setDraft((d) => ({ ...d, [cur.key]: (d[cur.key] ?? []).map((r, k) => (k === i ? { ...r, ...p } : r)) }));
  const blank = (): Row => Object.fromEntries(cur.columns.filter((c) => c.key !== 'lock').map((c) => [c.key, c.type === 'toggle' ? c.key === 'active' : c.type === 'select' || c.type === 'icon' || c.type === 'color' ? (refOptions(c)[0]?.[0] ?? '') : '']));
  const cols = cur?.columns.filter((c) => c.key !== 'lock') ?? [];
  const forbidden = data.error instanceof ApiError && data.error.status === 403;

  return (
    <>
      {forbidden ? <Alert kind="info">{errorText(data.error)}</Alert> : <PermissionsNotice errors={[data.error, spec.error]} />}
      {(spec.isLoading || data.isLoading) && <BlockLoader page label="Loading configuration…" />}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {cur && data.data && (
        <div className="card">
          <div className="card-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            {lists.length > 1 ? (
              <div className="lv-subtabs ml-tabs">
                {lists.map((l) => (
                  <button key={l.key} type="button" aria-selected={l.key === cur.key} onClick={() => setTab(l.key)}>
                    {l.label}
                    {changedKeys.includes(l.key) && <span className="ml-dot" title="Unsaved" />}
                  </button>
                ))}
              </div>
            ) : (
              <span>{cur.label}</span>
            )}
            <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {changedKeys.length > 0 && (
                <>
                  <span className="field-hint" style={{ alignSelf: 'center' }}>
                    {changedKeys.length} {changedKeys.length === 1 ? 'list' : 'lists'} changed
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setDraft(structuredClone(server)), setErrs({}), setMsg(null))}>
                    Reset
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => save.mutate()}>
                    Save changes
                  </button>
                </>
              )}
            </span>
          </div>
          <div className="ml-bar">
            <span className="field-hint">{DESC[cur.key] ?? ''}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft((d) => ({ ...d, [cur.key]: [...(d[cur.key] ?? []), blank()] }))}>
              + Add {cur.label.toLowerCase().replace(/s$/, '').replace(/ie$/, 'y')}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl edit-tbl">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key}>
                      {c.label}
                      {c.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const e = errs[cur.key]?.[i] ?? {};
                  const locked = !!r.lock;
                  return (
                    <tr key={String(r.id ?? `new${i}`)} className={r.id ? '' : 'is-new'}>
                      {cols.map((c, ci) => (
                        <td key={c.key}>
                          <CellFor c={c} v={r[c.key]} opts={refOptions(c)} err={e[c.key]} locked={locked && (c.key === 'key' || c.key === 'ftype')} set={(v) => setRow(i, { [c.key]: v })} />
                          {ci === 0 && e._row && <span className="field-err">{e._row}</span>}
                        </td>
                      ))}
                      <td>
                        {!locked && (
                          <button type="button" className="dfx-icon-btn" title="Remove" onClick={() => setDraft((d) => ({ ...d, [cur.key]: (d[cur.key] ?? []).filter((_, k) => k !== i) }))}>
                            {Icon.trash}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={cols.length + 1} className="card-empty">
                      Nothing here yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function CellFor({ c, v, opts, err, locked, set }: { c: Column; v: unknown; opts: [string, string][]; err?: string; locked: boolean; set: (v: unknown) => void }) {
  const wrap = (el: React.ReactNode) => (
    <span className="cell">
      {el}
      {err && <span className="field-err">{err}</span>}
    </span>
  );
  if (c.type === 'toggle') return <button type="button" className="switch" role="switch" aria-checked={!!v} aria-label={c.label} onClick={() => set(!v)} />;
  if (c.type === 'color')
    return (
      <span className="ml-colors">
        {c.options.map((o) => {
          const [fg, bg] = TYPE_COLORS[Number(o)] ?? TYPE_COLORS[9];
          return <button key={o} type="button" aria-label={`Colour ${o}`} aria-pressed={String(v) === o} style={{ background: bg, borderColor: fg }} onClick={() => set(Number(o))} />;
        })}
      </span>
    );
  if (c.type === 'select' || c.type === 'icon')
    return wrap(
      <select className="input sm" value={String(v ?? '')} disabled={locked} onChange={(e) => set(e.target.value)} aria-invalid={!!err} aria-label={c.label} style={{ minWidth: 120 }}>
        {!c.required && <option value="">—</option>}
        {opts.map(([ov, ol]) => (
          <option key={ov} value={ov}>
            {c.type === 'icon' ? `${ICONS[ov] ?? ''} ${ol}` : ol}
          </option>
        ))}
      </select>,
    );
  return wrap(
    <input
      className={`input sm${c.type === 'mono' ? ' mono' : ''}`}
      type={c.type === 'number' ? 'number' : 'text'}
      value={v == null ? '' : String(v)}
      readOnly={locked}
      aria-invalid={!!err}
      aria-label={c.label}
      style={{ minWidth: c.type === 'number' ? 70 : c.type === 'mono' ? 90 : c.key === 'body' ? 260 : 140 }}
      onChange={(e) => set(c.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : c.type === 'mono' && c.key !== 'fmt' && c.key !== 'key' ? e.target.value.toUpperCase() : e.target.value)}
    />,
  );
}

export const CustomFieldsPage = () => <ModuleListsPage title="Custom fields" sub="Extra fields on employees, departments, positions and titles." modules={[{ key: 'onboarding', label: 'Organisation' }]} only={['cfields']} />;
export const OnboardingConfigPage = () => (
  <ModuleListsPage title="Onboarding configuration" sub="How new hires are set up: the hire form, work accounts, invite emails, the portal, documents and the checklist." modules={[{ key: 'onboarding', label: 'Onboarding' }]} only={['steps', 'fields', 'm365', 'invites', 'portal', 'docs', 'checklist']} />
);
export const AssetConfigPage = () => (
  <ModuleListsPage
    title="Asset configuration"
    sub="Statuses, categories, types, ID formats, extra fields and alerts for hardware and software."
    modules={[
      { key: 'hardware', label: 'Hardware' },
      { key: 'software', label: 'Software' },
    ]}
  />
);
