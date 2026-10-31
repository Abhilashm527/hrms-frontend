import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { ApiError, api, errorText, fieldErrors, get, post } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { FieldShell } from '../onboarding/shared';
import { SettingsHead } from './SettingsLayout';
import { Toggle, useBeforeUnload } from './cells';
import { BlockLoader } from '../components/Splash';

type Org = {
  id: string;
  name: string;
  legalName?: string;
  code: string;
  industry?: string;
  country: string;
  timezone: string;
  fyStartMonth: number;
  currency: string;
  primaryDomain: string;
  status?: string;
  employeeIdPrefix?: string;
  counts?: { departments: number; positions: number; titles: number; locations: number; employees: number };
  version: number;
  warnings?: string[];
};
type OrgMeta = {
  countries: { code: string; name: string }[];
  timezones: { id: string; label: string }[];
  currencies: { code: string; label: string }[];
  fyMonths: { value: number; label: string }[];
  statuses: { value: string; label: string }[];
};
type Row = { key: string; label: string; kind: 'toggle' | 'text' | 'select'; hint?: string; options?: (number | string | { value: string; label: string })[]; preview?: string };
type Meta = { groups: { key: string; label: string; rows: Row[] }[] };
type Settings = Record<string, unknown> & { preview: { nextEmployeeId: string | null; titleExample: string }; reviewed: boolean; version: number; warnings?: string[] };

const orgApi = {
  get: () => get<Org>('/org'),
  meta: () => get<OrgMeta>('/org/meta'),
  save: (body: Partial<Org>, version: number) => api<Org>('/org', { method: 'PATCH', body, headers: { 'If-Match': `"${version}"` } }),
  settings: () => get<Settings>('/org/settings'),
  settingsMeta: () => get<Meta>('/org/settings/meta'),
  saveSettings: (body: Record<string, unknown>, version: number, force: boolean) =>
    api<Settings>(`/org/settings${force ? '?force=true' : ''}`, { method: 'PATCH', body, headers: { 'If-Match': `"${version}"` } }),
  preview: (kind: string, pattern: string) => get<{ example: string; text: string }>(`/org/${kind}/preview?pattern=${encodeURIComponent(pattern)}`),
  review: () => post<unknown>('/org/setup/org_cfg/ack'),
};

const PROFILE: (keyof Org)[] = ['name', 'legalName', 'code', 'industry', 'country', 'timezone', 'fyStartMonth', 'currency', 'primaryDomain', 'status'];

export function OrganizationPage() {
  const org = useQuery({ queryKey: ['settings', 'org'], queryFn: orgApi.get });
  const meta = useQuery({ queryKey: ['settings', 'org', 'meta'], queryFn: orgApi.meta, staleTime: 30 * 60_000 });
  const settings = useQuery({ queryKey: ['settings', 'org', 'settings'], queryFn: orgApi.settings });
  const sMeta = useQuery({ queryKey: ['settings', 'org', 'settings-meta'], queryFn: orgApi.settingsMeta, staleTime: 30 * 60_000 });

  return (
    <>
      <SettingsHead title="Organization" sub="Company profile and organization-wide settings." />
      <PermissionsNotice errors={[org.error, meta.error, settings.error, sMeta.error]} />
      {org.data && meta.data && <ProfileCard org={org.data} meta={meta.data} />}
      {settings.data && sMeta.data && <SettingsCards values={settings.data} meta={sMeta.data} />}
      {(org.isLoading || settings.isLoading) && <BlockLoader page label="Loading organization details…" />}
      {settings.error instanceof ApiError && settings.error.status === 403 && !(org.error instanceof ApiError) && <Alert kind="info">Only HR admins can change organization-wide settings.</Alert>}
    </>
  );
}

function ProfileCard({ org, meta }: { org: Org; meta: OrgMeta }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Org>(org);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success'; text: string } | null>(null);
  useEffect(() => setF(org), [org]);
  const changes = useMemo(() => Object.fromEntries(PROFILE.filter((k) => (f[k] ?? '') !== (org[k] ?? '')).map((k) => [k, f[k] === '' ? null : f[k]])), [f, org]);
  const dirty = Object.keys(changes).length;
  useBeforeUnload(dirty > 0);
  const set = <K extends keyof Org>(k: K, v: Org[K]) => {
    setF((o) => ({ ...o, [k]: v }));
    setErrs((e) => ({ ...e, [k]: '' }));
  };
  const save = useMutation({
    meta: { busy: 'Saving organization details…' },
    mutationFn: () => orgApi.save(changes as Partial<Org>, org.version),
    onSuccess: () => {
      setMsg({ kind: 'success', text: 'Profile saved' });
      qc.invalidateQueries({ queryKey: ['settings', 'org'] });
    },
    onError: (e) => {
      setErrs(fieldErrors(e));
      setMsg({ kind: 'danger', text: errorText(e) });
    },
  });
  const text = (k: keyof Org, label: string, mono = false) => (
    <FieldShell label={label} error={errs[k]}>
      <input className={`input sm${mono ? ' mono' : ''}`} value={(f[k] as string) ?? ''} aria-invalid={!!errs[k]} onChange={(e) => set(k, e.target.value as never)} />
    </FieldShell>
  );
  const select = (k: keyof Org, label: string, opts: { value: string | number; label: string }[], num = false) => (
    <FieldShell label={label} error={errs[k]}>
      <select className="input sm" value={String(f[k] ?? '')} onChange={(e) => set(k, (num ? Number(e.target.value) : e.target.value) as never)}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
  return (
    <div className="card">
      <div className="card-head">
        <span>Profile</span>
        <span className="field-hint" style={{ fontWeight: 400 }}>
          Single organization · changes apply right away
        </span>
      </div>
      <div className="card-body">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {org.warnings?.map((w) => (
          <Alert key={w} kind="info">
            {w}
          </Alert>
        ))}
        <div className="form-grid">
          {text('name', 'Display name')}
          {text('legalName', 'Legal name')}
          {text('code', 'Organization code', true)}
          {text('industry', 'Industry')}
          {select('country', 'Country', meta.countries.map((c) => ({ value: c.code, label: c.name })))}
          {select('timezone', 'Time zone', meta.timezones.map((z) => ({ value: z.id, label: z.label })))}
          {select('fyStartMonth', 'Financial year', meta.fyMonths, true)}
          {select('currency', 'Currency', meta.currencies.map((c) => ({ value: c.code, label: c.label })))}
          {text('primaryDomain', 'Primary domain', true)}
          {meta.statuses.length > 0 && select('status', 'Status', meta.statuses)}
        </div>
        {org.counts && (
          <span className="field-hint">
            {org.counts.employees} employees · {org.counts.departments} departments · {org.counts.positions} positions · {org.counts.titles} titles · {org.counts.locations} locations
          </span>
        )}
        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || save.isPending} onClick={() => (setF(org), setErrs({}), setMsg(null))}>
            Reset
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Each settings group as a card; toggles and choices save as soon as they change, text rows on blur. */
function SettingsCards({ values, meta }: { values: Settings; meta: Meta }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success' | 'info'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ body: Record<string, unknown>; text: string; breaks: string[] } | null>(null);

  const save = useMutation({
    meta: { busy: 'Saving settings…' },
    mutationFn: ({ body, force }: { body: Record<string, unknown>; force: boolean }) => orgApi.saveSettings(body, values.version, force),
    onSuccess: (r, v) => {
      qc.setQueryData(['settings', 'org', 'settings'], r);
      setConfirm(null);
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !(k in v.body))));
      setMsg(r.warnings?.length ? { kind: 'info', text: r.warnings.join(' ') } : { kind: 'success', text: 'Saved' });
      // Password policy and 2-step change what the sign-in page offers.
      if ('pwPolicy' in v.body || 'twoFA' in v.body) qc.invalidateQueries({ queryKey: ['auth', 'config'] });
    },
    onError: (e, v) => {
      if (e instanceof ApiError && e.code === 'CONFIRM_REQUIRED') return setConfirm({ body: v.body, text: e.message, breaks: (e.extra.breaks as string[]) ?? [] });
      if (e instanceof ApiError && e.code === 'STALE') qc.invalidateQueries({ queryKey: ['settings', 'org', 'settings'] });
      setErrs(fieldErrors(e));
      setMsg({ kind: 'danger', text: errorText(e) });
    },
  });
  const send = (body: Record<string, unknown>) => {
    setErrs({});
    save.mutate({ body, force: false });
  };

  const review = useMutation({ meta: { busy: 'Marking as reviewed…' }, mutationFn: orgApi.review, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'org', 'settings'] }) });

  return (
    <>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {confirm && (
        <Alert kind="danger">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{confirm.text}</span>
            {confirm.breaks.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {confirm.breaks.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <span className="row-actions">
              <button type="button" className="btn btn-danger btn-sm" disabled={save.isPending} onClick={() => save.mutate({ body: confirm.body, force: true })}>
                Change anyway
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setConfirm(null), qc.invalidateQueries({ queryKey: ['settings', 'org', 'settings'] }))}>
                Keep as it was
              </button>
            </span>
          </span>
        </Alert>
      )}
      {meta.groups.map((g) => (
        <div className="card" key={g.key}>
          <div className="card-head">{g.label}</div>
          {g.rows.map((r) => {
            const v = values[r.key];
            return (
              <div className="set-row" key={r.key}>
                <span className="txt">
                  <b>{r.label}</b>
                  {r.hint && <span>{r.hint}</span>}
                  {errs[r.key] && <span className="field-err">{errs[r.key]}</span>}
                </span>
                {r.kind === 'toggle' && <Toggle on={!!v} onChange={(on) => send({ [r.key]: on })} label={r.label} />}
                {r.kind === 'select' && (
                  <select className="input sm" style={{ width: 220 }} value={String(v ?? '')} disabled={save.isPending} onChange={(e) => send({ [r.key]: typeof r.options?.[0] === 'number' ? Number(e.target.value) : e.target.value })}>
                    {r.options?.map((o) => {
                      const val = typeof o === 'object' ? o.value : o;
                      const label = typeof o === 'object' ? o.label : String(o);
                      return (
                        <option key={String(val)} value={String(val)}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                )}
                {r.kind === 'text' && <TextSetting row={r} value={draft[r.key] ?? String(v ?? '')} saved={String(v ?? '')} onChange={(t) => setDraft((d) => ({ ...d, [r.key]: t }))} onSave={(t) => send({ [r.key]: t })} preview={r.key === 'idFmt' ? values.preview.nextEmployeeId : r.key === 'titleFmt' ? values.preview.titleExample : null} />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="field-hint">Setting changes are recorded in the access audit log.</span>
        {values.reviewed ? (
          <span className="pill pill-ok">Settings reviewed</span>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={review.isPending} onClick={() => review.mutate()}>
            Mark settings reviewed
          </button>
        )}
      </div>
    </>
  );
}

/** A pattern setting (employee ID, title format): live preview from the API while typing, saved on Enter or blur. */
function TextSetting({ row, value, saved, onChange, onSave, preview }: { row: Row; value: string; saved: string; onChange: (v: string) => void; onSave: (v: string) => void; preview: string | null }) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(t);
  }, [value]);
  const live = useQuery({
    queryKey: ['settings', 'org', 'preview', row.preview, debounced],
    queryFn: () => orgApi.preview(row.preview!, debounced),
    enabled: !!row.preview && debounced !== saved && debounced.length > 0,
    retry: false,
  });
  const shown = debounced !== saved ? (live.data?.text ?? live.data?.example ?? (live.isError ? 'Invalid pattern' : '…')) : preview ? (row.key === 'idFmt' ? `Next ID: ${preview}` : `Shows as: ${preview}`) : null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {shown && <span className="mono field-hint">{shown}</span>}
      <input
        className="input sm mono"
        style={{ width: 220 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => value !== saved && onSave(value)}
        onKeyDown={(e) => e.key === 'Enter' && value !== saved && onSave(value)}
      />
    </span>
  );
}
