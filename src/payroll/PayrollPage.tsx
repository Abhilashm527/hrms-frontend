import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { Modal } from '../leave/ui';
import { errorText, fieldErrors } from '../lib/http';
import { fyNow, inr, lakh, payApi, save, type Run, type SalaryRow, type Slip } from './api';

const STEPS = ['Calculate', 'Review changes', 'Approve', 'Disburse'];
const ST: Record<string, [string, string]> = { DRAFT: ['Draft', 'pill-muted'], REVIEWED: ['Reviewed', 'pill-info'], APPROVED: ['Approved', 'pill-warn'], PAID: ['Disbursed', 'pill-ok'] };
type Tab = 'employees' | 'statutory' | 'salaries' | 'annual' | 'settings';

function useToast() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    if (!t) return;
    const x = setTimeout(() => setT(null), 3200);
    return () => clearTimeout(x);
  }, [t]);
  return [t, setT] as const;
}

/** Payroll (HR / finance): the month's run, statutory dues, salaries, yearly statements and settings. */
export function PayrollPage() {
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'employees';
  const runs = useQuery({ queryKey: ['payroll', 'runs'], queryFn: payApi.runs });
  const [runId, setRunId] = useState<string | null>(sp.get('run'));
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useToast();
  const list = runs.data?.items ?? [];
  const current = runId ?? list[0]?.id ?? null;
  const run = useQuery({ queryKey: ['payroll', 'run', current], queryFn: () => payApi.run(current!), enabled: !!current });
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] });
  const act = useMutation({
    mutationFn: (v: { fn: () => Promise<unknown>; done: string }) => v.fn(),
    onSuccess: (_r, v) => (refresh(), setToast(v.done), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });

  if (runs.isLoading) return <BlockLoader page label="Loading payroll…" />;
  if (runs.isError || !runs.data) return <Alert>{errorText(runs.error)}</Alert>;
  const r = run.data;
  const go = (t: Tab) => setSp(t === 'employees' ? {} : { tab: t });
  const nextLabel = r?.status === 'DRAFT' ? 'Mark reviewed' : r?.status === 'REVIEWED' ? 'Approve payroll' : r?.status === 'APPROVED' ? `Disburse ${inr(r.totals.net)}` : '';
  const canNext = r && ((r.status === 'DRAFT' && r.can.review) || (r.status === 'REVIEWED' && r.can.approve) || (r.status === 'APPROVED' && r.can.disburse));

  return (
    <div className="py-page">
      <div className="ml-top">
        <span>
          <h1>Payroll</h1>
          <small>Monthly pay runs, statutory dues and payslips</small>
        </span>
        {list.length > 0 && (
          <select className="input sm py-sel" value={current ?? ''} onChange={(e) => setRunId(e.target.value)} aria-label="Pay run">
            {list.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label} · {ST[x.status][0]}
              </option>
            ))}
          </select>
        )}
        {runs.data.canRun && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            {Icon.plus} New pay run
          </button>
        )}
      </div>
      {err && <Alert>{err}</Alert>}

      {!current ? (
        <div className="py-empty">
          <b>No pay runs yet</b>
          <span>Add salaries under the Salaries tab, then start the first month's run.</span>
          {runs.data.canRun && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              Start a pay run
            </button>
          )}
        </div>
      ) : run.isLoading || !r ? (
        <BlockLoader label="Loading the run…" height={160} />
      ) : (
        <div className="py-run">
          <div className="py-run-head">
            <span>
              <b>{r.label} run</b>
              <small>
                pay date {new Date(r.payDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {r.slips.length} employee{r.slips.length === 1 ? '' : 's'}
              </small>
            </span>
            <span className={`pill ${ST[r.status][1]}`}>{r.status === 'PAID' && r.paidAt ? `Disbursed ${new Date(r.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ST[r.status][0]}</span>
            <span style={{ flex: 1 }} />
            {r.can.edit && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ fn: () => payApi.recalc(r.id), done: 'Recalculated' })}>
                Recalculate
              </button>
            )}
            {r.can.edit && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.confirm(`Delete the ${r.label} draft run?`) && act.mutate({ fn: () => payApi.remove(r.id).then(() => setRunId(null)), done: 'Draft run deleted' })}>
                Delete draft
              </button>
            )}
            {r.can.reopen && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ fn: () => payApi.reopen(r.id), done: 'Back to draft' })}>
                Reopen
              </button>
            )}
            {canNext && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={act.isPending}
                onClick={() => (r.status !== 'APPROVED' || window.confirm(`Disburse ${inr(r.totals.net)} to ${r.slips.length} people? Payslips become visible to them.`)) && act.mutate({ fn: () => payApi.advance(r.id), done: r.status === 'APPROVED' ? 'Disbursed · payslips sent' : r.status === 'REVIEWED' ? 'Payroll approved' : 'Marked reviewed' })}
              >
                {nextLabel}
              </button>
            )}
          </div>
          <div className="py-steps">
            {STEPS.map((l, i) => {
              const done = i < r.step + 1;
              const cur = i === r.step + 1;
              return (
                <div key={l} className={`py-step${done ? ' done' : ''}${cur ? ' cur' : ''}`}>
                  <span>{done ? '✓' : i + 1}</span>
                  <b>{l}</b>
                </div>
              );
            })}
          </div>
          <div className="py-tiles">
            {(
              [
                ['Gross pay', r.totals.gross],
                ['Deductions', r.totals.deductions],
                ['Net pay', r.totals.net],
                ['Employer PF + ESI', r.totals.employerPf + r.totals.employerEsi],
                ['Cost to company', r.totals.gross + r.totals.employerPf + r.totals.employerEsi],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <b>{inr(v)}</b>
              </div>
            ))}
          </div>
          {(r.flagged > 0 || r.noSalary.length > 0) && r.status !== 'PAID' && (
            <div className="py-review">
              <b>To review</b>
              {r.flagged > 0 && (
                <span>
                  {r.flagged} payslip{r.flagged > 1 ? 's have' : ' has'} something to check (marked below)
                </span>
              )}
              {r.noSalary.length > 0 && (
                <span>
                  Not included, no salary set: {r.noSalary.slice(0, 6).map((x) => x.name).join(', ')}
                  {r.noSalary.length > 6 ? ` and ${r.noSalary.length - 6} more` : ''} ·{' '}
                  <button type="button" className="ep-link" onClick={() => go('salaries')}>
                    Set salaries
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="dfx-tabbar" role="tablist">
        {(
          [
            ['employees', 'Employees'],
            ['statutory', 'Statutory'],
            ['salaries', 'Salaries'],
            ['annual', 'Tax statements'],
            ['settings', 'Settings'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => go(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'employees' && r && <Employees r={r} onToast={setToast} />}
      {tab === 'statutory' && r && <StatutoryTab r={r} onError={(e) => setErr(errorText(e))} />}
      {tab === 'salaries' && <Salaries onToast={setToast} />}
      {tab === 'annual' && <AnnualTab onError={(e) => setErr(errorText(e))} />}
      {tab === 'settings' && <SettingsTab onToast={setToast} />}
      {(tab === 'employees' || tab === 'statutory') && !current && <div className="ml-empty">Start a pay run to see payslips and statutory dues.</div>}

      {creating && <NewRun suggested={runs.data.suggested} onClose={() => setCreating(false)} onDone={(id) => (setCreating(false), setRunId(id), refresh(), setToast('Pay run created'))} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function NewRun({ suggested, onClose, onDone }: { suggested: string; onClose: () => void; onDone: (id: string) => void }) {
  const [month, setMonth] = useState(suggested.slice(0, 7));
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ meta: { busy: 'Calculating payslips…' }, mutationFn: () => payApi.create(month), onSuccess: (r) => onDone(r.id), onError: (e) => setErr(fieldErrors(e).month ?? errorText(e)) });
  return (
    <Modal
      width={420}
      title="New pay run"
      sub="Works out a payslip for everyone with a salary who worked that month."
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={m.isPending || !month} onClick={() => m.mutate()}>
            Calculate
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <label className="field">
        <span className="field-label">Month</span>
        <input className="input sm" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>
    </Modal>
  );
}

function Employees({ r, onToast }: { r: Run; onToast: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [only, setOnly] = useState(false);
  const rows = r.slips.filter((s) => (!only || s.flags.length) && (!q || `${s.employee.name} ${s.employee.code} ${s.employee.department}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="py-tools">
        <label className="search-in" style={{ margin: 0, minWidth: 220 }}>
          {Icon.search}
          <input placeholder="search employees…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search employees" />
        </label>
        {r.flagged > 0 && (
          <label className="po-check">
            <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
            Only ones to check ({r.flagged})
          </label>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void payApi.exportFile(r.id, 'register').then((b) => save(b, `payroll-register-${r.period.slice(0, 7)}.csv`))}>
          {Icon.download} Payroll register
        </button>
      </div>
      <div className="py-table">
        <div className="py-row py-head">
          <span>Employee</span>
          <span>Paid days</span>
          <span>Gross</span>
          <span>PF</span>
          <span>ESI</span>
          <span>PT</span>
          <span>TDS</span>
          <span>Net pay</span>
        </div>
        {rows.map((s) => (
          <button key={s.id} type="button" className="py-row py-btn" onClick={() => setOpen(s.id)}>
            <span className="py-emp">
              <b>{s.employee.name}</b>
              <small>
                {s.employee.title || s.employee.department}
                {s.flags.length > 0 && <span className="py-flag"> · {s.flags[0]}{s.flags.length > 1 ? ` +${s.flags.length - 1}` : ''}</span>}
              </small>
            </span>
            <span>
              {Number(s.paidDays)}/{s.daysInMonth}
            </span>
            <span>{inr(s.gross)}</span>
            <span>{inr(s.pf)}</span>
            <span>{inr(s.esi)}</span>
            <span>{inr(s.pt)}</span>
            <span>{inr(s.tds)}</span>
            <span>
              <b>{inr(s.net)}</b>
            </span>
          </button>
        ))}
        {!rows.length && <div className="ml-empty">{r.slips.length ? 'Nobody matches' : 'No payslips in this run'}</div>}
      </div>
      {open && <SlipDrawer id={open} editable={r.can.edit} onClose={() => setOpen(null)} onToast={onToast} />}
    </>
  );
}

export function SlipView({ s }: { s: Slip }) {
  const ded = s.deductions.filter((d) => Number(d.amount) > 0);
  return (
    <div className="py-slip">
      <div className="py-slip-meta">
        {(
          [
            ['Paid days', `${Number(s.paidDays)} of ${s.daysInMonth}`],
            ['Loss of pay', `${Number(s.lopDays) + Number(s.extraLop)} day(s)`],
            ['PAN', s.pan ?? '—'],
            ['UAN', s.uan ?? '—'],
            ['Bank', s.bank ?? '—'],
            ['Tax regime', s.regime === 'OLD' ? 'Old' : 'New'],
          ] as const
        ).map(([k, v]) => (
          <span key={k}>
            <small>{k}</small>
            <b>{v}</b>
          </span>
        ))}
      </div>
      <div className="py-slip-cols">
        <div>
          <div className="py-sec">Earnings</div>
          {s.earnings.map((l, i) => (
            <div key={i} className="py-line">
              <span>{l.label}</span>
              <span>{inr(l.amount)}</span>
            </div>
          ))}
          <div className="py-line py-total">
            <span>Gross</span>
            <span>{inr(s.gross)}</span>
          </div>
        </div>
        <div>
          <div className="py-sec">Deductions</div>
          {ded.map((l, i) => (
            <div key={i} className="py-line">
              <span>{l.label}</span>
              <span>{inr(l.amount)}</span>
            </div>
          ))}
          {!ded.length && <div className="py-line ml-muted">None</div>}
          <div className="py-line py-total">
            <span>Total deductions</span>
            <span>{inr(s.totalDeductions)}</span>
          </div>
        </div>
      </div>
      <div className="py-net">
        <span>Net pay</span>
        <b>{inr(s.net)}</b>
      </div>
      {s.employer.some((l) => Number(l.amount) > 0) && (
        <span className="ml-muted">Paid by the company on top: {s.employer.filter((l) => Number(l.amount) > 0).map((l) => `${l.label} ${inr(l.amount)}`).join(' · ')}</span>
      )}
    </div>
  );
}

function SlipDrawer({ id, editable, onClose, onToast }: { id: string; editable: boolean; onClose: () => void; onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['payroll', 'slip', id], queryFn: () => payApi.slip(id) });
  const [adj, setAdj] = useState<Slip['adjustments']>([]);
  const [lop, setLop] = useState('0');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) {
      setAdj(q.data.adjustments.map((a) => ({ ...a })));
      setLop(String(Number(q.data.extraLop)));
    }
  }, [q.data]);
  const m = useMutation({
    meta: { busy: 'Recalculating…' },
    mutationFn: () => payApi.adjust(id, { adjustments: adj.map((a) => ({ ...a, amount: Number(a.amount) })), extraLop: Number(lop) || 0 }),
    onSuccess: (s) => (qc.setQueryData(['payroll', 'slip', id], s), qc.invalidateQueries({ queryKey: ['payroll', 'run'] }), onToast('Payslip updated'), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const s = q.data;
  return (
    <div className="dm-prev-scrim" onClick={onClose}>
      <aside className="dm-prev py-drawer" role="dialog" aria-label="Payslip" onClick={(e) => e.stopPropagation()}>
        <header>
          <b>{s ? `${s.employee.name} · ${s.label}` : 'Payslip'}</b>
          <button type="button" className="dfx-icon-btn" title="Close" onClick={onClose}>
            {Icon.close}
          </button>
        </header>
        <div className="dm-prev-body">
          {!s ? (
            <BlockLoader label="Loading…" height={200} />
          ) : (
            <>
              {s.flags.length > 0 && (
                <div className="py-review">
                  {s.flags.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </div>
              )}
              <SlipView s={s} />
              {editable && (
                <section className="py-adj">
                  <div className="py-sec">One-off changes this month</div>
                  {err && <Alert>{err}</Alert>}
                  {adj.map((a, i) => (
                    <div key={i} className="py-adj-row">
                      <input className="input sm" placeholder="e.g. Diwali bonus" value={a.label} onChange={(e) => setAdj((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} aria-label="Label" />
                      <select className="input sm" value={a.kind} onChange={(e) => setAdj((x) => x.map((y, j) => (j === i ? { ...y, kind: e.target.value as 'EARNING' | 'DEDUCTION' } : y)))} aria-label="Kind">
                        <option value="EARNING">Earning</option>
                        <option value="DEDUCTION">Deduction</option>
                      </select>
                      <input className="input sm" inputMode="numeric" placeholder="₹" value={a.amount || ''} onChange={(e) => setAdj((x) => x.map((y, j) => (j === i ? { ...y, amount: Number(e.target.value.replace(/[^0-9]/g, '')) } : y)))} aria-label="Amount" />
                      <button type="button" className="dfx-icon-btn" title="Remove" onClick={() => setAdj((x) => x.filter((_, j) => j !== i))}>
                        {Icon.trash}
                      </button>
                    </div>
                  ))}
                  <button type="button" className="ep-link" style={{ alignSelf: 'flex-start' }} onClick={() => setAdj((x) => [...x, { label: '', amount: 0, kind: 'EARNING' }])}>
                    + Add an earning or deduction
                  </button>
                  <label className="field" style={{ maxWidth: 220 }}>
                    <span className="field-label">Extra loss-of-pay days</span>
                    <input className="input sm" inputMode="decimal" value={lop} onChange={(e) => setLop(e.target.value.replace(/[^0-9.]/g, ''))} />
                    <span className="field-hint">On top of {Number(s.lopDays)} day(s) of unpaid leave</span>
                  </label>
                </section>
              )}
            </>
          )}
        </div>
        <footer>
          {s && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void payApi.slipPdf(s.id).then((b) => save(b, `payslip-${s.employee.code}-${s.period.slice(0, 7)}.pdf`))}>
              {Icon.download} PDF
            </button>
          )}
          <span style={{ flex: 1 }} />
          {editable && s && (
            <button type="button" className="btn btn-primary btn-sm" disabled={m.isPending} onClick={() => m.mutate()}>
              Save & recalculate
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

function StatutoryTab({ r, onError }: { r: Run; onError: (e: unknown) => void }) {
  const q = useQuery({ queryKey: ['payroll', 'statutory', r.id, r.status], queryFn: () => payApi.statutory(r.id) });
  if (q.isLoading) return <BlockLoader label="Loading…" height={160} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  return (
    <div className="py-cards">
      {q.data.cards.map((c) => (
        <div key={c.code} className="py-card">
          <div className="py-card-h">
            <span className="dfx-type-chip lv-type" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
              {c.code}
            </span>
            <b>{c.title}</b>
          </div>
          <span className="py-card-amt">{inr(c.amount)}</span>
          <div>
            {c.lines.map((l) => (
              <div key={l.k} className="py-line">
                <span>{l.k}</span>
                <span>{l.k.startsWith('Members') || l.k.startsWith('Covered') || l.k.startsWith('Employees with') ? l.v : inr(l.v)}</span>
              </div>
            ))}
            {!c.lines.length && <div className="py-line ml-muted">Nothing due</div>}
          </div>
          <div className="py-card-f">
            <span className="ml-muted">{c.due}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void payApi.exportFile(r.id, c.file).then((b) => save(b, `${c.file}-${r.period.slice(0, 7)}.csv`)).catch(onError)}>
              {Icon.download} {c.code} file
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Salaries({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['payroll', 'salaries'], queryFn: payApi.salaries });
  const [edit, setEdit] = useState<SalaryRow | null>(null);
  const [search, setSearch] = useState('');
  const rows = useMemo(() => (q.data?.items ?? []).filter((x) => !search || `${x.name} ${x.code} ${x.department ?? ''}`.toLowerCase().includes(search.toLowerCase())), [q.data, search]);
  if (q.isLoading) return <BlockLoader label="Loading salaries…" height={200} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const missing = q.data.items.filter((x) => x.ctcAnnual == null).length;
  return (
    <>
      <div className="py-tools">
        <label className="search-in" style={{ margin: 0, minWidth: 220 }}>
          {Icon.search}
          <input placeholder="search people…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" />
        </label>
        {missing > 0 && <span className="ml-muted">{missing} without a salary · they're left out of pay runs</span>}
      </div>
      <div className="py-table">
        <div className="py-row py-srow py-head">
          <span>Employee</span>
          <span>Annual CTC</span>
          <span>Monthly gross</span>
          <span>Regime</span>
          <span>PF</span>
          <span>PT state</span>
          <span>Details</span>
        </div>
        {rows.map((x) => (
          <button key={x.id} type="button" className="py-row py-srow py-btn" disabled={!q.data.canEdit} onClick={() => setEdit(x)}>
            <span className="py-emp">
              <b>{x.name}</b>
              <small>{[x.title, x.department].filter(Boolean).join(' · ')}</small>
            </span>
            <span>{x.ctcAnnual != null ? lakh(x.ctcAnnual) : x.profileCtc != null ? <span className="ml-muted">{lakh(x.profileCtc)} on profile</span> : <span className="po-warn">Not set</span>}</span>
            <span>{x.ctcAnnual != null ? inr(x.ctcAnnual / 12) : '—'}</span>
            <span>{x.regime === 'OLD' ? 'Old' : 'New'}</span>
            <span>{x.pfEnabled ? 'Yes' : 'No'}</span>
            <span>{x.ptState ?? '—'}</span>
            <span className="ml-muted">{!x.hasPan || !x.hasBank ? <span className="po-warn">{[!x.hasPan && 'no PAN', !x.hasBank && 'no bank'].filter(Boolean).join(', ')}</span> : 'Complete'}</span>
          </button>
        ))}
      </div>
      {edit && <SalaryDialog row={edit} onClose={() => setEdit(null)} onDone={() => (setEdit(null), qc.invalidateQueries({ queryKey: ['payroll'] }), onToast('Salary saved'))} />}
    </>
  );
}

function SalaryDialog({ row, onClose, onDone }: { row: SalaryRow; onClose: () => void; onDone: () => void }) {
  const start = row.ctcAnnual ?? row.profileCtc;
  const [ctc, setCtc] = useState(start ? String(Math.round(start)) : '');
  const [regime, setRegime] = useState(row.regime);
  const [pf, setPf] = useState(row.pfEnabled);
  const [eff, setEff] = useState(row.effectiveFrom ?? new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: () => payApi.saveSalary(row.id, { ctcAnnual: Number(ctc), regime, pfEnabled: pf, effectiveFrom: eff }),
    onSuccess: onDone,
    onError: (e) => setErr(fieldErrors(e).ctcAnnual ?? errorText(e)),
  });
  const n = Number(ctc) || 0;
  return (
    <Modal
      width={460}
      title={`Salary · ${row.name}`}
      sub="Used from the next pay run you calculate or recalculate."
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!n || m.isPending} onClick={() => m.mutate()}>
            Save
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <label className="field">
        <span className="field-label">Annual CTC (₹)</span>
        <input className="input sm" inputMode="numeric" value={ctc} onChange={(e) => setCtc(e.target.value.replace(/[^0-9]/g, ''))} autoFocus />
        <span className="field-hint">{n ? `${lakh(n)} a year · ${inr(n / 12)} a month gross` : 'e.g. 1200000 for 12 lakh'}</span>
      </label>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Tax regime</span>
          <select className="input sm" value={regime} onChange={(e) => setRegime(e.target.value as 'NEW' | 'OLD')}>
            <option value="NEW">New regime</option>
            <option value="OLD">Old regime (uses their declaration)</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Effective from</span>
          <input className="input sm" type="date" value={eff} onChange={(e) => setEff(e.target.value)} />
        </label>
      </div>
      <label className="po-check">
        <input type="checkbox" checked={pf} onChange={(e) => setPf(e.target.checked)} />
        Deduct provident fund
      </label>
    </Modal>
  );
}

function AnnualTab({ onError }: { onError: (e: unknown) => void }) {
  const [fy, setFy] = useState(fyNow());
  const q = useQuery({ queryKey: ['payroll', 'annual', fy], queryFn: () => payApi.annual(fy) });
  return (
    <>
      <div className="py-tools">
        <select className="input sm py-sel" value={fy} onChange={(e) => setFy(Number(e.target.value))} aria-label="Financial year">
          {[0, 1, 2].map((d) => (
            <option key={d} value={fyNow() - d}>
              FY {fyNow() - d}–{String(fyNow() - d + 1).slice(2)}
            </option>
          ))}
        </select>
        <span className="ml-muted">Pay and tax from disbursed runs, April to March. Statements are summaries, not Form 16 (that comes from TRACES).</span>
      </div>
      {q.isLoading ? (
        <BlockLoader label="Loading…" height={160} />
      ) : q.isError || !q.data ? (
        <Alert>{errorText(q.error)}</Alert>
      ) : (
        <div className="py-table">
          <div className="py-row py-arow py-head">
            <span>Employee</span>
            <span>PAN</span>
            <span>Months</span>
            <span>Gross</span>
            <span>TDS</span>
            <span />
          </div>
          {q.data.items.map((x) => (
            <div key={x.id} className="py-row py-arow">
              <span className="py-emp">
                <b>{x.name}</b>
                <small>{x.code}</small>
              </span>
              <span>{x.pan ?? <span className="po-warn">missing</span>}</span>
              <span>{x.months}</span>
              <span>{inr(x.gross)}</span>
              <span>{inr(x.tds)}</span>
              <span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void payApi.statement(fy, x.id).then((b) => save(b, `tax-statement-${x.code}-FY${fy}.pdf`)).catch(onError)}>
                  {Icon.download} Statement
                </button>
              </span>
            </div>
          ))}
          {!q.data.items.length && <div className="ml-empty">No disbursed pay runs in FY {q.data.fy}</div>}
        </div>
      )}
    </>
  );
}

function SettingsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['payroll', 'settings'], queryFn: payApi.settings });
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setF({ basicPct: String(q.data.basicPct), hraPctOfBasic: String(q.data.hraPctOfBasic), pfWageCap: String(q.data.pfWageCap), esiThreshold: String(q.data.esiThreshold), payDay: String(q.data.payDay) });
  }, [q.data]);
  const m = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: () => payApi.saveSettings(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)]))),
    onSuccess: (d) => (qc.setQueryData(['payroll', 'settings'], d), onToast('Payroll settings saved'), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  if (q.isLoading || !q.data) return <BlockLoader label="Loading…" height={160} />;
  const ro = !q.data.canEdit;
  const field = (k: string, label: string, hint: string) => (
    <label className="field" key={k}>
      <span className="field-label">{label}</span>
      <input className="input sm" inputMode="decimal" value={f[k] ?? ''} readOnly={ro} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^0-9.]/g, '') })} />
      <span className="field-hint">{hint}</span>
    </label>
  );
  return (
    <section className="po-card po-settings">
      {err && <Alert>{err}</Alert>}
      {ro && <Alert kind="info">Only people with full payroll access can change these.</Alert>}
      <div className="form-grid">
        {field('basicPct', 'Basic (% of monthly gross)', 'Usually 40–50%')}
        {field('hraPctOfBasic', 'HRA (% of Basic)', '50% in metros, 40% elsewhere')}
        {field('pfWageCap', 'PF wage ceiling (₹)', 'PF is 12% of Basic up to this')}
        {field('esiThreshold', 'ESI gross limit (₹)', 'ESI applies at or below this gross')}
        {field('payDay', 'Pay day of the month', 'Last day if the month is shorter')}
      </div>
      <span className="ml-muted">
        PF {q.data.pfRate}% · ESI {q.data.esiEmployeeRate}% employee and {q.data.esiEmployerRate}% employer · professional tax by each person's work-location state · income tax is estimated from CTC and the chosen regime.
      </span>
      {!ro && (
        <div>
          <button type="button" className="btn btn-primary btn-sm" disabled={m.isPending} onClick={() => m.mutate()}>
            Save settings
          </button>
        </div>
      )}
    </section>
  );
}
