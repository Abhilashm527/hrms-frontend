import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { Overlay } from '../components/Overlay';
import { blob, errorText, fieldErrors } from '../lib/http';
import { date, dateTime } from '../lib/format';
import { onboardingApi, type HireDetail, type HireDoc } from './api';
import { Drawer, StatusPill, fmtBytes, initials, joinWhen } from './shared';
import { BlockLoader } from '../components/Splash';
import { say } from '../lib/busy';

type Tab = 'overview' | 'documents' | 'details' | 'checklist' | 'activity';

export function HireDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState<string | null>(null);
  const [ask, setAsk] = useState<null | { title: string; label: string; cta: string; danger?: boolean; run: (reason: string) => Promise<unknown> }>(null);
  const hire = useQuery({
    queryKey: ['onboarding', 'hire', id],
    queryFn: () => onboardingApi.get(id),
    // While the work account is being created, follow its progress.
    refetchInterval: (q) => (q.state.data?.m365.state === 'RUNNING' ? 1500 : false),
  });
  const docs = useQuery({ queryKey: ['onboarding', 'hire', id, 'documents'], queryFn: () => onboardingApi.documents(id) });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['onboarding'] });
  };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (e) => setToast(errorText(e)),
  });
  const run = (fn: () => Promise<unknown>, done?: string, label = 'Saving changes…') => act.mutate(say(label, fn), { onSuccess: () => done && setToast(done) });

  if (hire.isLoading) {
    return (
      <Drawer title="Loading…" onClose={onClose} wide>
        <div className="drawer-body">
          <BlockLoader fill label="Loading new hire…" />
        </div>
      </Drawer>
    );
  }
  if (hire.isError || !hire.data) {
    return (
      <Drawer title="Hire not found" onClose={onClose}>
        <div className="drawer-body">
          <Alert>{hire.error?.message ?? 'This hire does not exist.'}</Alert>
        </div>
      </Drawer>
    );
  }

  const h = hire.data;
  const joined = h.status === 'JOINED';
  const curStage = h.stages.findIndex((s) => !s);
  const toReview = docs.data?.filter((d) => d.status === 'SUBMITTED').length ?? 0;
  const open = !joined && !h.cancelledAt;

  const join = () => {
    if (h.status === 'READY_TO_JOIN') return run(() => onboardingApi.join(id), `${h.first} is now an employee. Their account invite is on its way.`, `Making ${h.first} an employee…`);
    setAsk({
      title: `Join ${h.first} before everything is verified?`,
      label: 'Reason for joining early',
      cta: 'Join anyway',
      run: (reason) => onboardingApi.join(id, true, reason),
    });
  };

  return (
    <Drawer
      wide
      onClose={onClose}
      busy={act.isPending}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="ini" style={{ width: 36, height: 36, fontSize: 13, background: 'var(--brand-tint)', color: 'var(--brand)' }}>
            {initials(h.first, h.last)}
          </span>
          {h.name}
          <StatusPill status={h.status} />
          <span className="pill no-dot pill-muted" style={{ textTransform: 'uppercase', fontSize: 10 }}>
            {h.employmentType.name}
          </span>
        </span>
      }
      sub={`${h.title} · ${h.department.name} · ${h.location.name} · ${joined ? 'joined' : 'joins'} ${date(h.doj)} · reports to ${h.job.reportsTo.name}`}
      actions={
        open && h.invite ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={act.isPending} onClick={() => run(() => onboardingApi.remind(id), `Reminder sent to ${h.invite!.to}`, 'Sending reminder…')}>
            Send reminder
          </button>
        ) : undefined
      }
      foot={
        open && h.permissions.canEdit ? (
          <>
            {h.permissions.canCancel && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setAsk({ title: `Cancel ${h.first}'s onboarding?`, label: 'Reason', cta: 'Cancel hire', danger: true, run: (r) => onboardingApi.cancel(id, r).then(onClose) })}
              >
                Cancel hire
              </button>
            )}
            <span className="grow" />
            <span className="field-hint">{h.status === 'READY_TO_JOIN' ? 'Everything is verified.' : 'Joining needs verified documents and a work account.'}</span>
            <button type="button" className="btn btn-primary btn-sm" disabled={act.isPending || (!h.permissions.canJoin && h.status !== 'READY_TO_JOIN')} onClick={join}>
              {Icon.check} Mark as joined
            </button>
          </>
        ) : joined && h.employeeId ? (
          <>
            <span className="grow" />
            <span className="field-hint">Joined — the account invite was sent to their work email.</span>
            <Link className="btn btn-secondary btn-sm" to={`/employees/${h.employeeId}`}>
              Open employee
            </Link>
          </>
        ) : undefined
      }
    >
      <div className="stages">
        {h.stagesDetail.map((s, i) => (
          <div key={s.label} className={`st${h.stages[i] ? ' done' : ''}${i === curStage ? ' cur' : ''}`}>
            <span className="dot">{h.stages[i] ? '✓' : i + 1}</span>
            <b>{s.label}</b>
            <small>{s.sub}</small>
          </div>
        ))}
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['overview', 'Overview'],
            ['documents', 'Documents'],
            ['details', 'Employee details'],
            ['checklist', 'Checklist'],
            ['activity', 'Activity'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
            {k === 'documents' && toReview > 0 && <span className="dfx-count red">{toReview}</span>}
          </button>
        ))}
      </div>
      <div className="drawer-body" style={{ background: 'var(--bg-2)' }}>
        {tab === 'overview' && <Overview h={h} run={run} busy={act.isPending} />}
        {tab === 'documents' && <Documents h={h} docs={docs.data} loading={docs.isLoading} run={run} busy={act.isPending} setAsk={setAsk} />}
        {tab === 'details' && <Details id={id} />}
        {tab === 'checklist' && <Checklist id={id} />}
        {tab === 'activity' && <Activity id={id} />}
      </div>
      {ask && <ReasonDialog {...ask} onClose={() => setAsk(null)} onDone={() => { setAsk(null); refresh(); }} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Drawer>
  );
}

type Run = (fn: () => Promise<unknown>, done?: string, label?: string) => void;

function Card({ title, icon, right, children }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Overview({ h, run, busy }: { h: HireDetail; run: Run; busy: boolean }) {
  const j = h.job;
  const kv: [string, ReactNode][] = [
    ['Employee type', j.employmentType.name],
    ['Department', j.department.name],
    ['Reports to', j.reportsTo.name],
    ['Location', j.location.name],
    ['Date of joining', `${date(j.doj)} · ${joinWhen(h.daysToJoin, h.status === 'JOINED')}`],
    ['Probation', j.probationMonths != null ? `${j.probationMonths} months` : '—'],
    ...(j.contractEnd ? ([['Contract ends', date(j.contractEnd)]] as [string, ReactNode][]) : []),
    ...(h.permissions.canViewCtc ? ([['Annual CTC', j.ctcLakh != null ? `₹${j.ctcLakh} L` : '—']] as [string, ReactNode][]) : []),
    ['Personal email', j.personalEmail],
    ['Mobile', j.phone ?? '—'],
  ];
  return (
    <div className="split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
      <Card title="Job details" icon={Icon.briefcase}>
        <div className="kv">
          {kv.map(([k, val]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{val}</b>
            </div>
          ))}
        </div>
      </Card>
      <M365Card h={h} run={run} busy={busy} />
      <Card title="Invitation" icon={Icon.mail}>
        <div className="card-body">
          {h.invite ? (
            <>
              <div className="kv" style={{ padding: 0 }}>
                <div>
                  <span>Sent to personal email</span>
                  <b>{h.invite.to}</b>
                </div>
                <div>
                  <span>Sent on</span>
                  <b>{dateTime(h.invite.sentAt)}</b>
                </div>
                <div>
                  <span>Reminders</span>
                  <b>{h.invite.reminders || 'None'}</b>
                </div>
              </div>
              {h.invite.dueDate && <span>Details and documents due by {date(h.invite.dueDate)}</span>}
              {h.status !== 'JOINED' && (
                <div className="row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => onboardingApi.resend(h.id), 'Invite sent again with a new link', 'Sending the invite again…')}>
                    Resend invite
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <span>The invite hasn't been sent. It emails a portal link to {h.job.personalEmail} to fill in details and upload documents.</span>
              <div className="row-actions">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !h.permissions.canEdit} onClick={() => run(() => onboardingApi.invite(h.id), `Invite sent to ${h.job.personalEmail}`, 'Sending invite…')}>
                  {Icon.mail} Send invite
                </button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function M365Card({ h, run, busy }: { h: HireDetail; run: Run; busy: boolean }) {
  const m = h.m365;
  const [upn, setUpn] = useState('');
  const form = useQuery({ queryKey: ['onboarding', 'hire-form', h.employmentType.id], queryFn: () => onboardingApi.form(h.employmentType.id), enabled: m.state === 'NONE', staleTime: 5 * 60_000 });
  const suggest = useQuery({ queryKey: ['onboarding', 'upn-suggest', h.first, h.last, h.employmentType.id], queryFn: () => onboardingApi.upnSuggest(h.first, h.last, h.employmentType.id), enabled: m.state === 'NONE' && !m.upn });
  const user = upn || m.upn?.split('@')[0] || suggest.data?.suggestion || suggest.data?.user || '';
  const rule = form.data?.m365Rule;
  const pill = m.state === 'ACTIVE' ? 'pill-ok' : m.state === 'FAILED' ? 'pill-danger' : m.state === 'RUNNING' ? 'pill-info' : 'pill-muted';

  const create = () =>
    run(
      () =>
        onboardingApi.createM365(h.id, {
          upnUser: user,
          license: rule?.licenseSku ?? form.data?.licenses[0] ?? 'Microsoft 365 Business Standard',
          groups: (rule?.groups ?? ['All staff', '{department}']).map((g) => g.replace('{department}', h.department.name)),
          forceReset: rule?.forceReset ?? true,
          sendSms: !!h.job.phone,
          provisionNow: true,
        }),
      'Creating the work account…',
      'Creating the Microsoft 365 account…',
    );

  return (
    <Card title="Microsoft 365 account" icon={Icon.laptop} right={<span className={`pill ${pill}`}>{m.state === 'NONE' ? 'not created' : m.state.toLowerCase()}</span>}>
      <div className="card-body">
        {m.simulated && <span className="pill no-dot pill-warn" style={{ alignSelf: 'flex-start' }}>Simulated — no real Microsoft tenant</span>}
        {(m.state === 'ACTIVE' || m.state === 'RUNNING' || m.state === 'FAILED') && (
          <div className="kv" style={{ padding: 0 }}>
            <div>
              <span>Work email / sign-in</span>
              <b className="mono">{m.upn}</b>
            </div>
            <div>
              <span>License</span>
              <b>{m.license}</b>
            </div>
            {m.groups && m.groups.length > 0 && (
              <div className="chips">
                {m.groups.map((g) => (
                  <span key={g} className="pill no-dot pill-muted" style={{ textTransform: 'uppercase', fontSize: 10 }}>
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {m.state === 'RUNNING' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {m.steps.map((s) => (
              <span key={s.label} style={{ display: 'flex', gap: 8, alignItems: 'center', color: s.done ? 'var(--success)' : s.current ? 'var(--fg-1)' : 'var(--fg-3)' }}>
                {s.done ? Icon.check : s.current ? '…' : '○'} {s.label}
              </span>
            ))}
          </div>
        )}
        {m.state === 'ACTIVE' && m.createdAt && (
          <span style={{ color: 'var(--success)' }}>
            Created {dateTime(m.createdAt)}
            {m.smsTo ? ` · credentials sent by SMS to ${m.smsTo}` : ''}
          </span>
        )}
        {m.state === 'FAILED' && <Alert>{m.error ?? 'Creating the account failed.'}</Alert>}
        {m.state === 'NONE' && (
          <>
            <span>A work account is needed before {h.first} can join.</span>
            <div className="upn">
              <input value={user} onChange={(e) => setUpn(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} aria-label="Work email user name" />
              <span>@{form.data?.domain ?? 'ivoyant.com'}</span>
            </div>
          </>
        )}
        <div className="row-actions">
          {m.state === 'NONE' && h.permissions.canEdit && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !user} onClick={create}>
              + Create Microsoft account
            </button>
          )}
          {m.state === 'FAILED' && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => onboardingApi.retryM365(h.id), 'Retrying…', 'Retrying the Microsoft 365 account…')}>
              Retry
            </button>
          )}
          {m.state === 'ACTIVE' && h.status !== 'JOINED' && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => onboardingApi.resetM365Password(h.id), 'New temporary password sent', 'Resetting the password…')}>
              Reset password
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

const DOC_STATE: Record<HireDoc['status'], { label: string; pill: string; ic: string }> = {
  SUBMITTED: { label: 'in review', pill: 'pill-warn', ic: '' },
  REJECTED: { label: 'rejected', pill: 'pill-danger', ic: 'bad' },
  MISSING: { label: 'not uploaded', pill: 'pill-muted', ic: 'none' },
  VERIFIED: { label: 'verified', pill: 'pill-ok', ic: 'ok' },
};

function Documents({ h, docs, loading, run, busy, setAsk }: { h: HireDetail; docs?: HireDoc[]; loading: boolean; run: Run; busy: boolean; setAsk: (a: { title: string; label: string; cta: string; danger?: boolean; run: (r: string) => Promise<unknown> }) => void }) {
  const [adding, setAdding] = useState('');
  const form = useQuery({ queryKey: ['onboarding', 'hire-form', h.employmentType.id], queryFn: () => onboardingApi.form(h.employmentType.id), staleTime: 5 * 60_000 });
  const have = new Set(docs?.map((d) => d.key));
  const more = form.data?.documents.filter((d) => !have.has(d.key)) ?? [];
  const inReview = docs?.filter((d) => d.status === 'SUBMITTED').length ?? 0;
  const editable = h.permissions.canEdit && h.status !== 'JOINED';

  const view = async (d: HireDoc) => {
    // Opened with the access token; the link is temporary and only valid in this tab.
    const tab = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await blob(onboardingApi.docFile(h.id, d.id)));
      if (tab) tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      alert(e instanceof Error ? e.message : 'Could not open the file');
    }
  };

  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <span>
          {docs?.length ?? 0} documents · {h.docs.verified} of {h.docs.required} required verified
        </span>
        {editable && (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {more.length > 0 && (
              <>
                <select className="sel" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Request another document">
                  <option value="">Request another document</option>
                  {more.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!adding || busy} onClick={() => run(() => onboardingApi.requestDocument(h.id, adding, true).then(() => setAdding('')), 'Document requested', 'Requesting document…')}>
                  + Request
                </button>
              </>
            )}
            <button type="button" className="btn btn-primary btn-sm" disabled={!inReview || busy} onClick={() => run(() => onboardingApi.verifyAll(h.id), 'All documents in review verified', 'Verifying documents…')}>
              {Icon.check} Verify all in review
            </button>
          </span>
        )}
      </div>
      {loading && <BlockLoader height={100} size={24} label="Loading documents…" />}
      {docs?.length === 0 && <div className="card-empty">No documents requested</div>}
      {docs?.map((d) => {
        const s = DOC_STATE[d.status];
        return (
          <div className="list-row" key={d.id}>
            <span className={`doc-ic ${s.ic}`}>{Icon.file}</span>
            <span className="txt">
              <b>
                {d.name} <small style={{ color: 'var(--fg-3)', fontWeight: 400 }}>{d.required ? 'required' : 'optional'}</small>
              </b>
              <span>{[d.group, d.hint].filter(Boolean).join(' · ')}</span>
              {d.note && <span style={{ color: 'var(--danger)' }}>{d.note}</span>}
            </span>
            <span className="txt" style={{ flex: '0 0 170px' }}>
              <b className="mono" style={{ fontSize: 12 }}>
                {d.file?.name ?? '—'}
              </b>
              <span>{d.file ? `${fmtBytes(d.file.sizeBytes)} · ${date(d.file.uploadedAt)}` : 'Waiting for upload'}</span>
            </span>
            <span className={`pill ${s.pill}`}>{s.label}</span>
            <span style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
              {d.file && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => view(d)}>
                  View
                </button>
              )}
              {editable && d.status === 'SUBMITTED' && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk({ title: `Reject ${d.name}?`, label: `Tell ${h.first} what to fix`, cta: 'Reject', danger: true, run: (r) => onboardingApi.reject(h.id, d.id, r) })}>
                    Reject
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => onboardingApi.verify(h.id, d.id), undefined, 'Verifying document…')}>
                    Verify
                  </button>
                </>
              )}
              {editable && d.status === 'VERIFIED' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk({ title: `Undo verification of ${d.name}?`, label: 'Reason', cta: 'Undo', run: (r) => onboardingApi.unverify(h.id, d.id, r) })}>
                  Undo
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Details({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['onboarding', 'hire', id, 'details'], queryFn: () => onboardingApi.details(id) });
  if (q.isLoading) return <div className="card"><BlockLoader height={120} size={28} label="Loading details…" /></div>;
  if (q.isError) return <div className="card card-empty">{q.error.message}</div>;
  if (!q.data?.length) return <div className="card card-empty">Nothing filled in yet. The hire fills these in on the onboarding portal.</div>;
  return (
    <>
      {q.data.map((s) => (
        <Card key={s.name} title={s.name}>
          <div className="kv" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {s.fields.map((f) => (
              <div key={f.key}>
                <span>{f.label}</span>
                <b>{f.value || '—'}</b>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function Checklist({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['onboarding', 'hire', id, 'tasks'], queryFn: () => onboardingApi.tasks(id) });
  const toggle = useMutation({
    meta: { busy: (v: unknown) => ((v as { done: boolean }).done ? 'Marking task done…' : 'Reopening task…') },
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) => onboardingApi.setTask(id, taskId, done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding', 'hire', id, 'tasks'] }),
  });
  if (q.isLoading) return <div className="card"><BlockLoader height={120} size={28} label="Loading tasks…" /></div>;
  if (q.isError) return <div className="card card-empty">{q.error.message}</div>;
  const phases = Array.from(new Set(q.data?.map((t) => t.phase)));
  if (!phases.length) return <div className="card card-empty">No checklist tasks configured.</div>;
  return (
    <>
      {phases.map((p) => (
        <Card key={p} title={p}>
          {q.data!
            .filter((t) => t.phase === p)
            .map((t) => (
              <label className="list-row" key={t.id} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={t.done} disabled={toggle.isPending} onChange={(e) => toggle.mutate({ taskId: t.id, done: e.target.checked })} style={{ accentColor: 'var(--brand)' }} />
                <span className="txt">
                  <b style={{ textDecoration: t.done ? 'line-through' : undefined }}>{t.name}</b>
                  <span>{[t.owner, t.assignee?.name, t.doneAt && `done ${date(t.doneAt)}`].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            ))}
        </Card>
      ))}
    </>
  );
}

function Activity({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['onboarding', 'hire', id, 'events'], queryFn: () => onboardingApi.events(id) });
  if (q.isLoading) return <div className="card"><BlockLoader height={120} size={28} label="Loading activity…" /></div>;
  if (q.isError) return <div className="card card-empty">{q.error.message}</div>;
  return (
    <div className="card timeline">
      {q.data?.items.length === 0 && <div className="card-empty">No activity yet</div>}
      {q.data?.items.map((e) => (
        <div className="ev" key={e.id}>
          <i className={e.kind === 'OK' ? 'ok' : e.kind === 'WARN' ? 'warn' : e.kind === 'ERR' ? 'bad' : ''} />
          <span className="txt" style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
            <b style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>{e.title}</b>
            <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>{e.description}</span>
          </span>
          <span className="meta" style={{ fontSize: 11.5, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
            {dateTime(e.at)} · {e.by}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReasonDialog({ title, label, cta, danger, run, onClose, onDone }: { title: string; label: string; cta: string; danger?: boolean; run: (r: string) => Promise<unknown>; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const m = useMutation({ meta: { busy: `${cta}…` }, mutationFn: () => run(reason.trim()), onSuccess: onDone });
  const fe = fieldErrors(m.error);
  return (
    <Overlay>
    <div className="modal-scrim" style={{ zIndex: 9000 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        style={{ maxWidth: 440 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) m.mutate();
        }}
      >
        <div className="modal-head">
          <b style={{ fontSize: 15, color: 'var(--fg-1)' }}>{title}</b>
        </div>
        <div className="modal-body">
          {m.error && <Alert>{fe.reason ?? errorText(m.error)}</Alert>}
          <label className="field">
            <span className="field-label">{label}</span>
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Back
          </button>
          <button type="submit" className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!reason.trim() || m.isPending}>
            {m.isPending ? 'Working…' : cta}
          </button>
        </div>
      </form>
    </div>
    </Overlay>
  );
}
