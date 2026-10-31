import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { Modal } from '../leave/ui';
import { Drawer } from '../onboarding/shared';
import { type Change, type Decl, inr, openBlob, type Queue, type Req, reqApi, saveBlob, show, STATUS } from './api';

type Tab = 'changes' | 'letters' | 'reimb' | 'tickets' | 'decl';
const TABS: [Tab, string, Queue | null][] = [
  ['changes', 'Profile changes', null],
  ['letters', 'Letters', 'LETTER'],
  ['reimb', 'Reimbursements', 'REIMBURSEMENT'],
  ['tickets', 'Helpdesk', 'HELPDESK'],
  ['decl', 'Tax declarations', 'DECLARATION'],
];
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const stamp = (s: string) => new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Pill({ status }: { status: string }) {
  const [l, tone] = STATUS[status] ?? [status, 'grey'];
  return <span className={`rq-st ${tone}`}>{l}</span>;
}

/** One submission of profile changes: the fields one person changed at the same time. */
type ChangeGroup = { key: string; recordId: string; who: string; by: string; at: string; items: Change[] };
const groupChanges = (list: Change[]): ChangeGroup[] => {
  const m = new Map<string, ChangeGroup>();
  for (const c of list) {
    const key = `${c.recordId}|${c.requestedBy}|${c.requestedAt.slice(0, 16)}`;
    const g = m.get(key) ?? { key, recordId: c.recordId, who: c.recordLabel, by: c.requestedBy, at: c.requestedAt, items: [] };
    g.items.push(c);
    m.set(key, g);
  }
  return [...m.values()];
};

type Ask = { kind: 'reject' | 'resolve' | 'issue' | 'rejectTax' | 'rejectChange'; id: string; title: string; ids?: string[] };

export function InboxPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'changes';
  const [closed, setClosed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const queue = TABS.find(([k]) => k === tab)?.[2] ?? null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // counts come with any queue; the letters queue is cheap enough to ask for when profile changes are shown
  const q = useQuery({ queryKey: ['requests', 'inbox', queue ?? 'LETTER', closed], queryFn: () => reqApi.inbox(queue ?? 'LETTER', closed) });
  const ch = useQuery({ queryKey: ['requests', 'changes', closed], queryFn: () => reqApi.changes(closed ? 'APPROVED' : 'PENDING'), retry: false });
  const groups = useMemo(() => groupChanges(ch.data ?? []), [ch.data]);
  const pendingChanges = useQuery({ queryKey: ['requests', 'changes', false], queryFn: () => reqApi.changes('PENDING'), retry: false, enabled: closed });
  const changeCount = groupChanges((closed ? pendingChanges.data : ch.data) ?? []).length;
  const counts: Record<Tab, number> = {
    changes: changeCount,
    letters: q.data?.counts.LETTER ?? 0,
    reimb: q.data?.counts.REIMBURSEMENT ?? 0,
    tickets: q.data?.counts.HELPDESK ?? 0,
    decl: q.data?.counts.DECLARATION ?? 0,
  };

  const act = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<unknown>; busy: string; done: string }) => v.run(),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      setToast(v.done);
      setAsk(null);
      setErr(null);
    },
    onError: (e) => setErr(errorText(e)),
  });
  const go = (t: Tab) => setSp(t === 'changes' ? {} : { tab: t });

  const reqRow = (r: Req) => {
    const sub =
      r.kind === 'REIMBURSEMENT'
        ? [r.note, r.receipt, r.stage === 'FINANCE' && r.manager ? `Approved by ${r.manager}` : r.stage === 'MANAGER' ? 'Waiting for manager' : ''].filter(Boolean).join(' · ')
        : r.kind === 'HELPDESK'
          ? r.note
          : r.note;
    const title = r.kind === 'REIMBURSEMENT' ? `${r.type.name} · ${inr(r.amount)}` : r.kind === 'HELPDESK' ? `${r.type.name} · ${r.subject}` : r.type.name;
    const name = r.employee.first;
    return (
      <div key={r.id} className="rq-row click" onClick={() => setOpen(r.id)}>
        <Avatar initials={r.employee.initials} size={32} noPhoto />
        <span className="rq-who">
          <b>{r.employee.name}</b>
          <small>{[r.employee.title, r.employee.department].filter(Boolean).join(' · ') || r.employee.code}</small>
        </span>
        <span className="rq-what">
          <b>
            {title}
            <em className="rq-ref">{r.ref}</em>
          </b>
          <small>{sub || '—'}</small>
        </span>
        <span className="rq-date">{fmt(closed ? (r.decidedAt ?? r.createdAt) : r.createdAt)}</span>
        {closed ? (
          <Pill status={r.status} />
        ) : (
          <span className="rq-acts" onClick={(e) => e.stopPropagation()}>
            {r.kind !== 'HELPDESK' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsk({ kind: 'reject', id: r.id, title: `${r.kind === 'LETTER' ? 'Decline' : 'Reject'} ${r.ref}?` })}>
                Reject
              </button>
            )}
            {r.action === 'ISSUE' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsk({ kind: 'issue', id: r.id, title: `Issue ${r.type.name.toLowerCase()} · ${name}` })}>
                Issue letter
              </button>
            )}
            {r.action === 'RESOLVE' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsk({ kind: 'resolve', id: r.id, title: `Resolve “${r.subject}”` })}>
                Mark resolved
              </button>
            )}
            {(r.action === 'APPROVE' || r.action === 'PAY') && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  act.mutate({
                    run: () => reqApi.approve(r.id),
                    busy: r.action === 'PAY' ? 'Approving the payout…' : 'Approving the claim…',
                    done: r.action === 'PAY' ? `${r.ref} approved for payout · ${name} notified` : `${r.ref} sent to finance · ${name} notified`,
                  })
                }
              >
                {r.action === 'PAY' ? 'Approve payout' : 'Approve'}
              </button>
            )}
          </span>
        )}
      </div>
    );
  };

  const declRow = (d: Decl) => {
    const e = d.employee!;
    const sub =
      d.regime === 'OLD'
        ? [`80C ${inr(d.sec80c)}`, `80D ${inr(d.sec80d)}`, `Rent ${inr(d.rentMonthly)}/mo`, `NPS ${inr(d.nps)}`, d.homeLoan ? `Home loan ${inr(d.homeLoan)}` : ''].filter(Boolean).join(' · ')
        : 'New regime · no deductions declared';
    return (
      <div key={d.id} className="rq-row">
        <Avatar initials={e.initials} size={32} noPhoto />
        <span className="rq-who">
          <b>{e.name}</b>
          <small>{[e.title, e.department].filter(Boolean).join(' · ') || e.code}</small>
        </span>
        <span className="rq-what">
          <b>
            Tax declaration · {d.regime === 'OLD' ? 'Old' : 'New'} regime<em className="rq-ref">FY {d.fy}</em>
          </b>
          <small>
            {sub}
            {closed && d.decisionNote ? ` · ${d.decisionNote}` : ''}
          </small>
        </span>
        <span className="rq-date">{fmt(closed ? d.decidedAt : d.submittedAt)}</span>
        {closed ? (
          <Pill status={d.status} />
        ) : (
          <span className="rq-acts">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsk({ kind: 'rejectTax', id: d.id!, title: `Send back ${e.first}’s declaration?` })}>
              Send back
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => act.mutate({ run: () => reqApi.verifyTax(d.id!), busy: 'Verifying the declaration…', done: `Declaration verified · ${e.first} notified` })}>
              Verify
            </button>
          </span>
        )}
      </div>
    );
  };

  const changeRow = (g: ChangeGroup) => (
    <div key={g.key} className="rq-row">
      <Avatar initials={g.who.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()} size={32} noPhoto />
      <span className="rq-who">
        <b>{g.who}</b>
        <small>{g.by === g.who ? 'Self-service' : `Asked by ${g.by}`}</small>
      </span>
      <span className="rq-what">
        <b>{g.items.map((c) => c.fieldLabel).join(', ')}</b>
        <small>{g.items.map((c) => `${c.fieldLabel}: ${show(c.oldValue)} → ${show(c.newValue)}`).join(' · ')}</small>
      </span>
      <span className="rq-date">{fmt(g.at)}</span>
      {closed ? (
        <Pill status={g.items[0].status} />
      ) : (
        <span className="rq-acts">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsk({ kind: 'rejectChange', id: g.key, ids: g.items.map((c) => c.id), title: `Reject ${g.who}’s changes?` })}>
            Reject
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() =>
              act.mutate({
                run: async () => {
                  for (const c of g.items) await reqApi.approveChange(c.id);
                },
                busy: 'Applying the change…',
                done: `Change applied · ${g.who.split(' ')[0]} notified`,
              })
            }
          >
            Approve
          </button>
        </span>
      )}
    </div>
  );

  const loading = tab === 'changes' ? ch.isLoading : q.isLoading;
  const error = tab === 'changes' ? ch.error : q.error;
  const rows =
    tab === 'changes' ? groups.map(changeRow) : tab === 'decl' ? ((q.data?.items ?? []) as Decl[]).map(declRow) : ((q.data?.items ?? []) as Req[]).map(reqRow);

  return (
    <div className="rq-page">
      <div className="rq-top">
        <span>
          <h1>Employee requests</h1>
          <small>Submitted from employee self-service · leave requests stay under Leave & attendance</small>
        </span>
        <span className="lv-seg" role="group">
          <button type="button" aria-pressed={!closed} onClick={() => setClosed(false)}>
            Waiting
          </button>
          <button type="button" aria-pressed={closed} onClick={() => setClosed(true)}>
            Done
          </button>
        </span>
        <Link className="btn btn-secondary btn-sm" to="/me/requests">
          My requests
        </Link>
      </div>
      <div className="dfx-tabbar" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => go(k)}>
            {l}
            {counts[k] > 0 && <span className="dfx-count red">{counts[k]}</span>}
          </button>
        ))}
      </div>
      {err && <Alert>{err}</Alert>}
      <div className="rq-list">
        {loading ? (
          <BlockLoader label="Loading requests…" height={180} />
        ) : error ? (
          <Alert>{errorText(error)}</Alert>
        ) : rows.length === 0 ? (
          <div className="rq-empty">{closed ? 'Nothing decided here yet' : 'Nothing pending in this queue'}</div>
        ) : (
          rows
        )}
      </div>

      {open && <RequestDrawer id={open} onClose={() => setOpen(null)} />}
      {ask && <AskDialog ask={ask} busy={act.isPending} err={err} onClose={() => (setAsk(null), setErr(null))} run={act.mutate} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function AskDialog({ ask, busy, err, onClose, run }: { ask: Ask; busy: boolean; err: string | null; onClose: () => void; run: (v: { run: () => Promise<unknown>; busy: string; done: string }) => void }) {
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'standard' | 'upload'>('standard');
  const [file, setFile] = useState<File | null>(null);
  const [perr, setPerr] = useState<string | null>(null);
  const issue = ask.kind === 'issue';
  const label = { reject: 'Reject', resolve: 'Mark resolved', issue: 'Issue letter', rejectTax: 'Send back', rejectChange: 'Reject' }[ask.kind];
  const go = () => {
    if (issue && mode === 'upload' && !file) return setPerr('Choose the signed PDF');
    const n = note.trim() || undefined;
    switch (ask.kind) {
      case 'reject':
        return run({ run: () => reqApi.reject(ask.id, n), busy: 'Rejecting…', done: 'Request rejected · employee notified' });
      case 'resolve':
        return run({ run: () => reqApi.resolve(ask.id, n), busy: 'Resolving the ticket…', done: 'Ticket resolved · employee notified' });
      case 'rejectTax':
        return run({ run: () => reqApi.rejectTax(ask.id, n), busy: 'Sending it back…', done: 'Declaration sent back · employee notified' });
      case 'rejectChange':
        return run({
          run: async () => {
            for (const id of ask.ids ?? []) await reqApi.rejectChange(id, n);
          },
          busy: 'Rejecting the change…',
          done: 'Change rejected · employee notified',
        });
      default: {
        const fd = new FormData();
        if (n) fd.append('note', n);
        if (mode === 'upload' && file) fd.append('file', file);
        return run({ run: () => reqApi.issue(ask.id, fd), busy: 'Issuing the letter…', done: 'Letter issued · ready for the employee to download' });
      }
    }
  };
  return (
    <Modal
      width={480}
      title={ask.title}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn btn-sm ${ask.kind.startsWith('reject') ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={go}>
            {label}
          </button>
        </>
      }
    >
      {(err || perr) && <Alert>{perr ?? err}</Alert>}
      {issue && (
        <div className="rq-issue">
          <label className={mode === 'standard' ? 'on' : ''}>
            <input type="radio" checked={mode === 'standard'} onChange={() => setMode('standard')} />
            <span>
              <b>Standard letter</b>
              <small>Generated from the employee’s record and signed with your name</small>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.preventDefault();
                reqApi.preview(ask.id).then(openBlob, (x) => setPerr(errorText(x)));
              }}
            >
              Preview
            </button>
          </label>
          <label className={mode === 'upload' ? 'on' : ''}>
            <input type="radio" checked={mode === 'upload'} onChange={() => setMode('upload')} />
            <span>
              <b>Upload a signed letter</b>
              <small>{file ? file.name : 'PDF, JPG or PNG up to 10 MB'}</small>
            </span>
            {mode === 'upload' && <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setPerr(null))} />}
          </label>
        </div>
      )}
      <label className="lv-field">
        <span>{ask.kind === 'resolve' ? 'Resolution' : issue ? 'Note to the employee (optional)' : 'Reason (the employee sees this)'}</span>
        <textarea className="input sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={ask.kind === 'resolve' ? 'What was done' : ''} />
      </label>
    </Modal>
  );
}

export function RequestDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['requests', 'detail', id], queryFn: () => reqApi.detail(id) });
  const [err, setErr] = useState<string | null>(null);
  const r = q.data;
  const dl = (which: 'receipt' | 'letter', name: string) => reqApi.file(id, which).then((b) => saveBlob(b, name), (e) => setErr(errorText(e)));
  return (
    <Drawer title={r ? `${r.ref} · ${r.kind === 'HELPDESK' ? r.subject : r.type.name}` : 'Request'} sub={r ? `${r.employee.name} · ${fmt(r.createdAt)}` : undefined} onClose={onClose}>
      {q.isLoading && <BlockLoader label="Opening the request…" height={200} />}
      {q.isError && <Alert>{errorText(q.error)}</Alert>}
      {err && <Alert>{err}</Alert>}
      {r && (
        <div className="rq-detail">
          <div className="rq-dhead">
            <Pill status={r.status} />
            {r.stageLabel && <span className="rq-stage">{r.stageLabel}</span>}
          </div>
          <dl className="rq-dl">
            <dt>Type</dt>
            <dd>{r.type.name}</dd>
            {r.kind === 'HELPDESK' && (
              <>
                <dt>Subject</dt>
                <dd>{r.subject}</dd>
              </>
            )}
            {r.amount != null && (
              <>
                <dt>Amount</dt>
                <dd>{inr(r.amount)}</dd>
              </>
            )}
            {r.expenseDate && (
              <>
                <dt>Expense date</dt>
                <dd>{fmt(r.expenseDate)}</dd>
              </>
            )}
            <dt>{r.kind === 'LETTER' ? 'Purpose' : 'Details'}</dt>
            <dd className="pre">{r.note || '—'}</dd>
            {r.manager && (
              <>
                <dt>Manager</dt>
                <dd>{r.manager}</dd>
              </>
            )}
            {r.decisionNote && (
              <>
                <dt>{r.status === 'RESOLVED' ? 'Resolution' : 'Note'}</dt>
                <dd className="pre">{r.decisionNote}</dd>
              </>
            )}
          </dl>
          <div className="rq-files">
            {r.receipt && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dl('receipt', r.receipt!)}>
                {Icon.download} Receipt · {r.receipt}
              </button>
            )}
            {r.letter && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dl('letter', r.letter!)}>
                {Icon.download} {r.letter}
              </button>
            )}
          </div>
          {(r.events?.length ?? 0) > 0 && (
            <div className="rq-log">
              <b>History</b>
              {r.events!.map((e, i) => (
                <div key={i}>
                  <small>{stamp(e.at)}</small>
                  <span>
                    {e.action}
                    {e.action === 'Submitted' || e.action === 'Opened' ? ` · ${e.by}` : ''}
                    {e.note ? ` — ${e.note}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
