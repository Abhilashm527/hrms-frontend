import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { leaveApi, type MyDay, type MyToday, type Timesheet } from './api';
import { Modal, fmtDate, iso } from './ui';

const KIND: Record<string, string> = { healthy: 'pill-ok', running: 'pill-info', pending: 'pill-warn', failed: 'pill-danger', paused: 'pill-muted', stopped: 'pill-muted' };
const WD = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const DM = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—');

/** Employee self-service: check in and out, my recent days (and asking to fix one), and my weekly timesheet. */
export function MyAttendancePage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'timesheet' ? 'timesheet' : 'log';
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className="ma-page">
      <div className="ml-top">
        <span>
          <h1>Attendance</h1>
          <small>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>
        </span>
      </div>
      <TodayCard onToast={setToast} />
      <div className="dfx-tabbar" role="tablist">
        {(
          [
            ['log', 'My days'],
            ['timesheet', 'Timesheet'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => setSp(k === 'log' ? {} : { tab: k })}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'log' ? <DaysLog onToast={setToast} /> : <TimesheetView onToast={setToast} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function TodayCard({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['attendance', 'me'], queryFn: leaveApi.myToday, refetchInterval: 60_000 });
  const [wfh, setWfh] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const done = (d: MyToday, msg: string) => (qc.setQueryData(['attendance', 'me'], d), qc.invalidateQueries({ queryKey: ['attendance', 'log'] }), onToast(msg), setErr(null));
  const inM = useMutation({ meta: { busy: 'Checking in…' }, mutationFn: () => leaveApi.checkIn(wfh), onSuccess: (d) => done(d, wfh ? 'Checked in · working from home' : 'Checked in'), onError: (e) => setErr(errorText(e)) });
  const outM = useMutation({ meta: { busy: 'Checking out…' }, mutationFn: leaveApi.checkOut, onSuccess: (d) => done(d, 'Checked out'), onError: (e) => setErr(errorText(e)) });
  if (q.isLoading) return <BlockLoader label="Loading today…" height={90} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const t = q.data;
  const since = t.in ? new Date(t.in) : null;
  const until = t.out ? new Date(t.out) : new Date();
  const mins = since ? Math.max(0, Math.round((+until - +since) / 60000)) : 0;
  const dur = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  return (
    <div className="ma-today">
      <div className="ma-today-t">
        <span className="ml-muted">Today · shift {t.start.slice(0, 5)}–{t.end.slice(0, 5)}</span>
        {!t.in ? (
          <b>Not checked in</b>
        ) : !t.out ? (
          <>
            <b>
              {dur} · since {hhmm(t.in)}
            </b>
            <span className="ml-muted">{t.wfh ? 'Working from home' : 'At the office'}</span>
          </>
        ) : (
          <>
            <b>
              {dur} · {hhmm(t.in)} – {hhmm(t.out)}
            </b>
            <span className="ml-muted">{t.wfh ? 'Worked from home' : 'At the office'} · done for today</span>
          </>
        )}
      </div>
      {err && <span className="field-err">{err}</span>}
      {!t.in && (
        <>
          <span className="seg" role="radiogroup" aria-label="Where are you working">
            <button type="button" role="radio" aria-checked={!wfh} aria-pressed={!wfh} onClick={() => setWfh(false)}>
              Office
            </button>
            <button type="button" role="radio" aria-checked={wfh} aria-pressed={wfh} onClick={() => setWfh(true)}>
              Home
            </button>
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={inM.isPending} onClick={() => inM.mutate()}>
            Check in
          </button>
        </>
      )}
      {t.in && !t.out && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={outM.isPending} onClick={() => outM.mutate()}>
          Check out
        </button>
      )}
    </div>
  );
}

function DaysLog({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['attendance', 'log'], queryFn: () => leaveApi.myLog(30) });
  const [fix, setFix] = useState<MyDay | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => leaveApi.cancelRegularisation(id),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['attendance', 'log'] }), onToast('Request withdrawn')),
  });
  if (q.isLoading) return <BlockLoader label="Loading your days…" height={220} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  return (
    <>
      <div className="ma-log">
        <div className="ma-row ma-head">
          <span>Day</span>
          <span>In</span>
          <span>Out</span>
          <span>Hours</span>
          <span>Mode</span>
          <span>Status</span>
          <span />
        </div>
        {q.data.days.map((d) => (
          <div key={d.day} className="ma-row">
            <span>
              <b>{DM.format(new Date(d.day + 'T00:00:00'))}</b> <span className="ml-muted">{WD.format(new Date(d.day + 'T00:00:00'))}</span>
            </span>
            <span className="mono">{d.in ?? '—'}</span>
            <span className="mono">{d.out ?? (d.missingOut ? <span className="po-warn">missing</span> : '—')}</span>
            <span className="mono">{d.hours ?? '—'}</span>
            <span className="ml-muted">{d.in || d.wfh ? (d.wfh ? 'Home' : d.source === 'MANUAL' ? 'Corrected' : 'Office') : '—'}</span>
            <span className="ma-st">
              <span className={`pill no-dot ${KIND[d.kind] ?? 'pill-muted'}`}>{d.label}</span>
              {d.request?.status === 'PENDING' && <small className="po-warn">Fix requested · waiting for {q.data.approver}</small>}
              {d.request?.status === 'REJECTED' && <small style={{ color: 'var(--danger-fg)' }}>Fix not approved{d.request.decisionNote ? ` · ${d.request.decisionNote}` : ''}</small>}
            </span>
            <span className="ma-act">
              {d.request?.status === 'PENDING' ? (
                <button type="button" className="ep-link" onClick={() => cancel.mutate(d.request!.id)}>
                  Withdraw
                </button>
              ) : d.canRegularise ? (
                <button type="button" className="ep-link" onClick={() => setFix(d)}>
                  Regularise
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      <span className="ml-muted">Days from the last 30 days can be fixed; {q.data.approver} approves the change.</span>
      {fix && <FixDialog d={fix} approver={q.data.approver} onClose={() => setFix(null)} onDone={(m) => (setFix(null), onToast(m))} />}
    </>
  );
}

function FixDialog({ d, approver, onClose, onDone }: { d: MyDay; approver: string; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ in: d.in ?? '', out: d.out ?? '', wfh: d.wfh, reason: '' });
  const [fe, setFe] = useState<Record<string, string>>({});
  const m = useMutation({
    meta: { busy: 'Sending…' },
    mutationFn: () => leaveApi.regularise({ day: d.day, in: f.in || null, out: f.out || null, wfh: f.wfh, reason: f.reason.trim() }),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ['attendance', 'log'] }), onDone(`Sent to ${r.approver}`)),
    onError: (e) => setFe({ ...fieldErrors(e), _: errorText(e) }),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.in && !f.wfh) e.in = 'Enter when you started';
    if (f.in && f.out && f.out <= f.in) e.out = 'Check-out must be after check-in';
    if (f.reason.trim().length < 3) e.reason = 'Say why the day needs fixing';
    setFe(e);
    if (!Object.keys(e).length) m.mutate();
  };
  return (
    <Modal
      width={460}
      title="Regularise attendance"
      sub={`${fmtDate(d.day)} · goes to ${approver}`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={m.isPending} onClick={submit}>
            Send request
          </button>
        </>
      }
    >
      {fe._ && !Object.keys(fe).some((k) => k !== '_') && <Alert>{fe._}</Alert>}
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Check-in</span>
          <input className="input sm" type="time" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} aria-invalid={!!fe.in} />
          {fe.in && <span className="field-err">{fe.in}</span>}
        </label>
        <label className="field">
          <span className="field-label">Check-out</span>
          <input className="input sm" type="time" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} aria-invalid={!!fe.out} />
          {fe.out && <span className="field-err">{fe.out}</span>}
        </label>
      </div>
      <label className="po-check">
        <input type="checkbox" checked={f.wfh} onChange={(e) => setF({ ...f, wfh: e.target.checked })} />
        I worked from home that day
      </label>
      <label className="field">
        <span className="field-label">
          Reason<span className="req">*</span>
        </span>
        <textarea className="input" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} aria-invalid={!!fe.reason} placeholder="e.g. Forgot to check out" />
        {fe.reason && <span className="field-err">{fe.reason}</span>}
      </label>
    </Modal>
  );
}

const mondayOf = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return iso(x);
};
const addDays = (s: string, n: number) => {
  const x = new Date(s + 'T00:00:00');
  x.setDate(x.getDate() + n);
  return iso(x);
};
const TS_ST: Record<Timesheet['status'], [string, string]> = { DRAFT: ['Draft', 'pill-muted'], SUBMITTED: ['Submitted', 'pill-info'], APPROVED: ['Approved', 'pill-ok'], REJECTED: ['Sent back', 'pill-danger'] };

function TimesheetView({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const thisWeek = mondayOf(new Date());
  const [week, setWeek] = useState(thisWeek);
  const q = useQuery({ queryKey: ['attendance', 'timesheet', week], queryFn: () => leaveApi.timesheet(week) });
  const [grid, setGrid] = useState<Record<string, string[]>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return;
    setGrid(Object.fromEntries(q.data.rows.map((r) => [r.projectId, r.hours.map((h) => (h == null ? '' : String(h)))])));
    setOrder(q.data.rows.map((r) => r.projectId));
    setErr(null);
  }, [q.data]);
  const names = useMemo(() => new Map((q.data?.projects ?? []).map((p) => [p.id, p.name])), [q.data]);
  const rows = () => order.map((id) => ({ projectId: id, hours: grid[id].map((v) => (v.trim() === '' ? null : Number(v))) }));
  const dirty = q.data ? JSON.stringify(rows()) !== JSON.stringify(q.data.rows.map((r) => ({ projectId: r.projectId, hours: r.hours.map((h) => (h == null ? null : Number(h))) }))) : false;
  const save = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: () => leaveApi.saveTimesheet(week, rows()),
    onSuccess: (d) => (qc.setQueryData(['attendance', 'timesheet', week], d), onToast('Timesheet saved')),
    onError: (e) => setErr(errorText(e)),
  });
  const submit = useMutation({
    meta: { busy: 'Submitting…' },
    mutationFn: async () => {
      if (dirty) await leaveApi.saveTimesheet(week, rows());
      return leaveApi.submitTimesheet(week);
    },
    onSuccess: (d) => (qc.setQueryData(['attendance', 'timesheet', week], d), onToast('Timesheet submitted for approval')),
    onError: (e) => setErr(errorText(e)),
  });
  if (q.isLoading) return <BlockLoader label="Loading your timesheet…" height={220} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const t = q.data;
  const ed = t.editable;
  const dayTot = t.days.map((_, i) => order.reduce((a, id) => a + (Number(grid[id]?.[i]) || 0), 0));
  const total = dayTot.reduce((a, b) => a + b, 0);
  const free = t.projects.filter((p) => !order.includes(p.id));
  const [sl, sc] = TS_ST[t.status];
  const fmtH = (n: number) => (n ? String(Math.round(n * 100) / 100) : '');
  return (
    <div className="ma-ts">
      <div className="ma-ts-bar">
        <button type="button" className="dfx-icon-btn" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>
          {Icon.chevL}
        </button>
        <b>
          Week of {DM.format(new Date(week + 'T00:00:00'))} – {DM.format(new Date(addDays(week, 6) + 'T00:00:00'))}
        </b>
        <button type="button" className="dfx-icon-btn" aria-label="Next week" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))}>
          {Icon.chevR}
        </button>
        {week !== thisWeek && (
          <button type="button" className="ep-link" onClick={() => setWeek(thisWeek)}>
            This week
          </button>
        )}
        <span className={`pill ${sc}`}>{sl}</span>
        <span className="ml-muted">
          {t.status === 'SUBMITTED' && t.submittedAt ? `Submitted ${fmtDate(t.submittedAt)}` : ''}
          {(t.status === 'APPROVED' || t.status === 'REJECTED') && t.decidedBy ? `${t.status === 'APPROVED' ? 'Approved' : 'Sent back'} by ${t.decidedBy}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {ed && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              Save
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={submit.isPending || order.length === 0} onClick={() => submit.mutate()}>
              Submit
            </button>
          </>
        )}
      </div>
      {t.status === 'REJECTED' && t.decisionNote && <Alert>Sent back: {t.decisionNote}. Change it and submit again.</Alert>}
      {err && <Alert>{err}</Alert>}
      <div className="ma-grid-wrap">
        <div className="ma-grid">
          <div className="ma-gr ma-gh">
            <span>Project</span>
            {t.days.map((d) => (
              <span key={d.date} className={d.weekend ? 'ma-we' : undefined}>
                {WD.format(new Date(d.date + 'T00:00:00'))} {new Date(d.date + 'T00:00:00').getDate()}
              </span>
            ))}
            <span>Total</span>
            <span />
          </div>
          {order.map((id) => {
            const tot = (grid[id] ?? []).reduce((a, v) => a + (Number(v) || 0), 0);
            return (
              <div key={id} className="ma-gr">
                <span className="ma-pn">{names.get(id) ?? 'Project'}</span>
                {t.days.map((d, i) => (
                  <input
                    key={d.date}
                    className={`input sm ma-cell${d.weekend ? ' ma-we' : ''}`}
                    inputMode="decimal"
                    value={grid[id]?.[i] ?? ''}
                    readOnly={!ed}
                    placeholder="0"
                    aria-label={`${names.get(id)} ${d.date}`}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, '');
                      setGrid((g) => ({ ...g, [id]: g[id].map((x, j) => (j === i ? v : x)) }));
                    }}
                  />
                ))}
                <span className="ma-tot">{fmtH(tot) || '0'}</span>
                <span>
                  {ed && (
                    <button type="button" className="dfx-icon-btn" title="Remove project" onClick={() => setOrder((o) => o.filter((x) => x !== id))}>
                      {Icon.trash}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {order.length === 0 && <div className="ml-empty">{t.projects.length ? 'No hours logged for this week' : 'You aren’t on any project this week. Ask your manager to add you to one.'}</div>}
          <div className="ma-gr ma-gf">
            <span>
              {ed && free.length > 0 && (
                <select
                  className="input sm"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    setGrid((g) => ({ ...g, [id]: g[id] ?? Array(7).fill('') }));
                    setOrder((o) => [...o, id]);
                  }}
                  aria-label="Add a project"
                >
                  <option value="">+ Add project</option>
                  {free.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </span>
            {dayTot.map((n, i) => (
              <span key={i} className="ma-tot" style={n > 24 ? { color: 'var(--danger-fg)' } : undefined}>
                {fmtH(n)}
              </span>
            ))}
            <span className="ma-tot">
              <b>{fmtH(total) || '0'} h</b>
            </span>
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
