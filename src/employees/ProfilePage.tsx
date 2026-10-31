import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/icons';
import { ApiError, blob, errorText } from '../lib/http';
import { date } from '../lib/format';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { ConfigInput } from '../onboarding/shared';
import { employeesApi, type Profile, type ProfileField, type ProfileSection } from './api';
import { DocumentsTab } from './DocumentsTab';
import { useAuth } from '../auth/AuthProvider';
import { BlockLoader } from '../components/Splash';

const STATUS_PILL: Record<string, string> = { healthy: 'pill-ok', active: 'pill-ok', pending: 'pill-warn', degraded: 'pill-danger', failed: 'pill-danger' };

export function ProfilePage() {
  const { employeeId = '' } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const back = (loc.state as { from?: string } | null)?.from ?? '/employees';
  const [tab, setTab] = useState('overview');
  const [toast, setToast] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['employees', 'profile', employeeId], queryFn: () => employeesApi.profile(employeeId) });
  const { me } = useAuth();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (q.data) document.title = `${q.data.name} · Ivoyant HRMS`;
  }, [q.data]);

  if (q.isLoading) return <BlockLoader page label="Loading profile…" />;
  if (q.isError || !q.data) {
    const e = q.error;
    if (e instanceof ApiError && e.code === 'NO_PROFILE_ACCESS') return <div className="card card-empty">You can't open this profile.</div>;
    return (
      <>
        <PermissionsNotice errors={[e]} />
        <div className="card card-empty">
          {e?.message ?? 'Profile not found.'} <Link to="/employees">Back to employees</Link>
        </div>
      </>
    );
  }
  const p = q.data;
  const tabs = p.tabs.length ? p.tabs : [{ key: 'overview', label: 'Overview' }];
  const cur = tabs.some((t) => t.key === tab) ? tab : 'overview';
  const sections = p.sections.filter((s) => s.tab === cur);

  return (
    <>
      <div className="crumbs">
        <button type="button" className="link-btn" onClick={() => nav(back)}>
          {Icon.chevL} employees
        </button>
        {p.department && <span>/ {p.department.name}</span>}
        <span>/ {p.name}</span>
        <span className="grow" />
        {me?.consoleAccess && (
          <Link className="btn btn-ghost btn-sm" to="/configuration/fields/employee-profile">
            {Icon.sliders} Configure fields
          </Link>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(window.location.href);
            setToast('Link copied');
          }}
        >
          {Icon.copy} Copy link
        </button>
      </div>

      <ProfileHeader p={p} onToast={setToast} />

      <div className="tabs" role="tablist" style={{ padding: 0 }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={cur === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {p.hiddenSections.length > 0 && cur === 'overview' && <Alert kind="info">Hidden for your roles: {p.hiddenSections.join(', ')}</Alert>}

      {cur === 'overview' && (
        <>
          {p.extraPanels &&
            Object.entries(p.extraPanels).map(([k, panel]) => (
              <div className="card" key={k}>
                <div className="card-head">
                  <span className="form-sec-title">{panel.title}</span>
                </div>
                <div className="kv grid">
                  {panel.sections.flatMap((s) =>
                    s.fields
                      .filter((f) => f.type !== 'HEADING' && f.level !== 'HIDDEN')
                      .map((f) => (
                        <div key={f.key}>
                          <span>{f.label}</span>
                          <b>{f.display || '—'}</b>
                        </div>
                      )),
                  )}
                </div>
              </div>
            ))}
          <div className="split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {sections.map((s) => (
                <SectionCard key={s.key} p={p} s={s} onToast={setToast} />
              ))}
            </div>
            <ReportingLine p={p} />
          </div>
        </>
      )}

      {(cur === 'personal' || cur === 'bank' || cur === 'other') && (
        <div className="split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
          {sections.map((s) => (
            <SectionCard key={s.key} p={p} s={s} onToast={setToast} />
          ))}
          {sections.length === 0 && <div className="card card-empty">Nothing to show here.</div>}
        </div>
      )}

      {cur === 'leave' && <LeaveTab p={p} />}
      {cur === 'compensation' && (
        <>
          <CompensationTab p={p} />
          {sections.map((s) => (
            <SectionCard key={s.key} p={p} s={s} onToast={setToast} />
          ))}
        </>
      )}
      {cur === 'documents' && <DocumentsTab p={p} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function ProfileHeader({ p, onToast }: { p: Profile; onToast: (t: string) => void }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const photo = useMutation({
    meta: { busy: 'Uploading photo…' },
    mutationFn: (f: File) => employeesApi.uploadPhoto(p.id, f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.removeQueries({ queryKey: ['photo'] });
      onToast('Photo updated');
    },
    onError: (e) => onToast(errorText(e)),
  });
  const idCard = async () => {
    const tab = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await blob(employeesApi.idCardPdf(p.id)));
      if (tab) tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      onToast(errorText(e));
    }
  };
  return (
    <div className="card profile-head">
      <div className="profile-photo">
        <Avatar url={p.photoUrl} initials={p.initials} size={76} />
        {p.actions.canChangePhoto && (
          <>
            <button type="button" className="photo-btn" title="Change photo" disabled={photo.isPending} onClick={() => file.current?.click()}>
              {Icon.camera}
            </button>
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) return onToast('The photo is larger than 5 MB');
                photo.mutate(f);
              }}
            />
          </>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--fg-1)' }}>{p.name}</h1>
          <span className={`pill ${STATUS_PILL[p.statusKind] ?? 'pill-muted'}`}>{p.statusLabel}</span>
          {p.self && <span className="pill no-dot pill-brand">You</span>}
        </span>
        <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{[p.titleDisplay ?? p.title, p.department?.name, p.location?.name].filter(Boolean).join(' · ')}</span>
        <span className="field-hint">
          {p.code}
          {p.position ? ` · ${p.position.name}${p.position.grade ? ` · ${p.position.grade}` : ''}` : ''}
          {p.joined ? ` · joined ${date(p.joined)}` : ''}
          {p.probationEnd && p.statusKind === 'pending' ? ` · probation ends ${date(p.probationEnd)}` : ''}
        </span>
      </div>
      <div className="row-actions">
        {p.actions.canPrintIdCard && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={idCard}>
            {Icon.file} ID card
          </button>
        )}
      </div>
    </div>
  );
}

/** One section of fields. Fields the viewer may change get an Edit mode; HR-approved fields become requests. */
function SectionCard({ p, s, onToast }: { p: Profile; s: ProfileSection; onToast: (t: string) => void }) {
  const qc = useQueryClient();
  const editable = s.fields.filter((f) => (f.access === 'EDIT' || f.access === 'REQUEST') && !f.editVia && !f.source);
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const start = () => {
    setVals(Object.fromEntries(editable.map((f) => [f.key, f.value == null ? '' : String(f.value)])));
    setErrs({});
    setErr(null);
    setEditing(true);
  };
  const changed = () => Object.fromEntries(Object.entries(vals).filter(([k, v]) => v !== (s.fields.find((f) => f.key === k)?.value == null ? '' : String(s.fields.find((f) => f.key === k)!.value))).map(([k, v]) => [k, v === '' ? null : v]));

  const save = useMutation({
    meta: { busy: 'Saving profile…' },
    mutationFn: () => employeesApi.saveFields(p.id, changed(), p.version),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['employees', 'profile', p.id] });
      qc.invalidateQueries({ queryKey: ['employees', 'list'] });
      if (r.rejected.length) {
        setErrs(Object.fromEntries(r.rejected.map((x) => [x.key, x.code === 'REQUIRED' ? 'Required' : x.code === 'INVALID_FORMAT' ? 'Check the format' : x.code.toLowerCase().replace(/_/g, ' ')])));
        setErr('Some fields were not saved.');
        return;
      }
      setEditing(false);
      onToast(r.requested.length ? `Sent ${r.requested.length} change${r.requested.length === 1 ? '' : 's'} to HR for approval` : 'Saved');
    },
    onError: (e) => {
      if (e instanceof ApiError && Array.isArray(e.extra.rejected)) {
        setErrs(Object.fromEntries((e.extra.rejected as { key: string; code: string }[]).map((x) => [x.key, x.code === 'REQUIRED' ? 'Required' : 'Check the format'])));
      }
      setErr(e instanceof ApiError && e.code === 'VERSION_CONFLICT' ? 'Someone else changed this profile. Reload to see their changes.' : errorText(e));
    },
  });
  const decide = useMutation({
    meta: { busy: (v: unknown) => ((v as { ok: boolean }).ok ? 'Approving change…' : 'Rejecting change…') },
    mutationFn: ({ f, ok }: { f: ProfileField; ok: boolean }) => (ok ? employeesApi.approveChange(p.id, f.pending!.id) : employeesApi.rejectChange(p.id, f.pending!.id, prompt('Reason for rejecting') || 'Not approved')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees', 'profile', p.id] }),
    onError: (e) => onToast(errorText(e)),
  });

  const needsApproval = editable.some((f) => f.access === 'REQUEST');

  return (
    <div className="card">
      <div className="card-head">
        <span>{s.label}</span>
        {editable.length > 0 && !editing && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={start}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="card-body">
          {err && <Alert>{err}</Alert>}
          {needsApproval && <span className="field-hint">Fields marked "HR approves" are sent to HR and change once approved.</span>}
          <div className="form-grid">
            {s.fields.map((f) => {
              const canEdit = editable.includes(f);
              return (
                <label key={f.key} className={`field${f.type === 'TEXTAREA' || f.type === 'LONG_TEXT' ? ' span-all' : ''}`}>
                  <span className="field-label" style={{ justifyContent: 'flex-start', gap: 6 }}>
                    {f.label}
                    {f.required && <span className="req">*</span>}
                    {f.access === 'REQUEST' && <span className="pill no-dot pill-warn" style={{ height: 16, fontSize: 10 }}>HR approves</span>}
                  </span>
                  {canEdit ? <ConfigInput type={f.type === 'LONG_TEXT' ? 'TEXTAREA' : f.type} options={f.options} value={vals[f.key] ?? ''} invalid={!!errs[f.key]} onChange={(v) => setVals((o) => ({ ...o, [f.key]: v }))} /> : <span className="ro">{f.display || '—'}</span>}
                  {f.helpText && canEdit && <span className="field-hint">{f.helpText}</span>}
                  {errs[f.key] && <span className="field-err">{errs[f.key]}</span>}
                </label>
              );
            })}
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={save.isPending}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending || Object.keys(changed()).length === 0} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : needsApproval ? 'Save / send for approval' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="kv grid">
          {s.fields.map((f) => (
            <div key={f.key}>
              <span>
                {f.label}
                {f.editVia === 'JOB_CHANGE' && <i className="muted" title="Changed through a job change"> · job change</i>}
              </span>
              <b className={f.masked ? 'mono' : undefined}>{f.display || '—'}</b>
              {f.pending && (
                <span className="pending">
                  Change to <b>{f.pending.to}</b> waiting for HR
                  {f.pending.canApprove && (
                    <>
                      {' '}
                      <button type="button" className="link-btn" disabled={decide.isPending} onClick={() => decide.mutate({ f, ok: true })}>
                        Approve
                      </button>{' '}
                      ·{' '}
                      <button type="button" className="link-btn" style={{ color: 'var(--danger)' }} disabled={decide.isPending} onClick={() => decide.mutate({ f, ok: false })}>
                        Reject
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportingLine({ p }: { p: Profile }) {
  return (
    <div className="card" style={{ alignSelf: 'start' }}>
      <div className="card-head">Reporting line</div>
      {p.manager ? (
        <Link to={`/employees/${p.manager.id}`} className="list-row link-row">
          <span className="section-label" style={{ width: 70 }}>
            Manager
          </span>
          <span className="txt">
            <b>{p.manager.name}</b>
            <span>{p.manager.title}</span>
          </span>
        </Link>
      ) : (
        <div className="list-row">
          <span className="section-label" style={{ width: 70 }}>
            Manager
          </span>
          <span className="muted">—</span>
        </div>
      )}
      {p.reports.map((r) => (
        <Link key={r.id} to={`/employees/${r.id}`} className="list-row link-row">
          <span className="section-label" style={{ width: 70 }}>
            Report
          </span>
          <span className="txt">
            <b>{r.name}</b>
            <span>{r.title}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function LeaveTab({ p }: { p: Profile }) {
  const l = p.leave;
  if (!l) return <div className="card card-empty">Leave isn't visible for your roles.</div>;
  return (
    <>
      <div className="kpis">
        {l.balances.map((b) => (
          <div className="card kpi" key={b.code}>
            <span className="kpi-label">{b.name}</span>
            <span className="kpi-val">
              {b.available} <small style={{ fontSize: 13, color: 'var(--fg-3)', fontWeight: 400 }}>/ {b.quota}</small>
            </span>
            <span className="kpi-sub">{b.used} used</span>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-head">Requests in {l.year}</div>
        {l.requests.length === 0 ? <div className="card-empty">No leave requests yet</div> : null}
      </div>
    </>
  );
}

const inr = (v: unknown) => (v == null ? '—' : typeof v === 'number' ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : String(v));

function CompensationTab({ p }: { p: Profile }) {
  const c = p.compensation;
  if (!c || (c.estimated && c.ctcAnnual == null)) return <div className="card card-empty">Compensation isn't visible for your roles.</div>;
  return (
    <div className="card">
      <div className="card-body">
        <span className="kpi-label">Annual CTC</span>
        <span className="kpi-val">{typeof c.ctcAnnual === 'number' ? `₹${(c.ctcAnnual / 100000).toFixed(2)} L / year` : (c.ctcAnnual ?? '—')}</span>
        <span className="field-hint">
          {[c.regime && `${c.regime} tax regime`, c.ptState && `${c.ptState} PT`].filter(Boolean).join(' · ')}
          {c.estimated ? ' · estimated' : ''}
        </span>
      </div>
      {!c.masked && (
        <div className="split" style={{ padding: '0 16px 16px' }}>
          <div>
            <span className="section-label">Monthly earnings</span>
            {c.earnings?.map((x) => (
              <div className="money-row" key={x.key}>
                <span>{x.label}</span>
                <b>{inr(x.amount)}</b>
              </div>
            ))}
          </div>
          <div>
            <span className="section-label">Deductions</span>
            {c.deductions?.map((x) => (
              <div className="money-row" key={x.key}>
                <span>{x.label}</span>
                <b>{inr(x.amount)}</b>
              </div>
            ))}
            <div className="money-row total">
              <span>Net monthly pay</span>
              <b>{inr(c.netMonthly)}</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
