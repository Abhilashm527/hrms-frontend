import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { useDepartments, useLocations } from '../onboarding/shared';
import { leaveApi, type AttRow } from './api';
import { Field, Grid, KindBadge, Modal, Pager, Row, Who, iso } from './ui';

const COLS = 'minmax(180px,1.5fr) 110px 130px 70px 70px 70px minmax(140px,1fr)';
const SUMMARY: [string, string][] = [
  ['present', 'Present'],
  ['late', 'Late'],
  ['wfh', 'WFH'],
  ['leave', 'On leave'],
  ['absent', 'Absent / not in'],
  ['off', 'Off'],
];
const SOURCE: Record<string, string> = { WEB: 'Web', MOBILE_GPS: 'Mobile · GPS', BIOMETRIC: 'Biometric', QR: 'QR', MANUAL: 'Corrected by HR' };
const long = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const btn = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const parse = (s: string) => new Date(`${s}T00:00:00`);
const shift = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

export function AttendanceTab() {
  const today = iso(new Date());
  const [day, setDay] = useState(today);
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [dept, setDept] = useState('');
  const [loc, setLoc] = useState('');
  const [st, setSt] = useState('all');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [fix, setFix] = useState<AttRow | null>(null);
  const depts = useDepartments();
  const locs = useLocations();
  useEffect(() => {
    const t = setTimeout(() => (setQd(q.trim()), setPage(0)), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [day, dept, loc, st, size]);
  const params = { date: day, q: qd, departmentId: dept, locationId: loc, status: st, page, size };
  const board = useQuery({ queryKey: ['attendance', 'board', params], queryFn: () => leaveApi.attendance(params), placeholderData: keepPreviousData });
  const b = board.data;
  const hasFlt = !!(q || dept || loc || st !== 'all');
  const isToday = day === today;

  return (
    <div className="lv-stack">
      <PermissionsNotice errors={[board.error]} />
      <div className="lv-bar">
        <DayPicker day={day} setDay={setDay} today={today} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDay(today)} disabled={isToday}>
          Today
        </button>
        <span className="grow" />
        <label className="dfx-search">
          {Icon.search}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search employees…" />
        </label>
        <select className="sel" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className="sel" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {locs.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className="sel" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="wfh">WFH</option>
          <option value="leave">On leave</option>
          <option value="absent">Absent / not in</option>
          <option value="off">Off</option>
        </select>
        {hasFlt && (
          <button type="button" className="link-btn" onClick={() => (setQ(''), setDept(''), setLoc(''), setSt('all'))}>
            Clear
          </button>
        )}
      </div>
      <span className="lv-daytxt">
        {long.format(parse(day))}
        {isToday ? ' · today' : ''}
        {b ? ` · ${b.headcount} people` : ''}
      </span>
      <div className="lv-kpis six">
        {SUMMARY.map(([k, l]) => (
          <button key={k} type="button" className={`lv-kpi click${st === k ? ' on' : ''}`} onClick={() => setSt(st === k ? 'all' : k)}>
            <span>{l}</span>
            <b>{b ? (b.counts[k] ?? 0) : '…'}</b>
          </button>
        ))}
      </div>
      {board.isLoading && <BlockLoader height={300} label="Loading attendance…" />}
      {b && (
        <>
          <Grid cols={COLS} minWidth={880} head={['Employee', 'Department', 'Status', 'In', 'Out', 'Hours', 'Source']} empty={b.items.length === 0 && <div className="lv-empty">No employees match your filters</div>}>
            <div style={{ opacity: board.isPlaceholderData ? 0.6 : 1 }}>
              {b.items.map((a) => (
                <Row key={a.id} cols={COLS} onClick={b.canEdit && a.status !== 'off' && a.status !== 'leave' ? () => setFix(a) : undefined}>
                  <Who p={{ ...a, department: a.department }} sub={a.code} size={28} />
                  <span className="ell">{a.department?.name ?? '—'}</span>
                  <span>
                    <KindBadge kind={a.kind} label={a.label} />
                  </span>
                  <span className="num">{a.in ?? '—'}</span>
                  <span className="num">{a.out ?? '—'}</span>
                  <span className="num">{a.hours ?? '—'}</span>
                  <span className="ell muted" title={a.note ?? undefined}>
                    {a.source ? SOURCE[a.source] ?? a.source : '—'}
                    {a.wfh && a.source ? ' · WFH' : ''}
                  </span>
                </Row>
              ))}
            </div>
          </Grid>
          <Pager page={page} size={size} total={b.total} onPage={setPage} onSize={setSize} sizes={[20, 50, 100]} noun="people" />
        </>
      )}
      {fix && <FixModal row={fix} day={day} onClose={() => setFix(null)} />}
    </div>
  );
}

function DayPicker({ day, setDay, today }: { day: string; setDay: (d: string) => void; today: string }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(day.slice(0, 7));
  const ref = useRef<HTMLDivElement>(null);
  const year = Number(month.slice(0, 4));
  const hol = useQuery({ queryKey: ['attendance', 'holidays', year], queryFn: () => leaveApi.attendanceHolidays(year), enabled: open, staleTime: 60 * 60_000 });
  useEffect(() => setMonth(day.slice(0, 7)), [day]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', key));
  }, [open]);
  const first = parse(`${month}-01`);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const holidays = new Map((hol.data ?? []).map((h) => [h.date, h.name]));
  const moveMonth = (n: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + n, 1);
    setMonth(iso(d).slice(0, 7));
  };
  const t = parse(today);
  const monday = new Date(t);
  monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const presets: [string, string][] = [
    ['Today', today],
    ['Yesterday', shift(today, -1)],
    ['This Monday', iso(monday)],
    ['Last Monday', shift(iso(monday), -7)],
    ['1st of month', `${today.slice(0, 7)}-01`],
  ];
  return (
    <div className="lv-daypick" ref={ref}>
      <button type="button" className="dfx-icon-btn" onClick={() => setDay(shift(day, -1))} aria-label="Previous day">
        {Icon.chevL}
      </button>
      <button type="button" className="lv-daybtn" onClick={() => setOpen(!open)} aria-label="Choose date" aria-expanded={open}>
        {Icon.cal}
        {btn.format(parse(day))}
      </button>
      <button type="button" className="dfx-icon-btn" onClick={() => setDay(shift(day, 1))} aria-label="Next day">
        {Icon.chevR}
      </button>
      {open && (
        <div className="lv-cal" role="dialog" aria-label="Choose date">
          <div className="lv-cal-presets">
            <span className="lv-cap">Jump to</span>
            {presets.map(([l, d]) => (
              <button key={l} type="button" aria-pressed={d === day} onClick={() => (setDay(d), setOpen(false))}>
                {l}
              </button>
            ))}
          </div>
          <div className="lv-cal-month">
            <div className="lv-cal-head">
              <button type="button" className="dfx-icon-btn" onClick={() => moveMonth(-1)} aria-label="Previous month">
                {Icon.chevL}
              </button>
              <b>{monthFmt.format(first)}</b>
              <button type="button" className="dfx-icon-btn" onClick={() => moveMonth(1)} aria-label="Next month">
                {Icon.chevR}
              </button>
            </div>
            <div className="lv-cal-grid dow">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="lv-cal-grid">
              {cells.map((c, i) =>
                c ? (
                  <button key={c} type="button" title={holidays.get(c)} aria-pressed={c === day} className={`${c === today ? 'today' : ''}${holidays.has(c) ? ' hol' : ''}${(i % 7) >= 5 ? ' we' : ''}`} onClick={() => (setDay(c), setOpen(false))}>
                    {Number(c.slice(8))}
                    {holidays.has(c) && <i />}
                  </button>
                ) : (
                  <span key={`x${i}`} />
                ),
              )}
            </div>
            <div className="lv-cal-legend">
              <span>
                <i className="today" />
                Today
              </span>
              <span>
                <i className="hol" />
                Holiday
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FixModal({ row, day, onClose }: { row: AttRow; day: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [inT, setIn] = useState(row.in ?? '');
  const [outT, setOut] = useState(row.out ?? '');
  const [wfh, setWfh] = useState(row.wfh);
  const [note, setNote] = useState('');
  const save = useMutation({
    meta: { busy: 'Saving attendance…' },
    mutationFn: () => leaveApi.correctAttendance(row.id, day, { in: inT, out: outT, wfh, note }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['attendance'] }), onClose()),
  });
  const fe = fieldErrors(save.error);
  return (
    <Modal
      title="Correct attendance"
      sub={`${row.name} · ${long.format(parse(day))} · recorded in the audit trail`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!note.trim()} onClick={() => save.mutate()}>
            Save correction
          </button>
        </>
      }
    >
      {save.isError && !Object.keys(fe).length && <Alert>{errorText(save.error)}</Alert>}
      <div className="lv-two-col">
        <Field label="Check-in" error={fe.in}>
          <input type="time" className="input sm" value={inT} onChange={(e) => setIn(e.target.value)} />
        </Field>
        <Field label="Check-out" error={fe.out}>
          <input type="time" className="input sm" value={outT} onChange={(e) => setOut(e.target.value)} />
        </Field>
      </div>
      <label className="lv-inline">
        <button type="button" className="switch" role="switch" aria-checked={wfh} onClick={() => setWfh(!wfh)} />
        Working from home
      </label>
      <Field label="Reason" error={fe.note} hint="Leave both times empty (and WFH off) to clear the day">
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Biometric was down; confirmed with manager" />
      </Field>
    </Modal>
  );
}
