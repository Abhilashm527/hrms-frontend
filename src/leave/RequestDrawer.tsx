import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { Drawer } from '../onboarding/shared';
import { STEP_ROLE, TYPE_COLORS, leaveApi, type ReqDetail } from './api';
import { ReqBadge, TypeChip, dd, fmtDate, fmtShort, fmtTime, range } from './ui';

type Tab = 'details' | 'activity' | 'history';

export function RequestDrawer({ id, onClose, openLedger, open }: { id: string; onClose: () => void; openLedger: (employeeId: string) => void; open: (id: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['leave', 'request', id], queryFn: () => leaveApi.request(id) });
  const [tab, setTab] = useState<Tab>('details');
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [internal, setInternal] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const done = (r: ReqDetail) => {
    qc.setQueryData(['leave', 'request', id], r);
    qc.invalidateQueries({ queryKey: ['leave'] });
    setErr(null);
  };
  const act = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<ReqDetail>; busy: string }) => v.run(),
    onSuccess: (r) => (done(r), setRejecting(false), setNote(''), setInternal('')),
    onError: (e) => setErr(errorText(e)),
  });
  const r = q.data;
  const tone = r?.employee?.department ? { fg: `var(--dc${r.employee.department.color}-fg)`, bg: `var(--dc${r.employee.department.color}-bg)` } : undefined;

  const foot = r?.can.decide ? (
    <div className="lv-act">
      <span className="lv-acting">{r.waitingOn ? `Step ${(r.progress?.done ?? 0) + 1} of ${r.progress?.total} · ${STEP_ROLE[r.waitingRole ?? ''] ?? ''}` : ''}</span>
      {!rejecting ? (
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(true)}>
            Reject
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => act.mutate({ run: () => leaveApi.approve(id, note || undefined), busy: 'Approving leave…' })}>
            {Icon.check} Approve
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setRejecting(false), setNote(''))}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={!note.trim()} onClick={() => act.mutate({ run: () => leaveApi.reject(id, note.trim()), busy: 'Rejecting leave…' })}>
            Confirm reject
          </button>
        </>
      )}
    </div>
  ) : r?.can.cancel ? (
    <div className="lv-act">
      <span className="grow" />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => {
          const why = prompt(r.status === 'APPROVED' ? 'Cancel this approved leave? The days go back to the balance. Reason (optional):' : 'Withdraw this request? Reason (optional):');
          if (why !== null) act.mutate({ run: () => leaveApi.cancel(id, why || undefined), busy: 'Cancelling leave…' });
        }}
      >
        {r.status === 'APPROVED' ? 'Cancel leave' : 'Withdraw request'}
      </button>
    </div>
  ) : undefined;

  return (
    <Drawer
      title={
        <span className="lv-dr-title">
          <span className="mono">{r?.no ?? '…'}</span>
          {r && <ReqBadge status={r.status} />}
        </span>
      }
      onClose={onClose}
      foot={foot}
    >
      {q.isLoading && <BlockLoader fill label="Loading request…" />}
      {q.isError && (
        <div className="drawer-body">
          <Alert>{errorText(q.error)}</Alert>
        </div>
      )}
      {r && (
        <>
          <div className="lv-dr-who">
            <Avatar url={r.employee?.photoUrl} initials={r.employee?.initials ?? '?'} size={40} tone={tone} />
            <span className="lv-two">
              <b style={{ fontSize: 14 }}>{r.employee?.name}</b>
              <span>{[r.employee?.title, r.employee?.department?.name].filter(Boolean).join(' · ')}</span>
            </span>
          </div>
          <div className="dfx-tabbar lv-dr-tabs">
            {(
              [
                ['details', 'Details'],
                ['activity', 'Activity'],
                ['history', 'History'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="drawer-body">
            {err && <Alert>{err}</Alert>}
            {tab === 'details' && <Details r={r} />}
            {tab === 'activity' && (
              <Activity
                r={r}
                internal={internal}
                setInternal={setInternal}
                addNote={() => act.mutate({ run: () => leaveApi.note(id, internal.trim()), busy: 'Adding note…' })}
                remind={() => act.mutate({ run: () => leaveApi.remind(id), busy: 'Sending reminder…' })}
              />
            )}
            {tab === 'history' && <History r={r} openLedger={() => openLedger(r.employee.id)} open={open} />}
            {rejecting && (
              <label className="lv-field">
                <span>Reason for rejecting</span>
                <textarea className="input" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shared with the employee" />
              </label>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

function Details({ r }: { r: ReqDetail }) {
  const facts: [string, React.ReactNode][] = [
    ['Leave type', <span className="lv-typecell" key="t"><TypeChip code={r.type?.code ?? '?'} color={r.type?.color} />{r.type?.name}</span>],
    ['Days', dd(r.days, r.half)],
    ['Dates', range(r.from, r.to)],
    ['Applied', `${fmtDate(r.appliedAt)} · ${fmtTime(r.appliedAt)}`],
  ];
  if (r.hasDocument) facts.push(['Document', 'Attached']);
  if (r.decidedAt && r.status !== 'PENDING') facts.push([r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Rejected' : 'Cancelled', fmtDate(r.decidedAt)]);
  return (
    <>
      <div className="lv-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="lv-sec">
        <span className="lv-cap">Reason</span>
        <span className="lv-text">{r.reason}</span>
      </div>
      {r.decisionNote && r.status !== 'PENDING' && (
        <div className="lv-sec">
          <span className="lv-cap">{r.status === 'REJECTED' ? 'Why it was rejected' : 'Note'}</span>
          <span className="lv-text">{r.decisionNote}</span>
        </div>
      )}
      {r.overlap.length > 0 && r.status === 'PENDING' && (
        <div className="lv-warn">
          Also off in {r.employee.department?.name ?? 'the team'} at the same time: {r.overlap.join(', ')}
        </div>
      )}
      {r.fields.length > 0 && (
        <div className="lv-facts">
          {r.fields.map((f) => (
            <div key={f.key}>
              <span>{f.k}</span>
              <b>{typeof f.v === 'boolean' ? (f.v ? 'Yes' : 'No') : Array.isArray(f.v) ? f.v.join(', ') : String(f.v ?? '—')}</b>
            </div>
          ))}
        </div>
      )}
      <div className="lv-sec">
        <span className="lv-cap">Approval chain</span>
        {r.steps.length === 0 && <span className="field-hint">No approval needed under the approval chain · approved when applied.</span>}
        <div className="lv-steps">
          {r.steps.map((s) => (
            <div key={s.sort} className={`lv-step ${s.state.toLowerCase()}`}>
              <span className="lv-step-n">{s.state === 'APPROVED' ? Icon.checkSmall : s.state === 'REJECTED' ? '✕' : s.sort}</span>
              <span className="lv-two">
                <b>
                  {s.person?.name ?? '—'}
                  {s.delegated && <span className="pill no-dot pill-muted" style={{ marginLeft: 6 }}>delegate</span>}
                </b>
                <span>
                  {STEP_ROLE[s.role] ?? s.role}
                  {s.state === 'PENDING' && ' · waiting'}
                  {s.state === 'WAITING' && ' · next'}
                  {s.state === 'SKIPPED' && ' · not needed'}
                  {s.actedAt && ` · ${fmtShort(s.actedAt)} ${fmtTime(s.actedAt)}`}
                </span>
                {s.note && <span className="lv-quote">“{s.note}”</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const EV: Record<string, [string, string]> = {
  APPLIED: ['Applied', '#3B82F6'],
  STEP_APPROVED: ['Step approved', '#10B981'],
  APPROVED: ['Approved', '#10B981'],
  AUTO_APPROVED: ['Approved automatically', '#10B981'],
  REJECTED: ['Rejected', '#EF4444'],
  CANCELLED: ['Cancelled', '#94A3B8'],
  NOTE: ['Internal note', '#8B5CF6'],
  REMINDED: ['Reminder sent', '#F59E0B'],
};

function Activity({ r, internal, setInternal, addNote, remind }: { r: ReqDetail; internal: string; setInternal: (v: string) => void; addNote: () => void; remind: () => void }) {
  return (
    <>
      <div className="lv-timeline">
        {r.events.map((e, i) => {
          const [t, c] = EV[e.kind] ?? [e.kind, '#94A3B8'];
          return (
            <div key={i} className="lv-ev">
              <span className="lv-ev-rail">
                <span style={{ background: c }} />
                {i < r.events.length - 1 && <i />}
              </span>
              <span className="lv-ev-body">
                <span className="lv-ev-top">
                  <b>{t}</b>
                  <small>
                    {fmtDate(e.at)} · {fmtTime(e.at)}
                  </small>
                </span>
                <span>{e.text || (e.actor ? `by ${e.actor.name}` : '')}</span>
              </span>
            </div>
          );
        })}
      </div>
      {(r.can.note || r.can.remind) && (
        <div className="lv-note-box">
          {r.can.note && (
            <>
              <span className="lv-cap">Add internal note</span>
              <textarea className="input" rows={2} value={internal} onChange={(e) => setInternal(e.target.value)} placeholder="Only visible to HR admins" />
            </>
          )}
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            {r.can.remind && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={remind}>
                {Icon.bell} Remind approver
              </button>
            )}
            {r.can.note && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={!internal.trim()} onClick={addNote}>
                Add note
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function History({ r, openLedger, open }: { r: ReqDetail; openLedger: () => void; open: (id: string) => void }) {
  return (
    <>
      <div className="lv-balcards">
        {r.balances.map((b) => {
          const [fg, bg] = TYPE_COLORS[b.color] ?? TYPE_COLORS[9];
          return (
            <div key={b.code}>
              <span className="lv-type" style={{ color: fg, background: bg, alignSelf: 'flex-start' }}>
                {b.code}
              </span>
              <b>
                {b.available} <small>of {b.quota}</small>
              </b>
              <span>
                {b.used} used{b.pending ? ` · ${b.pending} pending` : ''}
              </span>
            </div>
          );
        })}
      </div>
      <div className="lv-sec">
        <span className="lv-cap-row">
          <span className="lv-cap">All requests · {r.past.length ? `${r.past.length} earlier` : 'none earlier'}</span>
          <button type="button" className="link-btn" onClick={openLedger}>
            Full leave history
          </button>
        </span>
        <div className="lv-past">
          {r.past.map((p) => (
            <button key={p.id} type="button" onClick={() => open(p.id)}>
              <TypeChip code={p.type?.code ?? '?'} color={p.type?.color} />
              <span className="lv-two">
                <b style={{ fontWeight: 500 }}>{range(p.from, p.to)}</b>
                <span>
                  {p.no} · {dd(p.days, p.half)}
                </span>
              </span>
              <ReqBadge status={p.status} />
            </button>
          ))}
          {r.past.length === 0 && <span className="lv-empty sm">No other requests</span>}
        </div>
      </div>
    </>
  );
}
