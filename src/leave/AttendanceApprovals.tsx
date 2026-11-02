import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { errorText } from '../lib/http';
import { leaveApi, type PendingSheet, type Regularisation } from './api';
import { Modal, fmtDate } from './ui';

const DM = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const WD = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });

/** Requests to fix a day and submitted timesheets waiting for the caller. Shows nothing when nothing is waiting. */
export function AttendanceApprovals() {
  const qc = useQueryClient();
  const regs = useQuery({ queryKey: ['attendance', 'regularisations'], queryFn: () => leaveApi.regularisations(), retry: false });
  const sheets = useQuery({ queryKey: ['attendance', 'timesheets', 'pending'], queryFn: leaveApi.pendingTimesheets, retry: false });
  const [reject, setReject] = useState<{ kind: 'fix' | 'sheet'; id: string; who: string } | null>(null);
  const [view, setView] = useState<PendingSheet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => (qc.invalidateQueries({ queryKey: ['attendance'] }), setErr(null));
  const decide = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: (v: { kind: 'fix' | 'sheet'; id: string; approve: boolean; note?: string }) =>
      v.kind === 'fix' ? leaveApi.decideRegularisation(v.id, v.approve, v.note) : leaveApi.decideTimesheet(v.id, v.approve, v.note),
    onSuccess: () => (refresh(), setReject(null), setView(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const r = regs.data?.items ?? [];
  const s = sheets.data?.items ?? [];
  if (!r.length && !s.length) return null;
  return (
    <section className="aa-card">
      <header>
        Waiting for you
        <small className="ml-muted">
          {r.length ? `${r.length} attendance fix${r.length > 1 ? 'es' : ''}` : ''}
          {r.length && s.length ? ' · ' : ''}
          {s.length ? `${s.length} timesheet${s.length > 1 ? 's' : ''}` : ''}
        </small>
      </header>
      {err && <Alert>{err}</Alert>}
      {r.map((x: Regularisation) => (
        <div key={x.id} className="aa-row">
          <span className="aa-t">
            <b>{x.employee.name}</b>
            <small>
              Fix {fmtDate(x.day)} · {x.wfh ? 'worked from home' : `${x.in ?? '—'} – ${x.out ?? '—'}`} · {x.reason}
            </small>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReject({ kind: 'fix', id: x.id, who: x.employee.name })}>
            Reject
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ kind: 'fix', id: x.id, approve: true })}>
            Approve
          </button>
        </div>
      ))}
      {s.map((x) => (
        <div key={x.id} className="aa-row">
          <span className="aa-t">
            <b>{x.employee.name}</b>
            <small>
              Timesheet · week of {DM.format(new Date(x.weekStart + 'T00:00:00'))} · {Number(x.total)} h on {x.rows.length} project{x.rows.length === 1 ? '' : 's'}
            </small>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView(x)}>
            View
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReject({ kind: 'sheet', id: x.id, who: x.employee.name })}>
            Send back
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ kind: 'sheet', id: x.id, approve: true })}>
            Approve
          </button>
        </div>
      ))}
      {reject && <RejectDialog title={reject.kind === 'fix' ? `Reject ${reject.who}'s fix?` : `Send ${reject.who}'s timesheet back?`} onClose={() => setReject(null)} onOk={(note) => decide.mutate({ kind: reject.kind, id: reject.id, approve: false, note })} />}
      {view && (
        <Modal
          width={720}
          title={`${view.employee.name} · week of ${DM.format(new Date(view.weekStart + 'T00:00:00'))}`}
          sub={`${Number(view.total)} hours`}
          onClose={() => setView(null)}
          foot={
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setReject({ kind: 'sheet', id: view.id, who: view.employee.name }), setView(null))}>
                Send back
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => decide.mutate({ kind: 'sheet', id: view.id, approve: true })}>
                Approve
              </button>
            </>
          }
        >
          <div className="ma-grid-wrap">
            <div className="ma-grid">
              <div className="ma-gr ma-gh">
                <span>Project</span>
                {view.days.map((d) => (
                  <span key={d.date}>
                    {WD.format(new Date(d.date + 'T00:00:00'))} {new Date(d.date + 'T00:00:00').getDate()}
                  </span>
                ))}
                <span>Total</span>
                <span />
              </div>
              {view.rows.map((row) => (
                <div key={row.projectId} className="ma-gr">
                  <span className="ma-pn">{row.name}</span>
                  {row.hours.map((h, i) => (
                    <span key={i} className="ma-tot">
                      {h == null ? '' : Number(h)}
                    </span>
                  ))}
                  <span className="ma-tot">
                    <b>{Number(row.total)}</b>
                  </span>
                  <span />
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function RejectDialog({ title, onClose, onOk }: { title: string; onClose: () => void; onOk: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal
      width={440}
      title={title}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={!note.trim()} onClick={() => onOk(note.trim())}>
            Send
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">
          What should change?<span className="req">*</span>
        </span>
        <textarea className="input" rows={3} value={note} autoFocus onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}
