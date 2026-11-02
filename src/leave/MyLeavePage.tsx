import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { ApplyDrawer } from './ApplyDrawer';
import { TYPE_COLORS, leaveApi, type ReqRow } from './api';
import { RequestDrawer } from './RequestDrawer';
import { Modal, ReqBadge, TypeChip, dd, fmtDate, range } from './ui';

const WD = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const ROLE: Record<string, string> = { REPORTING_MANAGER: 'reporting manager', SKIP_LEVEL_MANAGER: 'skip-level manager', DEPARTMENT_HEAD: 'department head', HR: 'HR' };

/** Employee self-service: my balances, my requests, and the holiday calendar. */
export function MyLeavePage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState<'requests' | 'holidays'>('requests');
  const [applying, setApplying] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<ReqRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['leave', 'mine', year], queryFn: () => leaveApi.mine(year) });
  const hols = useQuery({ queryKey: ['leave', 'holidays', year], queryFn: () => leaveApi.attendanceHolidays(year), enabled: tab === 'holidays' });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const reqs = q.data?.requests ?? [];
  const pending = reqs.filter((r) => r.status === 'PENDING').length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="ml-page">
      <div className="ml-top">
        <span>
          <h1>Leave</h1>
          <small>{year} balances and requests</small>
        </span>
        <span className="ml-year">
          <button type="button" className="dfx-icon-btn" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
            {Icon.chevL}
          </button>
          <b>{year}</b>
          <button type="button" className="dfx-icon-btn" aria-label="Next year" disabled={year >= new Date().getFullYear() + 1} onClick={() => setYear((y) => y + 1)}>
            {Icon.chevR}
          </button>
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setApplying(true)}>
          {Icon.plus} Apply leave
        </button>
      </div>

      {q.isLoading ? (
        <BlockLoader label="Loading your leave…" height={160} />
      ) : q.isError || !q.data ? (
        <Alert>{errorText(q.error)}</Alert>
      ) : (
        <div className="ml-bals">
          {q.data.balances.map((b) => {
            const total = b.opening + b.credited;
            const usedPct = total > 0 ? Math.min(100, Math.round(((b.used + b.pending) / total) * 100)) : 0;
            const [fg] = TYPE_COLORS[b.color] ?? TYPE_COLORS[9];
            return (
              <div key={b.code} className="ml-bal">
                <span className="ml-bal-name">
                  <TypeChip code={b.short || b.code} color={b.color} />
                  {b.name}
                </span>
                <span className="ml-bal-n">
                  <b>{b.available}</b>
                  <small>of {total} available</small>
                </span>
                <span className="ml-meter">
                  <span style={{ width: `${usedPct}%`, background: fg }} />
                </span>
                <small className="ml-muted">
                  {b.used} used{b.pending ? ` · ${b.pending} pending` : ''}
                  {!b.paid ? ' · unpaid' : ''}
                </small>
              </div>
            );
          })}
          {q.data.balances.length === 0 && <div className="ml-empty">No leave types apply to you yet. Ask HR if that looks wrong.</div>}
        </div>
      )}

      <div className="dfx-tabbar" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'requests'} className={`dfx-tab${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>
          My requests{pending > 0 && <span className="dfx-count red">{pending}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'holidays'} className={`dfx-tab${tab === 'holidays' ? ' active' : ''}`} onClick={() => setTab('holidays')}>
          Holidays
        </button>
      </div>

      {tab === 'requests' && q.data && (
        <div className="ml-list">
          {reqs.map((r) => (
            <div key={r.id} className="ml-req" role="button" tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(r.id)}>
              {r.type ? <TypeChip code={r.type.short || r.type.code} color={r.type.color} /> : <span />}
              <span className="ml-req-t">
                <b>
                  {range(r.from, r.to)} · {dd(r.days, r.half)}
                </b>
                <small>
                  {r.no}
                  {r.reason ? ` · ${r.reason}` : ''}
                </small>
                <small className="ml-muted">
                  {r.status === 'PENDING'
                    ? r.waitingOn
                      ? `Waiting for ${r.waitingOn.name}${r.waitingRole ? ` (${ROLE[r.waitingRole] ?? r.waitingRole.toLowerCase().replace(/_/g, ' ')})` : ''}`
                      : 'Waiting for approval'
                    : r.decidedBy
                      ? `${r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Rejected' : 'Cancelled'} by ${r.decidedBy.name}${r.decidedAt ? ` · ${fmtDate(r.decidedAt)}` : ''}`
                      : `Applied ${fmtDate(r.appliedAt)}`}
                </small>
              </span>
              <ReqBadge status={r.status} />
              {r.status === 'PENDING' || (r.status === 'APPROVED' && r.from > today) ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => (e.stopPropagation(), setWithdraw(r))}>
                  {r.status === 'PENDING' ? 'Withdraw' : 'Cancel'}
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
          {reqs.length === 0 && <div className="ml-empty">No leave requests in {year} yet</div>}
        </div>
      )}

      {tab === 'holidays' &&
        (hols.isLoading ? (
          <BlockLoader label="Loading holidays…" height={160} />
        ) : hols.isError ? (
          <Alert>{errorText(hols.error)}</Alert>
        ) : (
          <div className="ml-list">
            {(hols.data ?? []).map((h) => {
              const past = h.date < today;
              return (
                <div key={h.date + h.name} className="ml-hol" style={{ opacity: past ? 0.55 : 1 }}>
                  <span className="ml-hol-d">{fmtDate(h.date)}</span>
                  <span className="ml-muted">{WD.format(new Date(h.date + 'T00:00:00'))}</span>
                  <b>{h.name}</b>
                  <span className={`pill no-dot ${h.dayOff ? 'pill-info' : 'pill-muted'}`}>{h.dayOff ? 'Day off' : 'Optional'}</span>
                </div>
              );
            })}
            {(hols.data ?? []).length === 0 && <div className="ml-empty">No holidays published for {year}</div>}
          </div>
        ))}

      {applying && (
        <ApplyDrawer
          canForOthers={false}
          onClose={() => setApplying(false)}
          onDone={() => (setApplying(false), qc.invalidateQueries({ queryKey: ['leave'] }), setToast('Leave request sent'))}
        />
      )}
      {open && <RequestDrawer id={open} onClose={() => (setOpen(null), qc.invalidateQueries({ queryKey: ['leave', 'mine'] }))} openLedger={() => undefined} open={setOpen} />}
      {withdraw && <WithdrawDialog r={withdraw} onClose={() => setWithdraw(null)} onDone={(m) => (setWithdraw(null), setToast(m))} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function WithdrawDialog({ r, onClose, onDone }: { r: ReqRow; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const pending = r.status === 'PENDING';
  const m = useMutation({
    meta: { busy: pending ? 'Withdrawing…' : 'Cancelling…' },
    mutationFn: () => leaveApi.cancel(r.id, note.trim() || undefined),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['leave'] }), onDone(pending ? 'Request withdrawn' : 'Leave cancelled · days returned to your balance')),
    onError: (e) => setErr(errorText(e)),
  });
  return (
    <Modal
      width={460}
      title={pending ? 'Withdraw this request?' : 'Cancel approved leave?'}
      sub={`${r.type?.name ?? 'Leave'} · ${range(r.from, r.to)} · ${dd(r.days, r.half)}`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Keep it
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={m.isPending} onClick={() => m.mutate()}>
            {pending ? 'Withdraw' : 'Cancel leave'}
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{pending ? 'Your approvers are told it was withdrawn.' : 'Your manager is told, and the days go back to your balance.'}</span>
      <label className="field">
        <span className="field-label">Note (optional)</span>
        <input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </label>
    </Modal>
  );
}
