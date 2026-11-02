import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { useDepartments, useLocations } from '../onboarding/shared';
import {
  WEEKDAYS,
  dayLabel,
  defaultPeriod,
  fullDay,
  iso,
  ord,
  periods,
  rptApi,
  runsLabel,
  wdShort,
  weekdayLabel,
  when,
  type Export,
  type Home,
  type Report,
  type Schedule,
} from './api';

type Tab = 'ov' | 'lib' | 'sch' | 'hist';

const svg = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const IC: Record<string, ReactNode> = {
  users: Icon.users,
  userPlus: Icon.userPlus,
  download: Icon.download,
  clock: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
};
const EDIT = svg(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
);
const SHIELD = svg(<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z" />);
const BAR_C = ['var(--brand)', '#0EA5E9', '#7C3AED', '#F59E0B', '#10B981', '#EF4444', '#64748B', '#DB2777'];

function Badge({ tone, children }: { tone: 'ok' | 'muted' | 'bad' | 'warn'; children: ReactNode }) {
  return <span className={`rx-badge ${tone}`}>{children}</span>;
}
const histTone = (s: Export['status']) => (s === 'Ready' ? 'ok' : s === 'Failed' ? 'bad' : 'muted');

function useToast() {
  const [t, setT] = useState<string | null>(null);
  const show = (m: string) => {
    setT(m);
    window.setTimeout(() => setT((x) => (x === m ? null : x)), 3200);
  };
  return [t, show] as const;
}

/** Reports: overview, the library, email schedules and export history. */
export function ReportsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'ov';
  const go = (t: Tab) => setSp(t === 'ov' ? {} : { tab: t }, { replace: true });
  const home = useQuery({ queryKey: ['reports'], queryFn: rptApi.home });
  const [run, setRun] = useState<string | null>(null);
  const [sched, setSched] = useState<{ key: string; s: Schedule | null } | null>(null);
  const [toast, setToast] = useToast();
  const [err, setErr] = useState<string | null>(null);

  if (home.isLoading) return <BlockLoader page label="Loading reports…" />;
  if (home.isError || !home.data) return <Alert>{errorText(home.error)}</Alert>;
  const h = home.data;
  const byKey = Object.fromEntries(h.reports.map((r) => [r.key, r]));
  const onCount = h.schedules.filter((s) => s.enabled).length;
  const download = (x: Export) =>
    rptApi.download(x.id, `${x.key}-${x.at.slice(0, 10)}.${x.format.toLowerCase()}`).then(
      () => setToast(`Downloading ${x.name} · ${x.format}`),
      (e) => setErr(errorText(e)),
    );
  const tabs: [Tab, string, number?][] = [
    ['ov', 'Overview'],
    ['lib', 'Library', h.reports.length],
    ['sch', 'Scheduled', onCount],
    ['hist', 'Export history'],
  ];

  return (
    <div className="rx-page">
      <div className="ml-top">
        <span>
          <h1>Reports</h1>
          <small>Run, schedule and download reports across the organisation</small>
        </span>
      </div>
      <div className="dfx-tabbar" role="tablist">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => go(k)}>
            {l}
            {n != null ? <span className="dfx-count">{n}</span> : null}
          </button>
        ))}
      </div>
      {err && <Alert>{err}</Alert>}
      {h.reports.length === 0 && tab !== 'ov' ? (
        <div className="rx-empty">Reports follow module access — ask an admin for View on the modules you need.</div>
      ) : (
        <>
          {tab === 'ov' && <Overview h={h} byKey={byKey} onRun={setRun} go={go} download={download} />}
          {tab === 'lib' && <Library h={h} onRun={setRun} onSchedule={(key) => setSched({ key, s: null })} />}
          {tab === 'sch' && (
            <Schedules
              h={h}
              onNew={() => setSched({ key: h.frequent[0]?.key ?? h.reports[0].key, s: null })}
              onEdit={(s) => setSched({ key: s.key, s })}
              onRun={setRun}
              toast={setToast}
            />
          )}
          {tab === 'hist' && <History onDownload={download} onRun={setRun} />}
        </>
      )}
      {run && byKey[run] && (
        <RunDialog
          r={byKey[run]}
          cycles={h.cycles}
          onClose={() => setRun(null)}
          onSchedule={() => (setSched({ key: run, s: null }), setRun(null))}
          onDone={(m) => (setRun(null), setToast(m))}
        />
      )}
      {sched && <ScheduleDialog h={h} init={sched} onClose={() => setSched(null)} onDone={(m) => (setSched(null), setToast(m), go('sch'))} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ overview

function Panel({ title, link, onLink, children }: { title: string; link?: string; onLink?: () => void; children: ReactNode }) {
  return (
    <div className="rx-panel">
      <div className="rx-panel-head">
        <span>{title}</span>
        {link && (
          <button type="button" className="rx-link" onClick={onLink}>
            {link}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Overview({ h, byKey, onRun, go, download }: { h: Home; byKey: Record<string, Report>; onRun: (k: string) => void; go: (t: Tab) => void; download: (x: Export) => void }) {
  const catL = (k: string) => h.cats.find((c) => c.key === k)?.label ?? k;
  const hcMax = Math.max(1, ...(h.hcBars ?? []).map((b) => b.n));
  const upcoming = h.schedules.filter((s) => s.enabled).slice(0, 4);
  return (
    <div className="rx-ov">
      <div className="rx-kpis">
        {h.kpis.map((k) => (
          <div key={k.label} className="rx-kpi">
            <span className="rx-kpi-ic">{IC[k.icon] ?? Icon.file}</span>
            <span className="rx-kpi-tx">
              <span>{k.label}</span>
              <b>{k.value.toLocaleString('en-IN')}</b>
              <small className={k.bad ? 'bad' : ''}>{k.sub}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="rx-grid">
        <Panel title="Frequently run" link="All reports" onLink={() => go('lib')}>
          {h.frequent.length === 0 && <div className="rx-none">No reports available to your role</div>}
          {h.frequent.map((f) => {
            const r = byKey[f.key];
            return (
              r && (
                <div key={f.key} className="rx-item">
                  <span className="dfx-conn-icon rx-fic">{Icon.file}</span>
                  <span className="rx-item-tx">
                    <b>{r.name}</b>
                    <small>
                      {catL(r.cat)}
                      {f.count ? ` · run ${f.count} ${f.count === 1 ? 'time' : 'times'} recently` : ''}
                    </small>
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRun(r.key)}>
                    Run
                  </button>
                </div>
              )
            );
          })}
        </Panel>
        <Panel title="Coming up" link="Manage schedules" onLink={() => go('sch')}>
          {upcoming.length === 0 && <div className="rx-none">No reports scheduled</div>}
          {upcoming.map((s) => (
            <div key={s.id} className="rx-up">
              <span className="rx-up-when">
                <b>{dayLabel(s.next)}</b>
                <small>
                  {wdShort(s.next)} · {s.time}
                </small>
              </span>
              <span className="rx-item-tx">
                <span className="rx-strong">{s.name}</span>
                <small className="rx-ell">
                  {s.format} to {s.to}
                </small>
              </span>
            </div>
          ))}
        </Panel>
        <Panel title="Recent exports" link="History" onLink={() => go('hist')}>
          {h.recent.length === 0 && <div className="rx-none">Nothing exported yet</div>}
          {h.recent.map((x) => (
            <div key={x.id} className="rx-item">
              <span className="rx-item-tx">
                <span className="rx-strong">{x.name}</span>
                <small>
                  {x.by} · {when(x.at)}
                </small>
              </span>
              {x.status === 'Ready' ? (
                <button type="button" className="dfx-icon-btn" title="Download" onClick={() => download(x)}>
                  {Icon.download}
                </button>
              ) : (
                <Badge tone={histTone(x.status)}>{x.status}</Badge>
              )}
            </div>
          ))}
        </Panel>
        {h.hcBars && (
          <Panel title="Headcount by department">
            <div className="rx-bars">
              {h.hcBars.map((b, i) => (
                <div key={b.label} className="rx-bar">
                  <span>{b.label}</span>
                  <span className="rx-track">
                    <span style={{ width: `${(b.n / hcMax) * 100}%`, background: BAR_C[i % BAR_C.length] }} />
                  </span>
                  <b>{b.n}</b>
                </div>
              ))}
            </div>
          </Panel>
        )}
        {h.leaveBars && (
          <Panel title="Leave utilisation · YTD">
            <div className="rx-bars">
              {h.leaveBars.length === 0 && <div className="rx-none">No leave credited this year</div>}
              {h.leaveBars.map((b, i) => (
                <div key={b.label} className="rx-bar wide">
                  <span>{b.label}</span>
                  <span className="rx-track">
                    <span style={{ width: `${Math.min(100, b.pct)}%`, background: BAR_C[i % BAR_C.length] }} />
                  </span>
                  <b>{b.pct}%</b>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ library

function Library({ h, onRun, onSchedule }: { h: Home; onRun: (k: string) => void; onSchedule: (k: string) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const t = q.trim().toLowerCase();
  const match = (r: Report) => !t || `${r.name} ${r.desc} ${r.cols.join(' ')}`.toLowerCase().includes(t);
  const groups = h.cats
    .filter((c) => cat === 'all' || c.key === cat)
    .map((c) => ({ ...c, items: h.reports.filter((r) => r.cat === c.key && match(r)) }))
    .filter((g) => g.items.length);
  const n = groups.reduce((a, g) => a + g.items.length, 0);
  const cats = h.cats.filter((c) => h.reports.some((r) => r.cat === c.key));
  return (
    <div className="rx-lib">
      <div className="rx-libbar">
        <span className="rx-search">
          {Icon.search}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search reports, columns…" aria-label="Search reports" />
        </span>
        <span className="rx-muted">
          {n} of {h.reports.length} reports
        </span>
      </div>
      <div className="rx-chips">
        {[{ key: 'all', label: 'All' }, ...cats].map((c) => (
          <button key={c.key} type="button" className="chip" aria-pressed={cat === c.key} onClick={() => setCat(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g.key} className="rx-group">
          <div className="rx-group-head">
            <span>{g.label}</span>
            <small>{g.items.length}</small>
          </div>
          <div className="rx-list">
            {g.items.map((r) => (
              <div key={r.key} className="rx-row">
                <span className="dfx-conn-icon rx-fic">{Icon.file}</span>
                <span className="rx-row-tx">
                  <span className="rx-row-name">
                    <b>{r.name}</b>
                    {r.restricted && (
                      <span className="rx-restricted">
                        <span>{SHIELD}</span>Restricted
                      </span>
                    )}
                  </span>
                  <span className="rx-row-desc">{r.desc}</span>
                  <small>
                    {r.freq} · {r.fmts.join(', ')}
                    {r.last ? ` · last run ${when(r.last.at)} by ${r.last.by}` : ''}
                  </small>
                </span>
                <span className="rx-row-acts">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSchedule(r.key)}>
                    Schedule
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRun(r.key)}>
                    {Icon.download} Run
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {n === 0 && <div className="rx-empty">No reports match “{q}”</div>}
    </div>
  );
}

// ------------------------------------------------------------------ schedules and history

function Toggle({ on, onClick, title }: { on: boolean; onClick: () => void; title: string }) {
  return (
    <button type="button" className={`rx-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} title={title} onClick={onClick}>
      <span />
    </button>
  );
}

function Schedules({ h, onNew, onEdit, onRun, toast }: { h: Home; onNew: () => void; onEdit: (s: Schedule) => void; onRun: (k: string) => void; toast: (m: string) => void }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const flip = useMutation({
    mutationFn: (s: Schedule) => rptApi.enable(s.id, !s.enabled),
    onSuccess: (_r, s) => (qc.invalidateQueries({ queryKey: ['reports'] }), toast(`${s.name} ${s.enabled ? 'paused' : 'resumed'}`)),
    onError: (e) => setErr(errorText(e)),
  });
  return (
    <div className="rx-sec">
      <div className="rx-sec-bar">
        <span>Scheduled reports are emailed as attachments. Recipients who are employees only receive reports they have access to, and restricted fields are always masked.</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
          {Icon.plus} New schedule
        </button>
      </div>
      {err && <Alert>{err}</Alert>}
      {h.schedules.length === 0 ? (
        <div className="rx-empty">No reports scheduled</div>
      ) : (
        <div className="rx-table">
          <div className="rx-tbl sch">
            <div className="rx-th">
              <span>Report</span>
              <span>Runs</span>
              <span>Recipients</span>
              <span>Format</span>
              <span>Next run</span>
              <span>Last run</span>
              <span>On</span>
              <span />
            </div>
            {h.schedules.map((s) => (
              <div key={s.id} className="rx-tr">
                <span className="rx-cell2">
                  <b>{s.name}</b>
                  <small>{s.cat}</small>
                </span>
                <span className="rx-muted2">{runsLabel(s)}</span>
                <span className="rx-muted2 rx-ell" title={s.to}>
                  {s.to}
                </span>
                <span className="rx-mono">{s.format}</span>
                <span className={s.enabled ? '' : 'rx-muted'}>{s.enabled ? fullDay(s.next) : 'Paused'}</span>
                <span className="rx-last">
                  <Badge tone={s.last === 'FAILED' ? 'bad' : s.last === 'DELIVERED' ? 'ok' : 'warn'}>{s.last === 'FAILED' ? 'Failed' : s.last === 'DELIVERED' ? 'Delivered' : 'Not run yet'}</Badge>
                  {s.error && <small className={s.last === 'FAILED' ? 'bad' : ''}>{s.error}</small>}
                </span>
                <Toggle on={s.enabled} title={s.enabled ? 'Pause' : 'Resume'} onClick={() => flip.mutate(s)} />
                <span className="rx-acts">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRun(s.key)}>
                    Run now
                  </button>
                  <button type="button" className="dfx-icon-btn" title="Edit" onClick={() => onEdit(s)}>
                    {EDIT}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function History({ onDownload, onRun }: { onDownload: (x: Export) => void; onRun: (k: string) => void }) {
  const q = useQuery({ queryKey: ['reports', 'history'], queryFn: rptApi.history });
  if (q.isLoading) return <BlockLoader label="Loading history…" height={160} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  return (
    <div className="rx-sec">
      <span className="rx-note">Files stay available for 7 days. Every export is recorded in the audit log.</span>
      {q.data.length === 0 ? (
        <div className="rx-empty">Nothing exported yet</div>
      ) : (
        <div className="rx-table">
          <div className="rx-tbl hist">
            <div className="rx-th">
              <span>Report</span>
              <span>Filters</span>
              <span>Run by</span>
              <span>When</span>
              <span>Rows</span>
              <span>Format</span>
              <span>Status</span>
              <span />
            </div>
            {q.data.map((x) => (
              <div key={x.id} className="rx-tr">
                <b className="rx-strong">{x.name}</b>
                <span className="rx-muted2" title={x.error ?? undefined}>
                  {x.status === 'Failed' && x.error ? x.error : x.params}
                </span>
                <span className="rx-muted2">{x.by}</span>
                <span className="rx-muted2 rx-num">{when(x.at)}</span>
                <span className="rx-muted2 rx-num">{x.rows ?? '—'}</span>
                <span className="rx-mono">{x.format}</span>
                <span>
                  <Badge tone={histTone(x.status)}>{x.status}</Badge>
                </span>
                <span className="rx-acts">
                  {x.status === 'Ready' ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDownload(x)}>
                      Download
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRun(x.key)}>
                      Run again
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

function Dialog({ width, onClose, head, foot, children }: { width: number; onClose: () => void; head: ReactNode; foot: ReactNode; children: ReactNode }) {
  return (
    <div className="rx-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="rx-dialog" role="dialog" aria-modal="true" style={{ width }}>
        <div className="rx-dhead">
          {head}
          <button type="button" className="dfx-icon-btn" onClick={onClose} aria-label="Close">
            {Icon.close}
          </button>
        </div>
        <div className="rx-dbody">{children}</div>
        <div className="rx-dfoot">{foot}</div>
      </div>
    </div>
  );
}

function F({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`rx-f${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function RunDialog({ r, cycles, onClose, onSchedule, onDone }: { r: Report; cycles: Home['cycles']; onClose: () => void; onSchedule: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const depts = useDepartments();
  const locs = useLocations();
  const pers = useMemo(() => periods(r.kind), [r.kind]);
  const [per, setPer] = useState(defaultPeriod(r.kind));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [asof, setAsof] = useState(iso(new Date()));
  const [cycle, setCycle] = useState(cycles[0]?.id ?? '');
  const [fmt, setFmt] = useState(r.fmts[0]);
  const [dept, setDept] = useState('');
  const [loc, setLoc] = useState('');
  const [scope, setScope] = useState('active');
  const [off, setOff] = useState<Set<number>>(new Set());
  const [mask, setMask] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const shown = r.cols.length - off.size;
  const cat = { people: 'People', time: 'Time & attendance', pay: 'Payroll', stat: 'Statutory', talent: 'Talent', assets: 'Assets', access: 'Compliance & access' }[r.cat] ?? r.cat;
  const exp = useMutation({
    mutationFn: async () => {
      const p = pers.find((x) => x.value === per);
      const custom = per === 'Custom range';
      const body = {
        format: fmt,
        columns: r.cols.map((_, i) => i).filter((i) => !off.has(i)),
        mask,
        dept: r.org ? dept || undefined : undefined,
        loc: r.org ? loc || undefined : undefined,
        scope: r.scope ? scope : undefined,
        ...(r.kind === 'asof'
          ? { asof }
          : r.kind === 'cycle'
            ? { cycle }
            : { from: custom ? from : p?.from, to: custom ? to : p?.to, label: custom ? undefined : p?.value }),
      };
      const out = await rptApi.export(r.key, body);
      await rptApi.download(out.id, out.name);
      return out;
    },
    onSuccess: (o) => (qc.invalidateQueries({ queryKey: ['reports'] }), onDone(`${r.name} exported · ${o.rows} row${o.rows === 1 ? '' : 's'}`)),
    onError: (e) => {
      const fe = fieldErrors(e);
      setErr(Object.values(fe)[0] ?? errorText(e));
    },
  });
  const go = () => {
    if (per === 'Custom range' && (!from || !to || from > to)) return setErr('Pick a start date on or before the end date');
    if (!shown) return setErr('Choose at least one column');
    if (r.kind === 'cycle' && !cycle) return setErr('There is no review cycle to report on yet');
    setErr(null);
    exp.mutate();
  };
  return (
    <Dialog
      width={560}
      onClose={onClose}
      head={
        <span className="rx-dtitle">
          <small>
            {cat} · {r.freq}
          </small>
          <b>{r.name}</b>
          <span>{r.desc}</span>
        </span>
      }
      foot={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSchedule}>
            Schedule this report
          </button>
          <span className="rx-hint">{r.restricted ? 'Restricted · logged in audit' : 'Logged in audit'}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={go} disabled={exp.isPending}>
            {Icon.download} {exp.isPending ? 'Exporting…' : 'Export'}
          </button>
        </>
      }
    >
      <div className="rx-form">
        {r.kind === 'asof' ? (
          <F label="As of">
            <input className="input" type="date" value={asof} onChange={(e) => setAsof(e.target.value)} />
          </F>
        ) : r.kind === 'cycle' ? (
          <F label="Review cycle">
            <select className="input" value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {cycles.length === 0 && <option value="">No cycles yet</option>}
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </F>
        ) : (
          <F label="Period">
            <select className="input" value={per} onChange={(e) => setPer(e.target.value)}>
              {pers.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </F>
        )}
        <F label="Format">
          <select className="input" value={fmt} onChange={(e) => setFmt(e.target.value)}>
            {r.fmts.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </F>
        {per === 'Custom range' && (
          <>
            <F label="From">
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </F>
            <F label="To">
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </F>
          </>
        )}
        {r.org && (
          <>
            <F label="Department">
              <select className="input" value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">All departments</option>
                {depts.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </F>
            <F label="Location">
              <select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>
                <option value="">All locations</option>
                {locs.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </F>
          </>
        )}
        {r.scope && (
          <F label="Employees">
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="active">Active employees</option>
              <option value="all">Include exited</option>
              <option value="exited">Exited only</option>
            </select>
          </F>
        )}
        <div className="rx-cols">
          <span className="rx-cols-head">
            <b>Columns</b>
            <small>
              {shown} of {r.cols.length} selected
            </small>
          </span>
          <div className="rx-colchips">
            {r.cols.map((c, i) => {
              const on = !off.has(i);
              return (
                <button
                  key={c}
                  type="button"
                  className={`rx-col${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    setOff((s) => {
                      const n = new Set(s);
                      if (on) n.add(i);
                      else n.delete(i);
                      return n;
                    })
                  }
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        {r.restricted && !r.stat && (
          <div className="rx-mask">
            <span>
              <b>Mask PAN, bank account and salary</b>
              <small>{r.canUnmask ? 'Shows only the last 4 characters. Turn off only when the file goes to finance or a bank.' : 'Your role always gets masked values; Admin access to this module is needed to turn it off.'}</small>
            </span>
            <Toggle on={mask || !r.canUnmask} title={mask ? 'Masked' : 'Unmasked'} onClick={() => r.canUnmask && setMask(!mask)} />
          </div>
        )}
        {r.stat && <div className="rx-warn">Statutory files are generated unmasked in the portal's upload format. Only payroll admins can run them.</div>}
        {err && <span className="rx-err">{err}</span>}
      </div>
    </Dialog>
  );
}

function ScheduleDialog({ h, init, onClose, onDone }: { h: Home; init: { key: string; s: Schedule | null }; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const s0 = init.s;
  const r0 = h.reports.find((r) => r.key === init.key) ?? h.reports[0];
  const defFreq = (r: Report) => (['Daily', 'Weekly', 'Monthly', 'Quarterly'].includes(r.freq) ? r.freq.toUpperCase() : 'MONTHLY');
  const [f, setF] = useState({
    key: r0.key,
    freq: s0?.freq ?? defFreq(r0),
    day: s0?.day ?? '1',
    weekday: s0?.weekday ?? 'Mon',
    time: s0?.time ?? '09:00',
    format: s0?.format ?? r0.fmts[0],
    to: s0?.to ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const r = h.reports.find((x) => x.key === f.key) ?? r0;
  const set = (k: keyof typeof f, v: string) => (setF((o) => ({ ...o, [k]: v })), setErr(null));
  const save = useMutation({
    mutationFn: () => rptApi.saveSchedule(s0?.id ?? null, f),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['reports'] }), onDone(`${r.name} · ${runsLabel(f).toLowerCase()}`)),
    onError: (e) => setErr(Object.values(fieldErrors(e))[0] ?? errorText(e)),
  });
  const remove = useMutation({
    mutationFn: () => rptApi.removeSchedule(s0!.id),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['reports'] }), onDone('Schedule deleted')),
    onError: (e) => setErr(errorText(e)),
  });
  const go = () => {
    if (!f.to.trim()) return setErr('Add at least one recipient');
    if (!f.time) return setErr('Pick a time');
    save.mutate();
  };
  return (
    <Dialog
      width={500}
      onClose={onClose}
      head={<b className="rx-dtitle-sm">{s0 ? 'Edit schedule' : 'Schedule a report'}</b>}
      foot={
        <>
          {s0 && (
            <button type="button" className="btn btn-danger btn-sm" disabled={remove.isPending} onClick={() => window.confirm('Delete this schedule?') && remove.mutate()}>
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={go}>
            Save schedule
          </button>
        </>
      }
    >
      <div className="rx-form">
        <F label="Report" wide>
          <select
            className="input"
            value={f.key}
            onChange={(e) => {
              const n = h.reports.find((x) => x.key === e.target.value)!;
              setF((o) => ({ ...o, key: n.key, format: n.fmts[0] }));
            }}
          >
            {h.cats.map((c) => {
              const list = h.reports.filter((x) => x.cat === c.key);
              return (
                list.length > 0 && (
                  <optgroup key={c.key} label={c.label}>
                    {list.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                )
              );
            })}
          </select>
        </F>
        <F label="Frequency">
          <select className="input" value={f.freq} onChange={(e) => set('freq', e.target.value)}>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
          </select>
        </F>
        {(f.freq === 'MONTHLY' || f.freq === 'QUARTERLY') && (
          <F label="Day of month">
            <select className="input" value={f.day} onChange={(e) => set('day', e.target.value)}>
              {[...Array.from({ length: 28 }, (_, i) => String(i + 1)), 'Last day'].map((d) => (
                <option key={d} value={d}>
                  {d === 'Last day' ? d : ord(Number(d))}
                </option>
              ))}
            </select>
          </F>
        )}
        {f.freq === 'WEEKLY' && (
          <F label="Day of week">
            <select className="input" value={f.weekday} onChange={(e) => set('weekday', e.target.value)}>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {weekdayLabel(d)}
                </option>
              ))}
            </select>
          </F>
        )}
        <F label="Time (IST)">
          <input className="input" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} />
        </F>
        <F label="Format">
          <select className="input" value={f.format} onChange={(e) => set('format', e.target.value)}>
            {r.fmts.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </F>
        <label className="rx-f wide">
          <span>Recipients</span>
          <input className="input" value={f.to} onChange={(e) => set('to', e.target.value)} placeholder="e.g. finance@ivoyant.com, people@ivoyant.com" />
          <small>Separate with commas. Each run covers the last full period for all departments.</small>
        </label>
        {err && <span className="rx-err">{err}</span>}
      </div>
    </Dialog>
  );
}
