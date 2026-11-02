import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { Modal } from '../leave/ui';
import { errorText, fieldErrors } from '../lib/http';
import { MANAGER_Q, RATE_C, SELF_Q, fmtD, perfApi, type Goal, type Review } from './api';

const ST: Record<string, [string, string]> = { DRAFT: ['Draft', 'pill-muted'], ACTIVE: ['Open', 'pill-info'], CLOSED: ['Closed', 'pill-ok'] };
type Filter = 'ALL' | 'SELF' | 'MANAGER' | 'DONE';

function useToast() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    if (!t) return;
    const x = setTimeout(() => setT(null), 3200);
    return () => clearTimeout(x);
  }, [t]);
  return [t, setT] as const;
}

/** Performance: review cycles for HR, and the reviews a manager writes. */
export function PerformancePage() {
  const qc = useQueryClient();
  const cycles = useQuery({ queryKey: ['perf', 'cycles'], queryFn: perfApi.cycles });
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useToast();
  const [err, setErr] = useState<string | null>(null);
  const list = cycles.data?.items ?? [];
  const current = sel ?? list.find((c) => c.status === 'ACTIVE')?.id ?? list[0]?.id ?? null;
  const cyc = useQuery({ queryKey: ['perf', 'cycle', current], queryFn: () => perfApi.cycle(current!), enabled: !!current });
  const act = useMutation({
    mutationFn: (v: { fn: () => Promise<unknown>; done: string }) => v.fn(),
    onSuccess: (_r, v) => (qc.invalidateQueries({ queryKey: ['perf'] }), setToast(v.done), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  if (cycles.isLoading) return <BlockLoader page label="Loading reviews…" />;
  if (cycles.isError || !cycles.data) return <Alert>{errorText(cycles.error)}</Alert>;
  const c = cyc.data;
  const canManage = cycles.data.canManage;
  const rows = (c?.rows ?? []).filter((r) => (filter === 'SELF' ? !r.selfDone : filter === 'MANAGER' ? r.selfDone && !r.managerDone : filter === 'DONE' ? r.managerDone : true));
  const max = Math.max(1, ...(c?.distribution.map((d) => d.n) ?? [1]));
  const pct = c && c.total ? Math.round((c.done / c.total) * 100) : 0;

  return (
    <div className="py-page">
      <div className="ml-top">
        <span>
          <h1>Performance</h1>
          <small>{canManage ? 'Review cycles, ratings and calibration' : 'Reviews you write for your team'}</small>
        </span>
        {list.length > 0 && (
          <select className="input sm py-sel" value={current ?? ''} onChange={(e) => setSel(e.target.value)} aria-label="Review cycle">
            {list.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {ST[x.status][0]}
              </option>
            ))}
          </select>
        )}
        {canManage && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            {Icon.plus} New review cycle
          </button>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      {!current ? (
        <div className="py-empty">
          <b>No review cycles yet</b>
          <span>{canManage ? 'Create a cycle for a period (say H2 2026), then launch it to open everyone’s reviews.' : 'Reviews appear here when HR opens a cycle.'}</span>
        </div>
      ) : !c ? (
        <BlockLoader label="Loading the cycle…" height={160} />
      ) : (
        <div className="pf-top">
          <div className="py-run">
            <div className="py-run-head">
              <span>
                <b>{c.name}</b>
                <small>
                  {fmtD(c.periodStart)} – {fmtD(c.periodEnd)} · self reviews due {fmtD(c.selfDue)} · manager reviews due {fmtD(c.managerDue)}
                </small>
              </span>
              <span className={`pill ${ST[c.status][1]}`}>{ST[c.status][0]}</span>
            </div>
            {c.status !== 'DRAFT' && (
              <>
                <div className="pf-progress">
                  <span className="ml-meter">
                    <span style={{ width: `${pct}%`, background: 'var(--brand)' }} />
                  </span>
                  <span className="ml-muted">
                    {pct}% complete · {c.selfPending} self review{c.selfPending === 1 ? '' : 's'} and {c.managerPending} manager review{c.managerPending === 1 ? '' : 's'} open
                  </span>
                </div>
              </>
            )}
            {canManage && (
              <div className="pf-acts">
                {c.status === 'DRAFT' && (
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => act.mutate({ fn: () => perfApi.launch(c.id), done: 'Cycle launched · everyone has been told' })}>
                      Launch cycle
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.confirm(`Delete ${c.name}?`) && act.mutate({ fn: () => perfApi.remove(c.id).then(() => setSel(null)), done: 'Cycle deleted' })}>
                      Delete
                    </button>
                  </>
                )}
                {c.status === 'ACTIVE' && (
                  <>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!(c.selfPending + c.managerPending)} onClick={() => act.mutate({ fn: () => perfApi.remind(c.id), done: 'Reminders sent' })}>
                      Remind pending
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.confirm(`Close ${c.name}? People will see their manager's feedback and rating.`) && act.mutate({ fn: () => perfApi.close(c.id), done: 'Cycle closed · results shared' })}>
                      Close cycle
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="py-run pf-dist">
            <span className="py-sec">Rating distribution</span>
            {c.distribution.map((d) => (
              <div key={d.value} className="pf-bar">
                <span>{d.label}</span>
                <span className="ml-meter">
                  <span style={{ width: `${(d.n / max) * 100}%`, background: RATE_C[d.value - 1] }} />
                </span>
                <b>{d.n}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {c && c.status !== 'DRAFT' && (
        <>
          <div className="au-chips">
            {(
              [
                ['ALL', `All · ${c.total}`],
                ['SELF', `Self pending · ${c.selfPending}`],
                ['MANAGER', `Manager pending · ${c.rows.filter((r) => r.selfDone && !r.managerDone).length}`],
                ['DONE', `Completed · ${c.done}`],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="py-table">
            <div className="py-row pf-row py-head">
              <span>Employee</span>
              <span>Reviewer</span>
              <span>Self review</span>
              <span>Manager review</span>
              <span>Rating</span>
            </div>
            {rows.map((r) => (
              <button key={r.id} type="button" className="py-row pf-row py-btn" onClick={() => setOpen(r.id)}>
                <span className="py-emp">
                  <b>{r.employee.name}</b>
                  <small>{r.employee.title || r.employee.department}</small>
                </span>
                <span>{r.reviewerIsMe ? 'You' : (r.reviewer ?? <span className="po-warn">No manager</span>)}</span>
                <span>
                  <span className={`pill ${r.selfDone ? 'pill-ok' : 'pill-warn'}`}>{r.selfDone ? 'submitted' : 'pending'}</span>
                </span>
                <span>
                  <span className={`pill ${r.managerDone ? 'pill-ok' : r.selfDone ? 'pill-warn' : 'pill-muted'}`}>{r.managerDone ? 'submitted' : r.selfDone ? 'pending' : 'not started'}</span>
                </span>
                <span>{r.rating ? <b style={{ color: RATE_C[(r.finalRating ?? r.managerRating ?? 3) - 1] }}>{r.rating}</b> : '—'}</span>
              </button>
            ))}
            {!rows.length && <div className="ml-empty">{c.rows.length ? 'Nobody in this filter' : canManage ? 'No reviews in this cycle' : 'Nobody in this cycle reports to you'}</div>}
          </div>
        </>
      )}
      {c?.status === 'DRAFT' && <div className="ml-empty mo-card">Launch the cycle to open a review for everyone active, with their manager as reviewer.</div>}

      {open && <ReviewDrawer id={open} onClose={() => setOpen(null)} onToast={setToast} />}
      {creating && <NewCycle onClose={() => setCreating(false)} onDone={(id) => (setCreating(false), setSel(id), qc.invalidateQueries({ queryKey: ['perf'] }), setToast('Cycle created · launch it when ready'))} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function NewCycle({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const y = new Date().getFullYear();
  const half = new Date().getMonth() >= 6;
  const [f, setF] = useState({
    name: `${half ? 'H1' : 'H2'} ${half ? y : y - 1} review`,
    periodStart: half ? `${y}-01-01` : `${y - 1}-07-01`,
    periodEnd: half ? `${y}-06-30` : `${y - 1}-12-31`,
    selfDue: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
    managerDue: new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10),
  });
  const [fe, setFe] = useState<Record<string, string>>({});
  const m = useMutation({ meta: { busy: 'Creating…' }, mutationFn: () => perfApi.create(f), onSuccess: (r) => onDone(r.id), onError: (e) => setFe({ ...fieldErrors(e), _: errorText(e) }) });
  const field = (k: keyof typeof f, label: string, type = 'date') => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input sm" type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={!!fe[k]} />
      {fe[k] && <span className="field-err">{fe[k]}</span>}
    </label>
  );
  return (
    <Modal
      width={520}
      title="New review cycle"
      sub="Nothing is sent until you launch it."
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={m.isPending} onClick={() => m.mutate()}>
            Create
          </button>
        </>
      }
    >
      {fe._ && !Object.keys(fe).some((k) => k !== '_') && <Alert>{fe._}</Alert>}
      {field('name', 'Name', 'text')}
      <div className="form-grid">
        {field('periodStart', 'Period from')}
        {field('periodEnd', 'Period to')}
        {field('selfDue', 'Self reviews due')}
        {field('managerDue', 'Manager reviews due')}
      </div>
    </Modal>
  );
}

function Stars({ value, onChange, labels, readOnly }: { value: number | null; onChange?: (v: number) => void; labels: string[]; readOnly?: boolean }) {
  return (
    <span className="pf-stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={labels[n - 1]}
          title={labels[n - 1]}
          disabled={readOnly}
          className={value != null && n <= value ? 'on' : undefined}
          onClick={() => onChange?.(n)}
        >
          ★
        </button>
      ))}
      <small>{value ? labels[value - 1] : readOnly ? 'Not rated' : 'Pick a rating'}</small>
    </span>
  );
}

function ReviewForm({ title, qs, answers, rating, labels, canEdit, onSave }: { title: string; qs: [string, string, string][]; answers: Record<string, string>; rating: number | null; labels: string[]; canEdit: boolean; onSave?: (a: Record<string, string>, r: number | null, submit: boolean) => void }) {
  const [a, setA] = useState(answers);
  const [r, setR] = useState(rating);
  useEffect(() => (setA(answers), setR(rating)), [answers, rating]);
  return (
    <section className="pf-form">
      <div className="py-sec">{title}</div>
      {qs.map(([k, q, hint]) => (
        <label key={k} className="field">
          <span className="field-label">{q}</span>
          {canEdit ? <textarea className="input" rows={3} value={a[k] ?? ''} onChange={(e) => setA({ ...a, [k]: e.target.value })} placeholder={hint} /> : <p className="pf-answer">{a[k] || <span className="ml-muted">—</span>}</p>}
        </label>
      ))}
      <div className="field">
        <span className="field-label">Rating</span>
        <Stars value={r} onChange={setR} labels={labels} readOnly={!canEdit} />
      </div>
      {canEdit && onSave && (
        <div className="pf-form-acts">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSave(a, r, false)}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.confirm('Submit? You can’t change it afterwards.') && onSave(a, r, true)}>
            Submit
          </button>
        </div>
      )}
    </section>
  );
}

export function ReviewBody({ r, onSaved }: { r: Review; onSaved: (r: Review, m: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [fin, setFin] = useState<number | null>(r.finalRating);
  const [note, setNote] = useState(r.finalNote ?? '');
  const save = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: (v: { who: 'self' | 'manager'; a: Record<string, string>; rt: number | null; submit: boolean }) => (v.who === 'self' ? perfApi.saveSelf : perfApi.saveManager)(r.id, { answers: v.a, rating: v.rt, submit: v.submit }),
    onSuccess: (x, v) => (setErr(null), onSaved(x, v.submit ? 'Submitted' : 'Draft saved')),
    onError: (e) => setErr(errorText(e)),
  });
  const cal = useMutation({ meta: { busy: 'Saving…' }, mutationFn: () => perfApi.calibrate(r.id, { rating: fin, note }), onSuccess: (x) => (setErr(null), onSaved(x, 'Final rating saved')), onError: (e) => setErr(errorText(e)) });
  const showManager = r.can.manager || r.managerSubmittedAt || Object.keys(r.managerAnswers).length > 0;
  return (
    <div className="pf-body">
      {err && <Alert>{err}</Alert>}
      <ReviewForm
        title={`Self review${r.selfSubmittedAt ? ` · submitted ${fmtD(r.selfSubmittedAt)}` : r.can.self ? ` · due ${fmtD(r.selfDue)}` : ' · not submitted yet'}`}
        qs={SELF_Q}
        answers={r.selfAnswers}
        rating={r.selfRating}
        labels={r.ratings}
        canEdit={r.can.self}
        onSave={(a, rt, submit) => save.mutate({ who: 'self', a, rt, submit })}
      />
      {showManager && (
        <ReviewForm
          title={`Manager review · ${r.reviewerName ?? 'no reviewer'}${r.managerSubmittedAt ? ` · submitted ${fmtD(r.managerSubmittedAt)}` : r.can.manager ? ` · due ${fmtD(r.managerDue)}` : ''}`}
          qs={MANAGER_Q}
          answers={r.managerAnswers}
          rating={r.managerRating}
          labels={r.ratings}
          canEdit={r.can.manager}
          onSave={(a, rt, submit) => save.mutate({ who: 'manager', a, rt, submit })}
        />
      )}
      {(r.can.calibrate || r.finalRating) && (
        <section className="pf-form">
          <div className="py-sec">Final rating {r.can.calibrate ? '(calibration)' : ''}</div>
          <Stars value={fin} onChange={setFin} labels={r.ratings} readOnly={!r.can.calibrate} />
          {r.can.calibrate ? (
            <>
              <input className="input sm" placeholder="Why it differs from the manager's rating (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="pf-form-acts">
                {fin != null && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFin(null)}>
                    Use the manager's rating
                  </button>
                )}
                <button type="button" className="btn btn-primary btn-sm" disabled={cal.isPending} onClick={() => cal.mutate()}>
                  Save final rating
                </button>
              </div>
            </>
          ) : (
            r.finalNote && <p className="pf-answer">{r.finalNote}</p>
          )}
        </section>
      )}
      <Goals employeeId={r.employeeId} goals={r.goals} canEdit />
    </div>
  );
}

function ReviewDrawer({ id, onClose, onToast }: { id: string; onClose: () => void; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['perf', 'review', id], queryFn: () => perfApi.review(id) });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="dm-prev-scrim" onClick={onClose}>
      <aside className="dm-prev py-drawer" role="dialog" aria-label="Review" onClick={(e) => e.stopPropagation()}>
        <header>
          <b>{q.data ? `${q.data.employeeName} · ${q.data.cycleName}` : 'Review'}</b>
          <button type="button" className="dfx-icon-btn" title="Close" onClick={onClose}>
            {Icon.close}
          </button>
        </header>
        <div className="dm-prev-body">
          {q.isLoading || !q.data ? (
            <BlockLoader label="Loading…" height={200} />
          ) : (
            <ReviewBody r={q.data} onSaved={(r, m) => (qc.setQueryData(['perf', 'review', id], r), qc.invalidateQueries({ queryKey: ['perf', 'cycle'] }), onToast(m))} />
          )}
        </div>
      </aside>
    </div>
  );
}

export function Goals({ employeeId, goals, canEdit }: { employeeId?: string; goals: Goal[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [list, setList] = useState(goals);
  const [adding, setAdding] = useState(false);
  const [t, setT] = useState('');
  const [due, setDue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setList(goals), [goals]);
  const m = useMutation({
    mutationFn: (fn: () => Promise<{ goals?: Goal[] } | void>) => fn(),
    onSuccess: (r) => {
      if (r && 'goals' in r && r.goals) setList(r.goals);
      qc.invalidateQueries({ queryKey: ['perf'] });
      setErr(null);
    },
    onError: (e) => setErr(errorText(e)),
  });
  return (
    <section className="pf-form">
      <div className="py-sec">Goals</div>
      {err && <Alert>{err}</Alert>}
      {list.map((g) => (
        <div key={g.id} className={`pf-goal${g.status !== 'ACTIVE' ? ' done' : ''}`}>
          <span className="pf-goal-t">
            <b>{g.title}</b>
            <small>
              {g.status === 'DONE' ? 'Done' : g.status === 'DROPPED' ? 'Dropped' : `${g.progress}%`}
              {g.dueDate ? ` · due ${fmtD(g.dueDate)}` : ''}
            </small>
          </span>
          {canEdit && g.status === 'ACTIVE' ? (
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={g.progress}
              aria-label={`${g.title} progress`}
              onChange={(e) => setList((x) => x.map((y) => (y.id === g.id ? { ...y, progress: Number(e.target.value) } : y)))}
              onMouseUp={(e) => m.mutate(() => perfApi.updateGoal(g.id, { ...g, progress: Number((e.target as HTMLInputElement).value) }))}
              onKeyUp={(e) => m.mutate(() => perfApi.updateGoal(g.id, { ...g, progress: Number((e.target as HTMLInputElement).value) }))}
            />
          ) : (
            <span className="ml-meter" style={{ width: 120 }}>
              <span style={{ width: `${g.progress}%`, background: 'var(--success, #16A34A)' }} />
            </span>
          )}
          {canEdit && (
            <button type="button" className="dfx-icon-btn" title="Delete goal" onClick={() => m.mutate(() => perfApi.deleteGoal(g.id).then(() => setList((x) => x.filter((y) => y.id !== g.id))))}>
              {Icon.trash}
            </button>
          )}
        </div>
      ))}
      {!list.length && <span className="ml-muted">No goals yet</span>}
      {canEdit &&
        (adding ? (
          <div className="pf-goal-new">
            <input className="input sm" placeholder="e.g. Ship the attendance timesheets" value={t} autoFocus onChange={(e) => setT(e.target.value)} aria-label="Goal" />
            <input className="input sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            <button type="button" className="btn btn-primary btn-sm" disabled={!t.trim()} onClick={() => m.mutate(() => perfApi.addGoal({ employeeId, title: t.trim(), dueDate: due || null }).then((r) => (setT(''), setDue(''), setAdding(false), r)))}>
              Add
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="ep-link" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>
            + Add a goal
          </button>
        ))}
    </section>
  );
}
