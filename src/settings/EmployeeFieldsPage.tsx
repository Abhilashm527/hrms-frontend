import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { ApiError, api, errorText, get, post } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { SettingsHead } from './SettingsLayout';
import { useBeforeUnload } from './cells';

type Field = { id?: string; key?: string; label: string; type: string; options: string[]; required: boolean; access: string; source?: string | null; sort?: number; hasData?: boolean };
type Section = { id?: string; key?: string; name: string; on: boolean; onb: boolean; builtin: boolean; sort?: number; fields: Field[] };
type Layout = { version: number; sections: Section[]; restorable: { key: string; name: string }[] };

const TYPES = ['Text', 'Long text', 'Number', 'Date', 'Email', 'Phone', 'Dropdown', 'File', 'Heading'];
const ACCESS: [string, string][] = [
  ['EDIT', 'Employee edits'],
  ['HR_APPROVES', 'Edit with HR approval'],
  ['VIEW', 'View only'],
  ['HIDDEN', 'Hidden from employee'],
];
const up = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m18 15-6-6-6 6" />
  </svg>
);
const down = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const swap = <T,>(a: T[], i: number, j: number) => {
  if (j < 0 || j >= a.length) return a;
  const n = [...a];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
};

/**
 * Configuration → Employee fields: the profile's sections (tabs) in order, which are shown, which are onboarding steps for new joiners,
 * and each custom section's fields with type, employee access and required. Edited as a draft and saved whole.
 */
export function EmployeeFieldsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings', 'employee-fields'], queryFn: () => get<Layout>('/config/employee-fields') });
  const [draft, setDraft] = useState<Section[]>([]);
  const [sel, setSel] = useState(0);
  const [confirmDel, setConfirmDel] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success' | 'info'; text: string } | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const server = useMemo(() => q.data?.sections ?? [], [q.data]);
  useEffect(() => setDraft(structuredClone(server)), [server]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(server);
  useBeforeUnload(dirty);
  const s = draft[Math.min(sel, draft.length - 1)];
  const setS = (f: (x: Section) => Section) => setDraft((d) => d.map((x, i) => (i === Math.min(sel, d.length - 1) ? f(structuredClone(x)) : x)));
  const setF = (fi: number, p: Partial<Field>) => setS((x) => ({ ...x, fields: x.fields.map((f, i) => (i === fi ? { ...f, ...p } : f)) }));
  useEffect(() => setConfirmDel(false), [sel]);

  const save = useMutation({
    meta: { busy: 'Saving employee fields…' },
    mutationFn: (force: boolean) => api<Layout>(`/config/employee-fields?force=${force}`, { method: 'PUT', body: { sections: draft }, headers: { 'If-Match': `"${q.data!.version}"` } }),
    onSuccess: (l) => (qc.setQueryData(['settings', 'employee-fields'], l), qc.invalidateQueries({ queryKey: ['employees', 'profile'] }), setAsk(null), setMsg({ kind: 'success', text: 'Employee fields saved · employee profiles updated' })),
    onError: (e) => (e instanceof ApiError && e.code === 'CONFIRM_REQUIRED' ? setAsk(e.message) : setMsg({ kind: 'danger', text: errorText(e) })),
  });
  const restore = useMutation({
    meta: { busy: 'Restoring section…' },
    mutationFn: (key: string) => post<Layout>(`/config/employee-fields/restore/${key}`),
    onSuccess: (l) => qc.setQueryData(['settings', 'employee-fields'], l),
    onError: (e) => setMsg({ kind: 'danger', text: errorText(e) }),
  });

  return (
    <>
      <SettingsHead title="Employee fields" sub="Sections appear as tabs on each employee's profile, in this order. Sections marked as onboarding steps are filled in by new joiners one step at a time.">
        {dirty && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="field-hint">Unsaved changes</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setDraft(structuredClone(server)), setMsg(null), setAsk(null))}>
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => save.mutate(false)}>
              Save
            </button>
          </span>
        )}
      </SettingsHead>
      <PermissionsNotice errors={[q.error]} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {ask && (
        <div className="lv-warn">
          {ask}{' '}
          <button type="button" className="link-btn" onClick={() => save.mutate(true)}>
            Save anyway
          </button>
        </div>
      )}
      {q.isLoading && <BlockLoader page label="Loading employee fields…" />}
      {q.data && s && (
        <div className="ef-grid">
          <div className="lv-card ef-list">
            <span className="lv-cap" style={{ padding: '10px 12px 4px' }}>
              Sections · steps
            </span>
            {draft.map((x, i) => (
              <div key={x.id ?? `new${i}`} className={`ef-sec${i === sel ? ' on' : ''}`} style={{ opacity: x.on ? 1 : 0.5 }}>
                <button type="button" className="ef-sec-btn" onClick={() => setSel(i)}>
                  <b>{x.name || 'Untitled section'}</b>
                  <small>{x.builtin ? 'Built-in' : x.key === 'custom' ? 'From Custom fields' : `${x.fields.filter((f) => f.type !== 'Heading').length} fields${x.onb ? ' · onboarding step' : ''}`}</small>
                </button>
                <button type="button" className="dfx-icon-btn" title="Move up" disabled={i === 0} onClick={() => (setDraft((d) => swap(d, i, i - 1)), setSel(i - 1))}>
                  {up}
                </button>
                <button type="button" className="dfx-icon-btn" title="Move down" disabled={i === draft.length - 1} onClick={() => (setDraft((d) => swap(d, i, i + 1)), setSel(i + 1))}>
                  {down}
                </button>
              </div>
            ))}
            {q.data.restorable.map((r) => (
              <button key={r.key} type="button" className="cx-add" disabled={dirty} title={dirty ? 'Save or discard first' : undefined} onClick={() => restore.mutate(r.key)}>
                {Icon.plus}Restore {r.name}
              </button>
            ))}
            <button type="button" className="cx-add sec" onClick={() => (setDraft((d) => [...d, { name: 'New section', on: true, onb: false, builtin: false, fields: [] }]), setSel(draft.length))}>
              {Icon.plus}Add section
            </button>
          </div>
          <div className="lv-card ef-panel">
            <div className="ef-head">
              <input className="input sm ef-name" value={s.name} onChange={(e) => setS((x) => ({ ...x, name: e.target.value }))} aria-label="Section name" />
              <label className="lv-inline">
                <button type="button" className="switch" role="switch" aria-checked={s.on} onClick={() => setS((x) => ({ ...x, on: !x.on }))} />
                Visible
              </label>
              {!s.builtin && s.key !== 'custom' && (
                <label className="lv-inline">
                  <button type="button" className="switch" role="switch" aria-checked={s.onb} onClick={() => setS((x) => ({ ...x, onb: !x.onb }))} />
                  Onboarding step
                </label>
              )}
              <span style={{ flex: 1 }} />
              {!s.builtin && s.key !== 'custom' && !confirmDel && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDel(true)}>
                  {Icon.trash} Delete section
                </button>
              )}
            </div>
            {confirmDel && (
              <div className="lv-warn ef-confirm">
                Delete “{s.name}” and its {s.fields.length} fields? Data already entered stays in employee records.
                <span className="row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmDel(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => (setDraft((d) => d.filter((_, i) => i !== sel)), setSel(Math.max(0, sel - 1)), setConfirmDel(false))}>
                    Delete
                  </button>
                </span>
              </div>
            )}
            {s.builtin ? (
              <div className="ef-note">Built-in section. Its content is drawn by the app (job details, history, documents). You can rename it, reorder it or hide it.</div>
            ) : s.key === 'custom' ? (
              <div className="ef-note">
                This section shows the employee custom fields. Add and change them in <Link to="/configuration/custom-fields">Custom fields</Link>; here you can rename, reorder or hide the section.
                {s.fields.length > 0 && <span style={{ display: 'block', marginTop: 6 }}>Fields: {s.fields.map((f) => f.label).join(', ')}</span>}
              </div>
            ) : (
              <>
                <div className="lv-tbl flat">
                  <div style={{ minWidth: 640 }}>
                    <div className="lv-head" style={{ gridTemplateColumns: EF_COLS }}>
                      {['Order', 'Field', 'Type', 'Employee access', 'Required', ''].map((h, i) => (
                        <span key={i}>{h}</span>
                      ))}
                    </div>
                    {s.fields.map((f, fi) => {
                      const head = f.type === 'Heading';
                      const locked = !!f.source;
                      return (
                        <div key={f.id ?? `n${fi}`} className={`lv-row${head ? ' ef-headrow' : ''}`} style={{ gridTemplateColumns: EF_COLS, alignItems: 'start' }}>
                          <span className="ef-order">
                            <button type="button" className="dfx-icon-btn" title="Move up" disabled={fi === 0} onClick={() => setS((x) => ({ ...x, fields: swap(x.fields, fi, fi - 1) }))}>
                              {up}
                            </button>
                            <button type="button" className="dfx-icon-btn" title="Move down" disabled={fi === s.fields.length - 1} onClick={() => setS((x) => ({ ...x, fields: swap(x.fields, fi, fi + 1) }))}>
                              {down}
                            </button>
                          </span>
                          <span className="ef-label">
                            <input className={`input sm${head ? ' ef-h' : ''}`} value={f.label} onChange={(e) => setF(fi, { label: e.target.value })} placeholder={head ? 'Sub-heading' : 'Field label'} />
                            {f.type === 'Dropdown' && <input className="input sm" value={f.options.join(', ')} onChange={(e) => setF(fi, { options: e.target.value.split(',').map((o) => o.trimStart()) })} placeholder="Options, comma separated" />}
                            {locked && <small className="field-hint">From {f.source} · view only</small>}
                          </span>
                          {locked ? (
                            <span className="muted">{f.type}</span>
                          ) : (
                            <select className="input sm" value={f.type} onChange={(e) => setF(fi, { type: e.target.value })} aria-label="Type">
                              {TYPES.map((t) => (
                                <option key={t}>{t}</option>
                              ))}
                            </select>
                          )}
                          {head ? (
                            <span />
                          ) : (
                            <select className="input sm" value={f.access} disabled={locked} onChange={(e) => setF(fi, { access: e.target.value })} aria-label="Employee access">
                              {ACCESS.map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          )}
                          {head ? <span /> : <button type="button" className="switch" role="switch" aria-checked={f.required} disabled={locked} onClick={() => setF(fi, { required: !f.required })} aria-label="Required" />}
                          <button type="button" className="dfx-icon-btn" title="Remove field" disabled={locked} onClick={() => setS((x) => ({ ...x, fields: x.fields.filter((_, i) => i !== fi) }))}>
                            {Icon.trash}
                          </button>
                        </div>
                      );
                    })}
                    {s.fields.length === 0 && <div className="lv-empty">No fields yet</div>}
                  </div>
                </div>
                <div className="ef-foot">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setS((x) => ({ ...x, fields: [...x.fields, { label: '', type: 'Text', options: [], required: false, access: 'EDIT' }] }))}>
                    {Icon.plus} Add field
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setS((x) => ({ ...x, fields: [...x.fields, { label: '', type: 'Heading', options: [], required: false, access: 'VIEW' }] }))}>
                    Add sub-heading
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const EF_COLS = '64px minmax(200px,1.6fr) 130px 190px 70px 32px';
