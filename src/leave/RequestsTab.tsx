import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { useDepartments } from '../onboarding/shared';
import { leaveApi, type ReqRow } from './api';
import { Grid, Pager, ReqBadge, Row, Seg, StepDots, TypeChip, Who, dd, fmtDate, fmtShort, fmtTime, range } from './ui';

type Filters = { types: string[]; dept: string; from: string; to: string; sort: string };
const NONE: Filters = { types: [], dept: '', from: '', to: '', sort: 'applied' };
const COLS = 'minmax(200px,1.4fr) 120px 150px 60px 90px minmax(200px,1.4fr) 100px';
const LOG_COLS = '96px 92px minmax(180px,1.2fr) minmax(220px,1.6fr) minmax(220px,1.4fr)';

export function RequestsTab({ open }: { open: (id: string) => void }) {
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [act, setAct] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [f, setF] = useState<Filters>(NONE);
  const [fltOpen, setFltOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const depts = useDepartments();
  useEffect(() => {
    const t = setTimeout(() => (setQd(q.trim()), setPage(0)), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [view, act, f, size]);

  const params = { view, act: view === 'history' ? act : undefined, q: qd, types: f.types, departmentId: f.dept, from: f.from, to: f.to, sort: f.sort, page, size };
  const list = useQuery({ queryKey: ['leave', 'requests', params], queryFn: () => leaveApi.requests(params), placeholderData: keepPreviousData });
  const d = list.data;
  const fltN = f.types.length + (f.dept ? 1 : 0) + (f.from || f.to ? 1 : 0) + (view === 'pending' && f.sort !== 'applied' ? 1 : 0);

  const csv = async () => {
    const all = await leaveApi.requests({ ...params, page: 0, size: 100 });
    const rows = [['Request', 'Employee', 'Department', 'Type', 'From', 'To', 'Days', 'Status', 'Decided', 'By', 'Note', 'Reason']];
    for (const r of all.items)
      rows.push([r.no, r.employee?.name ?? '', r.employee?.department?.name ?? '', r.type?.code ?? '', r.from, r.to, String(r.days), r.status, r.decidedAt?.slice(0, 10) ?? '', r.decidedBy?.name ?? '', r.decisionNote ?? '', r.reason ?? '']);
    const text = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `leave-history-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lv-stack">
      <PermissionsNotice errors={[list.error]} />
      <div className="lv-bar">
        <Seg
          value={view}
          onChange={setView}
          options={[
            ['pending', `Pending · ${d?.counts.pending ?? '…'}`],
            ['history', 'History'],
          ]}
        />
        <label className="dfx-search lv-search">
          {Icon.search}
          <input placeholder="search employee, ID, department, reason…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" className="lv-x" onClick={() => setQ('')} title="Clear">
              {Icon.close}
            </button>
          )}
        </label>
        {view === 'history' && d && (
          <div className="dfx-filter-row">
            {(
              [
                ['ALL', `All · ${d.counts.approved + d.counts.rejected}`],
                ['APPROVED', `Approved · ${d.counts.approved}`],
                ['REJECTED', `Rejected · ${d.counts.rejected}`],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className={`dfx-chip${act === k ? ' active' : ''}`} onClick={() => setAct(k)}>
                {l}
              </button>
            ))}
          </div>
        )}
        <span className="grow" />
        <FilterButton open={fltOpen} setOpen={setFltOpen} n={fltN}>
          <div className="lv-flt-sec">
            <span className="lv-cap">Leave type</span>
            <div className="lv-chips">
              {d?.types.map((t) => {
                const on = f.types.includes(t.code);
                return (
                  <button key={t.code} type="button" className={`lv-fchip${on ? ' on' : ''}`} onClick={() => setF({ ...f, types: on ? f.types.filter((x) => x !== t.code) : [...f.types, t.code] })}>
                    {t.code} · {t.short}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="lv-flt-sec">
            <span className="lv-cap">Department</span>
            <select className="sel" value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}>
              <option value="">All departments</option>
              {depts.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="lv-flt-sec">
            <span className="lv-cap">{view === 'history' ? 'Decided between' : 'Leave dates between'}</span>
            <div className="lv-two-col">
              <input type="date" className="sel" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From" />
              <input type="date" className="sel" min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To" />
            </div>
          </div>
          {view === 'pending' && (
            <label className="lv-flt-sec">
              <span className="lv-cap">Sort by</span>
              <select className="sel" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
                <option value="applied">Newest applied</option>
                <option value="start">Leave start date</option>
                <option value="days">Most days</option>
                <option value="name">Employee name</option>
              </select>
            </label>
          )}
          <div className="lv-flt-foot">
            <button type="button" className="link-btn" onClick={() => setF(NONE)}>
              Reset all
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setFltOpen(false)}>
              Done
            </button>
          </div>
        </FilterButton>
      </div>

      {list.isLoading && <BlockLoader height={300} label={view === 'pending' ? 'Loading requests…' : 'Loading leave history…'} />}
      {d && view === 'pending' && (
        <>
          <Grid
            cols={COLS}
            minWidth={1000}
            head={['Employee', 'Type', 'Dates', 'Days', 'Applied', 'Approval', 'Status']}
            empty={d.items.length === 0 && <div className="lv-empty">{qd || fltN ? 'No pending requests match your search or filters' : 'Nothing is waiting for approval'}</div>}
          >
            <div style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              {d.items.map((r) => (
                <PendingRow key={r.id} r={r} onOpen={() => open(r.id)} />
              ))}
            </div>
          </Grid>
          <Pager page={page} size={size} total={d.total} onPage={setPage} onSize={setSize} noun="requests" />
        </>
      )}
      {d && view === 'history' && (
        <>
          <Grid cols={LOG_COLS} minWidth={960} head={['When', 'Action', 'Employee', 'Decision', 'Leave']} empty={d.items.length === 0 && <div className="lv-empty">No history matches your search or filters</div>}>
            <div style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              {d.items.map((r) => (
                <LogRow key={r.id} r={r} onOpen={() => open(r.id)} />
              ))}
            </div>
          </Grid>
          <Pager
            page={page}
            size={size}
            total={d.total}
            onPage={setPage}
            onSize={setSize}
            noun="decided requests"
            extra={
              <button type="button" className="btn btn-ghost btn-sm" onClick={csv} disabled={!d.total}>
                {Icon.download} Export CSV
              </button>
            }
          />
        </>
      )}
    </div>
  );
}

function PendingRow({ r, onOpen }: { r: ReqRow; onOpen: () => void }) {
  const done = r.progress?.done ?? 0;
  const total = r.progress?.total ?? 0;
  return (
    <Row cols={COLS} onClick={onOpen}>
      <Who p={r.employee} />
      <span className="lv-typecell">
        <TypeChip code={r.type?.code ?? '?'} color={r.type?.color} />
        <span>{r.type?.short}</span>
      </span>
      <span className="ell">{range(r.from, r.to)}</span>
      <span className="num">{r.half ? '½' : r.days}</span>
      <span className="muted">{fmtShort(r.appliedAt)}</span>
      <span className="lv-approval">
        {r.progress && <StepDots states={r.progress.states} />}
        <span className="ell">{total ? `${done} of ${total}${r.waitingOn ? ` · waiting on ${r.waitingOn.name}` : ''}` : 'No approval needed'}</span>
      </span>
      <span>
        <ReqBadge status={r.status} />
      </span>
    </Row>
  );
}

function LogRow({ r, onOpen }: { r: ReqRow; onOpen: () => void }) {
  const ok = r.status === 'APPROVED';
  const by = r.decidedBy?.name ?? 'HR';
  const sub = !ok && r.decisionNote ? `"${r.decisionNote}"` : (r.approvedBy ?? []).map((p) => p.first ?? p.name).join(' → ') + (ok && r.progress ? ` · ${r.progress.total} of ${r.progress.total} steps` : '');
  return (
    <Row cols={LOG_COLS} onClick={onOpen}>
      <span className="lv-two">
        <b style={{ fontWeight: 500 }}>{fmtDate(r.decidedAt)}</b>
        <span>{fmtTime(r.decidedAt)}</span>
      </span>
      <span>
        <span className={`pill no-dot ${ok ? 'pill-ok' : 'pill-danger'}`}>{ok ? 'Approved' : 'Rejected'}</span>
      </span>
      <Who p={r.employee} sub={`${r.no} · ${r.employee?.department?.name ?? ''}`} size={28} />
      <span className="lv-two">
        <b>{(ok ? 'Approved by ' : 'Rejected by ') + by}</b>
        <span>{sub || '—'}</span>
      </span>
      <span className="lv-typecell">
        <TypeChip code={r.type?.code ?? '?'} color={r.type?.color} />
        <span className="lv-two">
          <b style={{ fontWeight: 500 }}>
            {range(r.from, r.to)} · {dd(r.days, r.half)}
          </b>
          <span>Applied {fmtShort(r.appliedAt)}</span>
        </span>
      </span>
    </Row>
  );
}

export function FilterButton({ open, setOpen, n, children }: { open: boolean; setOpen: (v: boolean) => void; n: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.ivy-dd, .ivy-dp') && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', key));
  }, [open, setOpen]);
  return (
    <div className="lv-flt" ref={ref}>
      <button type="button" className={`btn btn-secondary btn-sm${n ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {Icon.sliders} Filters
        {n > 0 && <span className="lv-fn">{n}</span>}
      </button>
      {open && (
        <div className="lv-flt-pop" role="dialog" aria-label="Filters">
          {children}
        </div>
      )}
    </div>
  );
}
