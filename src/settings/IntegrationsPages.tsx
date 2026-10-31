import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { Alert } from '../components/Alert';
import { BlockLoader } from '../components/Splash';
import { ApiError, errorText, get, post } from '../lib/http';
import { Seg, fmtDate, fmtTime } from '../leave/ui';
import { useDepartments, useLocations } from '../onboarding/shared';
import { usePeople } from './OrgListsPages';
import { SettingsHead } from './SettingsLayout';

// ------------------------------------------------------------------ OpenFGA

type Status = {
  apiUrl: string;
  storeId: string | null;
  modelId: string | null;
  tokenSet: boolean;
  configured: boolean;
  health: string;
  latencyMs: number;
  outbox: { pending: number; failing: number; gaveUp: number; written24h: number; lastWrittenAt: string | null; lastError: string | null };
};
const ORG = '00000000-0000-0000-0000-000000000001';

/** Relations per type, read from the model text so the checker always matches the deployed model. */
function relationsOf(dsl: string) {
  const out: Record<string, string[]> = {};
  let cur = '';
  for (const line of dsl.split('\n')) {
    const t = line.match(/^type (\w+)/);
    if (t) cur = t[1];
    const d = line.match(/^\s+define (\w+):/);
    if (d && cur) (out[cur] ??= []).push(d[1]);
  }
  return out;
}

/** Configuration → OpenFGA: where permissions are evaluated — connection, sync health, the model, and a permission checker. */
export function OpenFgaPage() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['settings', 'fga', 'status'], queryFn: () => get<Status>('/admin/fga/status'), retry: false });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const sync = useMutation({
    meta: { busy: 'Syncing permissions to OpenFGA…' },
    mutationFn: () => post<{ queued: number }>('/admin/fga/sync'),
    onSuccess: (r) => (setMsg({ kind: 'success', text: `${r.queued} tuples queued · they're written within a few seconds` }), qc.invalidateQueries({ queryKey: ['settings', 'fga'] })),
    onError: (e) => setMsg({ kind: 'danger', text: errorText(e) }),
  });
  const retry = useMutation({
    meta: { busy: 'Re-queuing failed changes…' },
    mutationFn: () => post<{ requeued: number }>('/admin/fga/retry'),
    onSuccess: (r) => (setMsg({ kind: 'success', text: `${r.requeued} changes put back in the queue` }), qc.invalidateQueries({ queryKey: ['settings', 'fga'] })),
    onError: (e) => setMsg({ kind: 'danger', text: errorText(e) }),
  });
  const s = status.data;
  const forbidden = status.error instanceof ApiError && status.error.status === 403;
  const up = s?.health === 'UP';

  return (
    <>
      <SettingsHead title="OpenFGA" sub="Relationship-based permissions: who can see and approve what is checked here, from the roles, managers and departments you set up." />
      {forbidden && <Alert kind="info">Only a super admin can see the OpenFGA settings.</Alert>}
      {status.isError && !forbidden && <Alert>{errorText(status.error)}</Alert>}
      {status.isLoading && <BlockLoader page label="Checking OpenFGA…" />}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {s && (
        <div className="lv-stack" style={{ maxWidth: 980 }}>
          <div className="lv-card fga-card">
            <div className="fga-head">
              <b>Connection</b>
              <span className={`pill ${up ? 'pill-ok' : 'pill-danger'}`}>{up ? `Connected · ${s.latencyMs} ms` : s.health === 'UNREACHABLE' ? 'Not reachable' : s.health}</span>
            </div>
            <div className="fga-grid">
              <Ro label="API URL" v={s.apiUrl} />
              <Ro label="Store ID" v={s.storeId ?? 'Not set'} />
              <Ro label="Authorization model ID" v={s.modelId ?? 'Latest model in the store'} />
              <Ro label="API token" v={s.tokenSet ? '•••••••• (set)' : 'Not used'} />
            </div>
            <div className="fga-foot">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => status.refetch()} disabled={status.isFetching}>
                {status.isFetching ? 'Testing…' : 'Test connection'}
              </button>
              <span className="field-hint">These come from the server's environment (FGA_API_URL, FGA_STORE_ID, FGA_MODEL_ID, FGA_API_TOKEN) and are changed on the server, not here.</span>
            </div>
            {!up && <div className="lv-warn" style={{ margin: '0 16px 14px' }}>OpenFGA isn't answering. Permission checks are denied until it is back; changes wait in the queue below. On a free hosting plan the OpenFGA service may be asleep — open it once or keep it awake.</div>}
          </div>

          <div className="lv-card fga-card">
            <div className="fga-head">
              <b>Sync</b>
            </div>
            <div className="fga-stats">
              <Stat k="Waiting to write" v={s.outbox.pending} bad={s.outbox.pending > 50} />
              <Stat k="Retrying" v={s.outbox.failing} bad={s.outbox.failing > 0} />
              <Stat k="Gave up" v={s.outbox.gaveUp} bad={s.outbox.gaveUp > 0} />
              <Stat k="Written in 24 h" v={s.outbox.written24h} />
              <Stat k="Last write" v={s.outbox.lastWrittenAt ? `${fmtDate(s.outbox.lastWrittenAt)} ${fmtTime(s.outbox.lastWrittenAt)}` : '—'} />
            </div>
            {s.outbox.lastError && <div className="fga-err">Last error: {s.outbox.lastError}</div>}
            <div className="fga-foot">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => sync.mutate()}>
                Sync now
              </button>
              {s.outbox.gaveUp > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => retry.mutate()}>
                  Retry {s.outbox.gaveUp} failed
                </button>
              )}
              <span className="field-hint">Every change in Roles, Role assignments, managers and departments is written automatically. Sync now rebuilds everything from the database — use it after OpenFGA was reset or was down for long.</span>
            </div>
          </div>

          <button type="button" className="fga-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span>{open ? '▾' : '▸'}</span> Model and permission check
          </button>
          {open && <ModelAndCheck />}
        </div>
      )}
    </>
  );
}

function ModelAndCheck() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'check' | 'model'>('check');
  const model = useQuery({ queryKey: ['settings', 'fga', 'model'], queryFn: () => get<{ dsl: string }>('/admin/fga/model'), staleTime: 10 * 60_000 });
  const rels = useMemo(() => relationsOf(model.data?.dsl ?? ''), [model.data]);
  const people = usePeople();
  const depts = useDepartments();
  const locs = useLocations();
  const [who, setWho] = useState(user?.employeeId ?? '');
  const [type, setType] = useState('employee');
  const [obj, setObj] = useState('');
  const [rel, setRel] = useState('');
  const objects: [string, string][] =
    type === 'org'
      ? [[ORG, 'This organization']]
      : type === 'employee'
        ? (people.data ?? [])
        : type === 'department'
          ? (depts.data ?? []).map((d) => [d.id, d.name])
          : type === 'location'
            ? (locs.data ?? []).map((l) => [l.id, l.name])
            : type === 'config_area'
              ? ['employee_profile', 'onboarding', 'leave', 'attendance', 'requests', 'assets', 'recruiting', 'payroll', 'performance'].map((k) => [k, k])
              : [];
  const relList = (rels[type] ?? []).filter((r) => !['org', 'parent', 'dept', 'location', 'manager_emp'].includes(r));
  const object = obj || objects[0]?.[0] || '';
  const relation = relList.includes(rel) ? rel : (relList.find((r) => r.startsWith('can_')) ?? relList[0] ?? '');
  const check = useMutation({ mutationFn: () => post<{ allowed: boolean; ms: number }>('/admin/fga/check', { user: `user:${who}`, relation, object: `${type}:${object}` }) });
  const name = (id: string) => people.data?.find(([v]) => v === id)?.[1] ?? id;

  return (
    <div className="lv-card fga-card">
      <div className="fga-head">
        <Seg
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            ['check', 'Check'],
            ['model', 'Model'],
          ]}
        />
        {tab === 'model' && model.data && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([model.data!.dsl], { type: 'text/plain' }));
              Object.assign(document.createElement('a'), { href: url, download: 'hrms.fga' }).click();
              URL.revokeObjectURL(url);
            }}
          >
            Download model
          </button>
        )}
      </div>
      {tab === 'model' && (model.isLoading ? <BlockLoader height={200} label="Loading model…" /> : <pre className="fga-dsl">{model.data?.dsl}</pre>)}
      {tab === 'check' && (
        <div className="fga-check">
          <div className="fga-grid">
            <label className="lv-field">
              <span>User</span>
              <select className="input sm" value={who} onChange={(e) => setWho(e.target.value)}>
                {(people.data ?? []).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="lv-field">
              <span>Type</span>
              <select className="input sm" value={type} onChange={(e) => (setType(e.target.value), setObj(''), setRel(''))}>
                {Object.keys(rels)
                  .filter((t) => ['org', 'department', 'location', 'employee', 'config_area'].includes(t))
                  .map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
              </select>
            </label>
            <label className="lv-field">
              <span>Object</span>
              <select className="input sm" value={object} onChange={(e) => setObj(e.target.value)}>
                {objects.map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="lv-field">
              <span>Relation</span>
              <select className="input sm" value={relation} onChange={(e) => setRel(e.target.value)}>
                {relList.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="fga-foot">
            <button type="button" className="btn btn-primary btn-sm" disabled={!who || !object || !relation || check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? 'Checking…' : 'Check'}
            </button>
            {check.data && (
              <span className={`pill ${check.data.allowed ? 'pill-ok' : 'pill-danger'}`}>
                {check.data.allowed ? 'Allowed' : 'Denied'} · {name(who)} {relation} {type} · {check.data.ms} ms
              </span>
            )}
            {check.isError && <span className="err">{errorText(check.error)}</span>}
            <code className="fga-code">
              check user:{who.slice(0, 8)}… {relation} {type}:{String(object).slice(0, 12)}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

function Ro({ label, v }: { label: string; v: string }) {
  return (
    <label className="lv-field">
      <span>{label}</span>
      <input className="input sm mono" value={v} readOnly />
    </label>
  );
}
function Stat({ k, v, bad }: { k: string; v: number | string; bad?: boolean }) {
  return (
    <span className="fga-stat">
      <small>{k}</small>
      <b style={bad ? { color: 'var(--danger-fg)' } : undefined}>{v}</b>
    </span>
  );
}

// ------------------------------------------------------------------ Microsoft Teams

const EVENTS: [string, string][] = [
  ['Leave notifications', 'Reminders sent from Leave & attendance → Notifications'],
  ['Holiday changes', 'Holidays added, moved or removed'],
  ['Company events', 'Events added to the company calendar'],
  ['Approved leave', "Who is off, posted when leave is approved"],
];

/**
 * Configuration → Microsoft Teams. Posting to Teams needs a Microsoft Graph app registration and channel mappings on the server, which
 * the API doesn't have yet; the page shows what it will do and says so plainly rather than pretending to connect.
 */
export function TeamsIntegrationPage() {
  return (
    <>
      <SettingsHead title="Microsoft Teams" sub="Post leave notifications, holiday changes, company events and approved leave to your Teams channels." />
      <div className="lv-stack" style={{ maxWidth: 860 }}>
        <div className="lv-card tm-card">
          <span className="tm-logo" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 32 32">
              <rect x="2" y="7" width="18" height="18" rx="3" fill="#5059C9" />
              <path d="M7 12h8M11 12v9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="25" cy="10" r="3.5" fill="#7B83EB" />
              <rect x="21" y="15" width="9" height="10" rx="3" fill="#7B83EB" />
            </svg>
          </span>
          <span className="lv-two" style={{ flex: 1 }}>
            <b style={{ fontSize: 14 }}>Microsoft Teams</b>
            <span style={{ whiteSpace: 'normal' }}>Employees still get in-app and email notifications either way.</span>
          </span>
          <span className="pill no-dot pill-muted">Not connected</span>
        </div>
        <Alert kind="info">
          Connecting Teams needs the server side first: an Entra app registration with permission to post channel messages (ChannelMessage.Send), and storage for which channel gets which event. Until then nothing is posted to Teams. Ask me to add it and this page will connect.
        </Alert>
        <div className="lv-card">
          <div className="lc-head">
            <b>What gets posted</b>
            <span>Once connected you pick a channel for each event.</span>
          </div>
          {EVENTS.map(([l, d]) => (
            <div key={l} className="lv-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 200px' }}>
              <span className="lv-two">
                <b>{l}</b>
                <span>{d}</span>
              </span>
              <select className="input sm" disabled aria-label={`${l} channel`}>
                <option>None</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
