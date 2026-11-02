import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { Field, Grid, Kpi, Modal, Row } from '../leave/ui';
import { blob, errorText, fieldErrors } from '../lib/http';
import { HIRE_PREFILL } from '../onboarding/NewHireDrawer';
import { PersonPicker, useDepartments, useLocations } from '../onboarding/shared';
import type { Person } from '../onboarding/api';
import { SOURCES, STAGES, STAGE_C, STAGE_L, ago, fmtWhen, lakh, recApi, recL, type Candidate, type Job, type Stage } from './api';

type Tab = 'overview' | 'jobs' | 'pipeline' | 'interviews' | 'offers';
const JOB_ST: Record<string, [string, string]> = { DRAFT: ['Draft', 'pill-muted'], OPEN: ['Open', 'pill-ok'], ON_HOLD: ['On hold', 'pill-warn'], CLOSED: ['Closed', 'pill-muted'] };
const OFFER_ST: Record<string, [string, string]> = { SENT: ['Awaiting answer', 'pill-warn'], ACCEPTED: ['Accepted', 'pill-ok'], DECLINED: ['Declined', 'pill-danger'], WITHDRAWN: ['Withdrawn', 'pill-muted'] };

function useToast() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    if (!t) return;
    const x = setTimeout(() => setT(null), 3200);
    return () => clearTimeout(x);
  }, [t]);
  return [t, setT] as const;
}

export async function openResume(candidateId: string) {
  const b = await blob(recApi.resumeUrl(candidateId));
  const url = URL.createObjectURL(b);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Recruiting: openings, the candidate pipeline, interviews and offers. */
export function RecruitingPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const cand = sp.get('candidate');
  const setParam = (k: string, v: string | null) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: k === 'candidate' && !v },
    );
  const [jobFilter, setJobFilter] = useState('');
  const [editJob, setEditJob] = useState<Job | 'new' | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useToast();
  const jobs = useQuery({ queryKey: ['rec', 'jobs'], queryFn: recApi.jobs });

  if (jobs.isLoading) return <BlockLoader page label="Loading recruiting…" />;
  if (jobs.isError || !jobs.data) return <Alert>{errorText(jobs.error)}</Alert>;
  const canEdit = jobs.data.canEdit;
  const open = jobs.data.items.filter((j) => j.status === 'OPEN');
  const tabs: [Tab, string, number?][] = [
    ['overview', 'Overview'],
    ['jobs', 'Jobs', open.length],
    ['pipeline', 'Pipeline'],
    ['interviews', 'Interviews'],
    ['offers', 'Offers'],
  ];

  return (
    <div className="py-page">
      <div className="ml-top">
        <span>
          <h1>Recruiting</h1>
          <small>Openings, candidates, interviews and offers</small>
        </span>
        {canEdit && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)} disabled={!open.length} title={open.length ? undefined : 'Open a job first'}>
              {Icon.userPlus} Add candidate
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditJob('new')}>
              {Icon.plus} New job
            </button>
          </>
        )}
      </div>
      <div className="dfx-tabbar" role="tablist">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => setParam('tab', k === 'overview' ? null : k)}>
            {l}
            {n ? <span className="dfx-count">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab openCandidate={(id) => setParam('candidate', id)} jobs={jobs.data.items} goJobs={() => setParam('tab', 'jobs')} />}
      {tab === 'jobs' && (
        <JobsTab
          jobs={jobs.data.items}
          canEdit={canEdit}
          onEdit={setEditJob}
          onPipeline={(id) => {
            setJobFilter(id);
            setParam('tab', 'pipeline');
          }}
        />
      )}
      {tab === 'pipeline' && <PipelineTab jobs={jobs.data.items} jobId={jobFilter} setJobId={setJobFilter} openCandidate={(id) => setParam('candidate', id)} />}
      {tab === 'interviews' && <InterviewsTab openCandidate={(id) => setParam('candidate', id)} />}
      {tab === 'offers' && <OffersTab openCandidate={(id) => setParam('candidate', id)} canEdit={canEdit} toast={setToast} />}

      {editJob && <JobDialog job={editJob === 'new' ? null : editJob} onClose={() => setEditJob(null)} onSaved={(m) => (setEditJob(null), setToast(m))} />}
      {adding && (
        <AddCandidate
          jobs={open}
          defaultJob={jobFilter}
          onClose={() => setAdding(false)}
          onAdded={(c) => {
            setAdding(false);
            setToast(`${c.name} added`);
            setParam('candidate', c.id);
          }}
        />
      )}
      {cand && <CandidateDialog id={cand} onClose={() => setParam('candidate', null)} toast={setToast} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ overview

function OverviewTab({ openCandidate, jobs, goJobs }: { openCandidate: (id: string) => void; jobs: Job[]; goJobs: () => void }) {
  const q = useQuery({ queryKey: ['rec', 'overview'], queryFn: recApi.overview });
  if (q.isLoading) return <BlockLoader label="Loading…" height={200} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  const top = Math.max(1, d.funnel[0]?.n ?? 1);
  const srcMax = Math.max(1, ...d.sources.map((s) => s.n));
  const open = jobs.filter((j) => j.status === 'OPEN');
  return (
    <>
      <div className="lv-kpis six">
        <Kpi label="Open jobs" value={d.kpis.openJobs} sub={`${d.kpis.openings} opening${d.kpis.openings === 1 ? '' : 's'}`} />
        <Kpi label="Active candidates" value={d.kpis.active} sub="in the pipeline" />
        <Kpi label="Interviews" value={d.kpis.interviewsWeek} sub="next 7 days" />
        <Kpi label="Offers out" value={d.kpis.offersOut} sub="awaiting an answer" />
        <Kpi label="Hired" value={d.kpis.hired90} sub="last 90 days" />
      </div>
      <div className="rc-grid">
        <div className="py-run">
          <span className="py-sec">Hiring funnel · last 120 days</span>
          {d.funnel.map((f, i) => {
            const prev = i ? d.funnel[i - 1].n : 0;
            return (
              <div key={f.stage} className="rc-fun">
                <span>{STAGE_L[f.stage]}</span>
                <span className="ml-meter">
                  <span style={{ width: `${(f.n / top) * 100}%`, background: 'var(--brand)', opacity: 1 - i * 0.13 }} />
                </span>
                <b>{f.n}</b>
                <small>{i && prev ? `${Math.round((f.n / prev) * 100)}%` : ''}</small>
              </div>
            );
          })}
        </div>
        <div className="py-run">
          <span className="py-sec">Needs attention</span>
          {d.todo.length === 0 ? (
            <span className="ml-muted">Nothing waiting on you.</span>
          ) : (
            d.todo.map((t, i) => (
              <div key={i} className="rc-todo">
                <span>
                  <b>{t.text}</b>
                  <small>{t.sub}</small>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openCandidate(t.candidateId)}>
                  {t.action}
                </button>
              </div>
            ))
          )}
        </div>
        <div className="py-run">
          <span className="py-sec">Upcoming interviews</span>
          {d.upcoming.length === 0 ? (
            <span className="ml-muted">No interviews scheduled.</span>
          ) : (
            d.upcoming.map((x) => (
              <button key={x.id} type="button" className="rc-iv" onClick={() => openCandidate(x.candidate.id)}>
                <span className="rc-when">{fmtWhen(x.at)}</span>
                <span>
                  <b>{x.candidate.name}</b>
                  <small>
                    {x.round} · {x.job} · {x.panel || 'no panel'}
                  </small>
                </span>
                <span className="pill pill-muted">{x.mode}</span>
              </button>
            ))
          )}
        </div>
        <div className="py-run">
          <span className="py-sec">Where candidates come from</span>
          {d.sources.length === 0 ? (
            <span className="ml-muted">No candidates yet.</span>
          ) : (
            d.sources.map((s) => (
              <div key={s.source} className="pf-bar">
                <span>{s.source}</span>
                <span className="ml-meter">
                  <span style={{ width: `${(s.n / srcMax) * 100}%`, background: 'var(--brand)' }} />
                </span>
                <b>{s.n}</b>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="py-run">
        <div className="py-run-head">
          <span>
            <b>Open jobs</b>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={goJobs}>
            All jobs {Icon.chevR}
          </button>
        </div>
        {open.length === 0 ? (
          <span className="ml-muted">No open jobs.</span>
        ) : (
          <div className="rc-jobs">
            {open.slice(0, 6).map((j) => (
              <div key={j.id} className="rc-job">
                <b>{j.title}</b>
                <small>
                  {j.code} · {j.department ?? 'No department'} · opened {ago(j.createdAt)}
                </small>
                <StageStrip s={j.stages} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StageStrip({ s }: { s: Record<Stage, number> }) {
  return (
    <span className="rc-strip">
      {STAGES.map((k) => (
        <span key={k} title={STAGE_L[k]}>
          <b>{s[k] ?? 0}</b>
          <small>{STAGE_L[k]}</small>
        </span>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ jobs

function JobsTab({ jobs, canEdit, onEdit, onPipeline }: { jobs: Job[]; canEdit: boolean; onEdit: (j: Job) => void; onPipeline: (id: string) => void }) {
  const [st, setSt] = useState('OPEN');
  const rows = jobs.filter((j) => !st || j.status === st);
  const cols = 'minmax(220px,2fr) 120px 90px minmax(280px,2fr) 110px 140px';
  return (
    <>
      <div className="rc-filters">
        <select className="input sm" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(JOB_ST).map(([k, [l]]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <span className="ml-muted">
          {rows.length} job{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      <Grid cols={cols} minWidth={960} head={['Job', 'Budget', 'Openings', 'Pipeline', 'Status', '']} empty={!rows.length && <div className="card-empty">No jobs here.</div>}>
        {rows.map((j) => (
          <Row key={j.id} cols={cols}>
            <span className="rc-cell">
              <b>{j.title}</b>
              <small>
                {j.code} · {[j.department, j.location].filter(Boolean).join(' · ') || '—'}
                {j.hiringManager ? ` · HM ${j.hiringManager}` : ''}
              </small>
            </span>
            <span>{j.budgetMin || j.budgetMax ? `${lakh(j.budgetMin)}–${lakh(j.budgetMax).replace('₹', '')}` : '—'}</span>
            <span>
              {j.stages.HIRED}/{j.openings}
            </span>
            <StageStrip s={j.stages} />
            <span>
              <span className={`pill ${JOB_ST[j.status][1]}`}>{JOB_ST[j.status][0]}</span>
            </span>
            <span className="rc-acts">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPipeline(j.id)}>
                Pipeline
              </button>
              {canEdit && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(j)}>
                  Edit
                </button>
              )}
            </span>
          </Row>
        ))}
      </Grid>
    </>
  );
}

function JobDialog({ job, onClose, onSaved }: { job: Job | null; onClose: () => void; onSaved: (m: string) => void }) {
  const qc = useQueryClient();
  const depts = useDepartments();
  const locs = useLocations();
  const [f, setF] = useState<Record<string, string>>(() => ({
    title: job?.title ?? '',
    departmentId: job?.departmentId ?? '',
    locationId: job?.locationId ?? '',
    openings: String(job?.openings ?? 1),
    experience: job?.experience ?? '',
    budgetMin: job?.budgetMin != null ? String(job.budgetMin) : '',
    budgetMax: job?.budgetMax != null ? String(job.budgetMax) : '',
    targetDate: job?.targetDate ?? '',
    description: job?.description ?? '',
    skills: job?.skills ?? '',
    status: job?.status ?? 'OPEN',
  }));
  const [hm, setHm] = useState<Person | null>(job?.hiringManagerId ? { id: job.hiringManagerId, name: job.hiringManager ?? '' } : null);
  const [rc, setRc] = useState<Person | null>(job?.recruiterId ? { id: job.recruiterId, name: job.recruiter ?? '' } : null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => (setF((o) => ({ ...o, [k]: v })), setErrs((e) => ({ ...e, [k]: '' })));
  const save = useMutation({
    mutationFn: () => recApi.saveJob(job?.id ?? null, { ...f, hiringManagerId: hm?.id ?? null, recruiterId: rc?.id ?? null }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['rec'] }), onSaved(job ? 'Job saved' : 'Job created')),
    onError: (e) => (setErrs(fieldErrors(e)), setErr(errorText(e))),
  });
  return (
    <Modal
      title={job ? `Edit ${job.code}` : 'New job'}
      sub={job ? job.title : 'Open a position to start collecting candidates'}
      onClose={onClose}
      width={640}
      foot={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : job ? 'Save' : 'Create job'}
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="rc-form">
        <Field label="Job title" error={errs.title}>
          <input className="input sm" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Senior Backend Engineer" autoFocus />
        </Field>
        <Field label="Status">
          <select className="input sm" value={f.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(JOB_ST).map(([k, [l]]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select className="input sm" value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
            <option value="">—</option>
            {depts.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <select className="input sm" value={f.locationId} onChange={(e) => set('locationId', e.target.value)}>
            <option value="">—</option>
            {locs.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Openings">
          <input className="input sm" type="number" min={1} value={f.openings} onChange={(e) => set('openings', e.target.value)} />
        </Field>
        <Field label="Experience">
          <input className="input sm" value={f.experience} onChange={(e) => set('experience', e.target.value)} placeholder="e.g. 3–5 years" />
        </Field>
        <Field label="Budget from (₹ lakh / yr)">
          <input className="input sm" type="number" step="0.1" value={f.budgetMin} onChange={(e) => set('budgetMin', e.target.value)} />
        </Field>
        <Field label="Budget to (₹ lakh / yr)" error={errs.budgetMax}>
          <input className="input sm" type="number" step="0.1" value={f.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} />
        </Field>
        <Field label="Hiring manager">
          <PersonPicker value={hm} onChange={setHm} />
        </Field>
        <Field label="Recruiter">
          <PersonPicker value={rc} onChange={setRc} />
        </Field>
        <Field label="Fill by">
          <input className="input sm" type="date" value={f.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
        </Field>
        <Field label="Key skills">
          <input className="input sm" value={f.skills} onChange={(e) => set('skills', e.target.value)} placeholder="Java, Spring, Postgres" />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input" rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ pipeline

function PipelineTab({ jobs, jobId, setJobId, openCandidate }: { jobs: Job[]; jobId: string; setJobId: (s: string) => void; openCandidate: (id: string) => void }) {
  const q = useQuery({ queryKey: ['rec', 'pipeline', jobId], queryFn: () => recApi.pipeline(jobId || undefined) });
  const [showRejected, setShowRejected] = useState(false);
  const [text, setText] = useState('');
  const items = useMemo(() => (q.data?.items ?? []).filter((c) => !text || `${c.name} ${c.company ?? ''} ${c.title ?? ''}`.toLowerCase().includes(text.toLowerCase())), [q.data, text]);
  const cols: Stage[] = showRejected ? [...STAGES, 'REJECTED'] : STAGES;
  return (
    <>
      <div className="rc-filters">
        <select className="input sm" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title} · {j.code}
              {j.status !== 'OPEN' ? ` (${JOB_ST[j.status][0].toLowerCase()})` : ''}
            </option>
          ))}
        </select>
        <input className="input sm" placeholder="Find a candidate…" value={text} onChange={(e) => setText(e.target.value)} style={{ maxWidth: 220 }} />
        <label className="ml-muted rc-check">
          <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Show rejected
        </label>
      </div>
      {q.isLoading ? (
        <BlockLoader label="Loading candidates…" height={200} />
      ) : q.isError ? (
        <Alert>{errorText(q.error)}</Alert>
      ) : (
        <div className="rc-board" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(200px, 1fr))` }}>
          {cols.map((s) => {
            const list = items.filter((c) => c.stage === s);
            return (
              <div key={s} className="rc-col">
                <div className="rc-col-head">
                  <b>{STAGE_L[s]}</b>
                  <span className="dfx-count">{list.length}</span>
                </div>
                {list.length === 0 && <span className="rc-none">No one</span>}
                {list.map((c) => (
                  <button key={c.id} type="button" className="rc-card" onClick={() => openCandidate(c.id)}>
                    <b>{c.name}</b>
                    <small>{[c.title, c.company].filter(Boolean).join(' at ') || c.source}</small>
                    {!jobId && <small className="rc-jobname">{c.job.title}</small>}
                    <span className="rc-meta">
                      {c.experience != null && <span>{c.experience} yrs</span>}
                      {c.score != null && <span>★ {c.score}</span>}
                      {c.nextInterview && <span>{fmtWhen(c.nextInterview)}</span>}
                      <span>{ago(c.since)}</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function AddCandidate({ jobs, defaultJob, onClose, onAdded }: { jobs: Job[]; defaultJob: string; onClose: () => void; onAdded: (c: Candidate) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>({ jobId: jobs.some((j) => j.id === defaultJob) ? defaultJob : (jobs[0]?.id ?? ''), source: 'Careers page' });
  const [ref, setRef] = useState<Person | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => (setF((o) => ({ ...o, [k]: v })), setErrs((e) => ({ ...e, [k]: '' })));
  const add = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => v && fd.append(k, v));
      if (ref) fd.append('referredBy', ref.id);
      if (file) fd.append('resume', file);
      return recApi.add(fd);
    },
    onSuccess: (c) => (qc.invalidateQueries({ queryKey: ['rec'] }), onAdded(c)),
    onError: (e) => (setErrs(fieldErrors(e)), setErr(errorText(e))),
  });
  return (
    <Modal
      title="Add candidate"
      onClose={onClose}
      width={620}
      foot={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? 'Adding…' : 'Add candidate'}
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="rc-form">
        <Field label="Job" error={errs.jobId}>
          <select className="input sm" value={f.jobId} onChange={(e) => set('jobId', e.target.value)}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} · {j.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Full name" error={errs.name}>
          <input className="input sm" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Email" error={errs.email}>
          <input className="input sm" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input sm" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Source">
          <select className="input sm" value={f.source} onChange={(e) => set('source', e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        {f.source === 'Referral' ? (
          <Field label="Referred by">
            <PersonPicker value={ref} onChange={setRef} />
          </Field>
        ) : (
          <span />
        )}
        <Field label="Current company">
          <input className="input sm" value={f.company ?? ''} onChange={(e) => set('company', e.target.value)} />
        </Field>
        <Field label="Current title">
          <input className="input sm" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Experience (years)">
          <input className="input sm" type="number" step="0.5" value={f.experience ?? ''} onChange={(e) => set('experience', e.target.value)} />
        </Field>
        <Field label="Notice period (days)">
          <input className="input sm" type="number" value={f.noticeDays ?? ''} onChange={(e) => set('noticeDays', e.target.value)} />
        </Field>
        <Field label="Expected CTC (₹ lakh)">
          <input className="input sm" type="number" step="0.1" value={f.expectedCtc ?? ''} onChange={(e) => set('expectedCtc', e.target.value)} />
        </Field>
        <Field label="Résumé" hint="PDF or Word, up to 6 MB">
          <input className="input sm" type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="input" rows={3} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ candidate

function CandidateDialog({ id, onClose, toast }: { id: string; onClose: () => void; toast: (m: string) => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['rec', 'candidate', id], queryFn: () => recApi.candidate(id) });
  const [mode, setMode] = useState<'schedule' | 'offer' | 'reject' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (v: { fn: () => Promise<unknown>; done: string }) => v.fn(),
    onSuccess: (_r, v) => (qc.invalidateQueries({ queryKey: ['rec'] }), toast(v.done), setErr(null), setMode(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const c = q.data;
  const next = c && STAGES[STAGES.indexOf(c.stage) + 1];
  const startOnboarding = () => {
    if (!c) return;
    const [first, ...rest] = c.name.trim().split(/\s+/);
    const accepted = c.offers.find((o) => o.status === 'ACCEPTED');
    const values: Record<string, string> = { first, last: rest.join(' '), pemail: c.email ?? '', phone: c.phone ?? '', title: c.job.title, dept: c.job.departmentId, loc: c.job.locationId };
    if (accepted) {
      values.doj = accepted.joiningDate;
      values.ctc = String(accepted.ctc);
    }
    try {
      sessionStorage.setItem(HIRE_PREFILL, JSON.stringify({ values, mgr: c.job.hiringManagerId ? { id: c.job.hiringManagerId, name: c.job.hiringManager } : null }));
    } catch {
      /* private mode: the form opens empty */
    }
    nav('/onboarding?new=1');
  };

  return (
    <Modal
      title={c?.name ?? 'Candidate'}
      sub={c ? `${c.job.title} · ${c.source}${c.referredBy ? ` (by ${c.referredBy})` : ''} · added ${ago(c.createdAt)}` : undefined}
      onClose={onClose}
      width={760}
      foot={
        c?.canEdit ? (
          <>
            {c.stage !== 'HIRED' && c.stage !== 'REJECTED' && (
              <button type="button" className="btn btn-ghost btn-sm rc-danger" onClick={() => setMode('reject')}>
                Reject
              </button>
            )}
            {c.stage === 'REJECTED' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ fn: () => recApi.move(c.id, 'SCREENING'), done: 'Moved back to screening' })}>
                Reconsider
              </button>
            )}
            <span style={{ flex: 1 }} />
            {(c.stage === 'SCREENING' || c.stage === 'INTERVIEW') && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode('schedule')}>
                {Icon.cal} Schedule interview
              </button>
            )}
            {c.stage === 'INTERVIEW' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode('offer')}>
                Make offer
              </button>
            )}
            {c.stage === 'APPLIED' && next && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => act.mutate({ fn: () => recApi.move(c.id, 'SCREENING'), done: 'Moved to screening' })}>
                Move to screening
              </button>
            )}
            {c.stage === 'HIRED' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={startOnboarding}>
                {Icon.userPlus} Start onboarding
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {q.isLoading ? (
        <BlockLoader label="Loading…" height={160} />
      ) : !c ? (
        <Alert>{errorText(q.error)}</Alert>
      ) : (
        <>
          {err && <Alert>{err}</Alert>}
          <div className="rc-stages">
            {STAGES.map((s, i) => (
              <span key={s} className={c.stage === 'REJECTED' ? '' : STAGES.indexOf(c.stage) > i ? 'done' : c.stage === s ? 'cur' : ''}>
                {STAGE_L[s]}
              </span>
            ))}
            {c.stage === 'REJECTED' && <span className={`pill ${STAGE_C.REJECTED}`}>Rejected · {c.rejectedReason}</span>}
          </div>
          <div className="rc-facts">
            <Fact k="Email" v={c.email} />
            <Fact k="Phone" v={c.phone} />
            <Fact k="Currently" v={[c.title, c.company].filter(Boolean).join(' at ')} />
            <Fact k="Experience" v={c.experience != null ? `${c.experience} years` : null} />
            <Fact k="Notice" v={c.noticeDays != null ? `${c.noticeDays} days` : null} />
            <Fact k="Expected CTC" v={c.expectedCtc != null ? lakh(c.expectedCtc) : null} />
            <span className="rc-fact">
              <small>Résumé</small>
              <span className="rc-resume">
                {c.resumeName ? (
                  <button type="button" className="link-btn" onClick={() => openResume(c.id).catch((e) => setErr(errorText(e)))}>
                    {Icon.file} {c.resumeName}
                  </button>
                ) : (
                  <span className="ml-muted">None</span>
                )}
                {c.canEdit && (
                  <label className="link-btn">
                    {c.resumeName ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      hidden
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) act.mutate({ fn: () => recApi.uploadResume(c.id, f), done: 'Résumé uploaded' });
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </span>
            </span>
          </div>
          {c.notes && <p className="rc-notes">{c.notes}</p>}

          {mode === 'schedule' && <ScheduleForm c={c} busy={act.isPending} onCancel={() => setMode(null)} onSave={(b) => act.mutate({ fn: () => recApi.schedule(c.id, b), done: 'Interview scheduled · panel notified' })} />}
          {mode === 'offer' && <OfferForm c={c} busy={act.isPending} onCancel={() => setMode(null)} onSave={(b) => act.mutate({ fn: () => recApi.offer(c.id, b), done: 'Offer recorded' })} />}
          {mode === 'reject' && <RejectForm busy={act.isPending} onCancel={() => setMode(null)} onSave={(r) => act.mutate({ fn: () => recApi.move(c.id, 'REJECTED', r), done: `${c.name} rejected` })} />}

          {c.offers.length > 0 && (
            <div className="rc-sec">
              <span className="py-sec">Offers</span>
              {c.offers.map((o) => (
                <div key={o.id} className="rc-offer">
                  <span>
                    <b>{lakh(o.ctc)} a year</b>
                    <small>
                      Joining {o.joiningDate} · made {ago(o.createdAt)}{o.note ? ` · ${o.note}` : ''}
                    </small>
                  </span>
                  <span className={`pill ${OFFER_ST[o.status][1]}`}>{OFFER_ST[o.status][0]}</span>
                  {o.status === 'SENT' && c.canEdit && (
                    <span className="rc-acts">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => act.mutate({ fn: () => recApi.decide(o.id, 'ACCEPTED'), done: `${c.name} accepted · marked hired` })}>
                        Accepted
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ fn: () => recApi.decide(o.id, 'DECLINED'), done: 'Offer declined' })}>
                        Declined
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.confirm('Withdraw this offer?') && act.mutate({ fn: () => recApi.decide(o.id, 'WITHDRAWN'), done: 'Offer withdrawn' })}>
                        Withdraw
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="rc-sec">
            <span className="py-sec">Interviews</span>
            {c.interviews.length === 0 && <span className="ml-muted">None yet.</span>}
            {c.interviews.map((iv) => (
              <div key={iv.id} className="rc-ivbox">
                <div className="rc-ivhead">
                  <span>
                    <b>{iv.round}</b>
                    <small>
                      {fmtWhen(iv.at)} · {iv.durationMin} min · {iv.mode}
                      {iv.place ? ` · ${iv.place}` : ''} · {iv.panel}
                    </small>
                  </span>
                  <span className={`pill ${iv.status === 'DONE' ? 'pill-ok' : iv.status === 'CANCELLED' ? 'pill-muted' : 'pill-info'}`}>{iv.status === 'DONE' ? 'Done' : iv.status === 'CANCELLED' ? 'Cancelled' : 'Scheduled'}</span>
                  {c.canEdit && iv.status === 'SCHEDULED' && (
                    <span className="rc-acts">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ fn: () => recApi.interviewStatus(iv.id, 'DONE'), done: 'Marked done' })}>
                        Done
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ fn: () => recApi.interviewStatus(iv.id, 'CANCELLED'), done: 'Interview cancelled' })}>
                        Cancel
                      </button>
                    </span>
                  )}
                </div>
                {iv.feedback.map((f) => (
                  <div key={f.employeeId} className="rc-fb">
                    <b>{f.by}</b>
                    <span className="rc-stars">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                    <span className={`pill ${f.recommendation.endsWith('YES') ? 'pill-ok' : 'pill-danger'}`}>{recL(f.recommendation)}</span>
                    {f.notes && <p>{f.notes}</p>}
                  </div>
                ))}
                {iv.status !== 'CANCELLED' && iv.feedback.length < iv.panelIds.length && <small className="ml-muted">Waiting on {iv.panelIds.length - iv.feedback.length} panelist feedback</small>}
              </div>
            ))}
          </div>

          <div className="rc-sec">
            <span className="py-sec">Activity</span>
            <div className="rc-events">
              {c.events.map((e, i) => (
                <div key={i}>
                  <span>{e.text}</span>
                  <small>
                    {fmtWhen(e.at)}
                    {e.by ? ` · ${e.by}` : ''}
                  </small>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function Fact({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <span className="rc-fact">
      <small>{k}</small>
      <b>{v || '—'}</b>
    </span>
  );
}

function ScheduleForm({ c, busy, onCancel, onSave }: { c: Candidate; busy: boolean; onCancel: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const n = c.interviews.filter((i) => i.status !== 'CANCELLED').length;
  const [f, setF] = useState({ round: n === 0 ? 'Technical 1' : n === 1 ? 'Technical 2' : 'HR round', at: '', durationMin: '45', mode: 'Video', place: '' });
  const [panel, setPanel] = useState<Person[]>([]);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  return (
    <div className="rc-inline">
      <b>Schedule an interview</b>
      <div className="rc-form">
        <Field label="Round">
          <input className="input sm" value={f.round} onChange={(e) => set('round', e.target.value)} />
        </Field>
        <Field label="When">
          <input className="input sm" type="datetime-local" value={f.at} onChange={(e) => set('at', e.target.value)} />
        </Field>
        <Field label="Length">
          <select className="input sm" value={f.durationMin} onChange={(e) => set('durationMin', e.target.value)}>
            {['30', '45', '60', '90'].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode">
          <select className="input sm" value={f.mode} onChange={(e) => set('mode', e.target.value)}>
            {['Video', 'In person', 'Phone'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label={f.mode === 'In person' ? 'Room / address' : 'Meeting link'}>
          <input className="input sm" value={f.place} onChange={(e) => set('place', e.target.value)} />
        </Field>
        <Field label="Add interviewer">
          <PersonPicker value={null} onChange={(p) => p && !panel.some((x) => x.id === p.id) && setPanel([...panel, p])} />
        </Field>
      </div>
      <div className="rc-chips">
        {panel.length === 0 && <span className="ml-muted">No interviewers yet — they’ll be told and can leave feedback from My interviews.</span>}
        {panel.map((p) => (
          <span key={p.id} className="chip">
            {p.name}
            <button type="button" onClick={() => setPanel(panel.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.name}`}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="rc-acts">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !f.at || !panel.length} onClick={() => onSave({ ...f, panel: panel.map((p) => p.id) })}>
          Schedule
        </button>
      </div>
    </div>
  );
}

function OfferForm({ c, busy, onCancel, onSave }: { c: Candidate; busy: boolean; onCancel: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ ctc: c.expectedCtc != null ? String(c.expectedCtc) : '', joiningDate: '', note: '' });
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  return (
    <div className="rc-inline">
      <b>Make an offer</b>
      <div className="rc-form">
        <Field label="Annual CTC (₹ lakh)" hint={c.expectedCtc != null ? `They asked for ${lakh(c.expectedCtc)}` : undefined}>
          <input className="input sm" type="number" step="0.1" value={f.ctc} onChange={(e) => set('ctc', e.target.value)} />
        </Field>
        <Field label="Joining date">
          <input className="input sm" type="date" value={f.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Note">
        <input className="input sm" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Joining bonus, relocation…" />
      </Field>
      <div className="rc-acts">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !f.ctc || !f.joiningDate} onClick={() => onSave(f)}>
          Record offer
        </button>
      </div>
    </div>
  );
}

function RejectForm({ busy, onCancel, onSave }: { busy: boolean; onCancel: () => void; onSave: (r: string) => void }) {
  const [r, setR] = useState('');
  const quick = ['Skills not a match', 'Experience too low', 'Salary expectation too high', 'Notice period too long', 'Withdrew', 'No show'];
  return (
    <div className="rc-inline">
      <b>Reject — why?</b>
      <div className="rc-chips">
        {quick.map((q) => (
          <button key={q} type="button" className="chip" aria-pressed={r === q} onClick={() => setR(q)}>
            {q}
          </button>
        ))}
      </div>
      <input className="input sm" value={r} onChange={(e) => setR(e.target.value)} placeholder="Or write a reason" />
      <div className="rc-acts">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !r.trim()} onClick={() => onSave(r.trim())}>
          Reject
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ interviews and offers

function InterviewsTab({ openCandidate }: { openCandidate: (id: string) => void }) {
  const q = useQuery({ queryKey: ['rec', 'interviews'], queryFn: recApi.interviews });
  const cols = '150px minmax(180px,1.4fr) minmax(140px,1fr) minmax(160px,1.4fr) 90px 100px';
  if (q.isLoading) return <BlockLoader label="Loading…" height={160} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  return (
    <Grid cols={cols} minWidth={860} head={['When', 'Candidate', 'Round', 'Panel', 'Mode', 'Feedback']} empty={!q.data.items.length && <div className="card-empty">No upcoming interviews.</div>}>
      {q.data.items.map((x) => (
        <Row key={x.id} cols={cols} onClick={() => openCandidate(x.candidate.id)}>
          <span>{fmtWhen(x.at)}</span>
          <span className="rc-cell">
            <b>{x.candidate.name}</b>
            <small>{x.job}</small>
          </span>
          <span>{x.round}</span>
          <span>{x.panel}</span>
          <span>{x.mode}</span>
          <span>
            {x.feedbackCount}/{x.panelIds.length}
          </span>
        </Row>
      ))}
    </Grid>
  );
}

function OffersTab({ openCandidate, canEdit, toast }: { openCandidate: (id: string) => void; canEdit: boolean; toast: (m: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rec', 'offers'], queryFn: recApi.offers });
  const [err, setErr] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (v: { id: string; s: string }) => recApi.decide(v.id, v.s),
    onSuccess: (c) => (qc.invalidateQueries({ queryKey: ['rec'] }), toast(c.stage === 'HIRED' ? `${c.name} hired — start their onboarding from the candidate` : 'Offer updated')),
    onError: (e) => setErr(errorText(e)),
  });
  const cols = 'minmax(180px,1.4fr) minmax(160px,1fr) 110px 120px 140px 200px';
  if (q.isLoading) return <BlockLoader label="Loading…" height={160} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  return (
    <>
      {err && <Alert>{err}</Alert>}
      <Grid cols={cols} minWidth={900} head={['Candidate', 'Job', 'CTC', 'Joining', 'Status', '']} empty={!q.data.items.length && <div className="card-empty">No offers yet.</div>}>
        {q.data.items.map((o) => (
          <Row key={o.id} cols={cols}>
            <button type="button" className="link-btn rc-cell" onClick={() => openCandidate(o.candidate.id)}>
              <b>{o.candidate.name}</b>
              <small>made {ago(o.createdAt)}</small>
            </button>
            <span>{o.job}</span>
            <span>{lakh(o.ctc)}</span>
            <span>{o.joiningDate}</span>
            <span>
              <span className={`pill ${OFFER_ST[o.status][1]}`}>{OFFER_ST[o.status][0]}</span>
            </span>
            <span className="rc-acts">
              {o.status === 'SENT' && canEdit && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => act.mutate({ id: o.id, s: 'ACCEPTED' })}>
                    Accepted
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ id: o.id, s: 'DECLINED' })}>
                    Declined
                  </button>
                </>
              )}
            </span>
          </Row>
        ))}
      </Grid>
    </>
  );
}

