import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { errorText, fieldErrors } from '../lib/http';
import { onboardingApi, type FormField, type FormStep, type NewHireBody, type Person } from './api';
import { PermissionsNotice } from './PermissionsNotice';
import { ConfigInput, Drawer, FieldShell, PersonPicker, useDepartments, useEmploymentTypes, useLocations, useTitles } from './shared';
import { BlockLoader } from '../components/Splash';

/** Keys the API stores on the hire itself; anything else from the form goes in `extra`. */
const SYSTEM = ['first', 'last', 'pemail', 'phone', 'gender', 'dob', 'title', 'dept', 'mgr', 'loc', 'etype', 'doj', 'prob', 'ctc', 'contractEnd'];
const HARD_REQUIRED: Record<string, string> = { first: 'First name', pemail: 'Personal email', title: 'Job title', dept: 'Department', mgr: 'Reports to', loc: 'Work location', etype: 'Employment type', doj: 'Date of joining' };

/** Used when the organization hasn't configured the form steps. */
const DEFAULT_STEPS: FormStep[] = [
  {
    key: 'personal',
    name: 'Personal',
    kind: 'FIELDS',
    locked: true,
    fields: [
      { key: 'first', label: 'First name', type: 'TEXT', required: true, options: [] },
      { key: 'last', label: 'Last name', type: 'TEXT', required: false, options: [] },
      { key: 'pemail', label: 'Personal email', type: 'EMAIL', required: true, options: [] },
      { key: 'phone', label: 'Mobile number', type: 'PHONE', required: false, options: [] },
      { key: 'gender', label: 'Gender', type: 'SELECT', required: false, options: ['Female', 'Male', 'Non-binary', 'Prefer not to say'] },
      { key: 'dob', label: 'Date of birth', type: 'DATE', required: false, options: [] },
    ],
  },
  {
    key: 'job',
    name: 'Job',
    kind: 'FIELDS',
    locked: true,
    fields: [
      { key: 'title', label: 'Job title', type: 'TEXT', required: true, options: [] },
      { key: 'dept', label: 'Department', type: 'SELECT', required: true, options: [] },
      { key: 'mgr', label: 'Reports to', type: 'SELECT', required: true, options: [] },
      { key: 'loc', label: 'Work location', type: 'SELECT', required: true, options: [] },
      { key: 'etype', label: 'Employment type', type: 'SELECT', required: true, options: [] },
      { key: 'doj', label: 'Date of joining', type: 'DATE', required: true, options: [] },
      { key: 'prob', label: 'Probation (months)', type: 'NUMBER', required: false, options: [] },
      { key: 'ctc', label: 'Annual CTC (₹ lakh)', type: 'NUMBER', required: false, options: [] },
    ],
  },
  { key: 'm365', name: 'Microsoft 365', kind: 'M365', locked: true, fields: [] },
  { key: 'invite', name: 'Invite', kind: 'DOCS_INVITE', locked: true, fields: [] },
];

const SUBTITLE: Record<string, string> = { M365: 'Work account', DOCS_INVITE: 'Documents & email' };

export function NewHireDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({});
  const [mgr, setMgr] = useState<Person | null>(null);
  const [step, setStep] = useState(0);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, val: string) => {
    setV((o) => ({ ...o, [k]: val }));
    setErrs((e) => ({ ...e, [k]: '' }));
    setErr(null);
  };

  const form = useQuery({ queryKey: ['onboarding', 'hire-form', v.etype ?? ''], queryFn: () => onboardingApi.form(v.etype || undefined), staleTime: 5 * 60_000 });
  const depts = useDepartments();
  const locs = useLocations();
  const etypes = useEmploymentTypes();
  const titles = useTitles(v.dept || undefined);

  // The configured steps, making sure every field the API insists on is somewhere in the form.
  const steps = useMemo(() => {
    const configured = form.data?.steps?.length ? form.data.steps : DEFAULT_STEPS;
    const s = configured.map((x) => ({ ...x, fields: [...x.fields] }));
    const present = new Set(s.flatMap((x) => x.fields.map((f) => f.key)));
    const missing = Object.entries(HARD_REQUIRED).filter(([k]) => !present.has(k));
    if (missing.length) {
      let target = s.filter((x) => x.kind === 'FIELDS').at(-1);
      if (!target) {
        target = { key: 'job', name: 'Job', kind: 'FIELDS', locked: true, fields: [] };
        s.unshift(target);
      }
      missing.forEach(([key, label]) => target!.fields.push({ key, label, type: key === 'doj' ? 'DATE' : 'TEXT', required: true, options: [] }));
    }
    if (!s.some((x) => x.kind === 'DOCS_INVITE')) s.push(DEFAULT_STEPS[3]);
    return s;
  }, [form.data]);

  const cur = steps[Math.min(step, steps.length - 1)];

  // Employment type sets the default probation.
  useEffect(() => {
    const t = etypes.data?.find((x) => x.id === v.etype);
    if (t && !v.prob) set('prob', String(t.probationMonths ?? ''));
  }, [v.etype]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Microsoft 365 plan ----
  const rule = form.data?.m365Rule;
  const domain = form.data?.domain ?? 'ivoyant.com';
  const deptName = depts.data?.find((d) => d.id === v.dept)?.name ?? '';
  const [m365On, setM365On] = useState(true);
  const [upn, setUpn] = useState('');
  const [upnTouched, setUpnTouched] = useState(false);
  const [license, setLicense] = useState('');
  const [groups, setGroups] = useState<string[] | null>(null);
  const [forceReset, setForceReset] = useState(true);
  const [sendSms, setSendSms] = useState(true);
  const ruleGroups = (rule?.groups ?? ['All staff', '{department}']).map((g) => g.replace('{department}', deptName || 'Department'));
  const groupList = groups ?? ruleGroups;
  const allGroups = Array.from(new Set([...ruleGroups, ...groupList, 'Microsoft Teams', 'VPN access']));

  const suggest = useQuery({
    queryKey: ['onboarding', 'upn-suggest', v.first, v.last, v.etype],
    queryFn: () => onboardingApi.upnSuggest(v.first ?? '', v.last ?? '', v.etype || undefined),
    enabled: cur.kind === 'M365' && !!v.first,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (suggest.data && !upnTouched) setUpn(suggest.data.suggestion || suggest.data.user);
  }, [suggest.data, upnTouched]);
  const [upnDebounced, setUpnDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setUpnDebounced(upn.trim()), 350);
    return () => clearTimeout(t);
  }, [upn]);
  const upnCheck = useQuery({ queryKey: ['onboarding', 'upn-check', upnDebounced], queryFn: () => onboardingApi.upnCheck(upnDebounced), enabled: cur.kind === 'M365' && m365On && upnDebounced.length > 1, staleTime: 30_000 });

  // ---- documents ----
  const templates = form.data?.documents ?? [];
  const [docs, setDocs] = useState<Record<string, { on: boolean; required: boolean }>>({});
  useEffect(() => {
    setDocs(Object.fromEntries(templates.map((d) => [d.key, { on: d.required, required: d.required }])));
  }, [form.data?.documents]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = templates.filter((d) => docs[d.key]?.on);

  const body = (): NewHireBody => {
    const values: Record<string, unknown> = {};
    const extra: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === '' || val === undefined) continue;
      (SYSTEM.includes(k) ? values : extra)[k] = k === 'ctc' ? Number(val) : val;
    }
    if (mgr) values.mgr = mgr.id;
    return {
      values,
      extra: Object.keys(extra).length ? extra : undefined,
      documents: chosen.map((d) => ({ key: d.key, required: docs[d.key].required })),
      m365: m365On && upn.trim() ? { upnUser: upn.trim(), license: license || rule?.licenseSku || form.data?.licenses[0] || '', groups: groupList, forceReset, sendSms, provisionNow: true } : undefined,
      inviteTemplateId: form.data?.invite?.id,
    };
  };

  const preview = useQuery({
    queryKey: ['onboarding', 'invite-preview', JSON.stringify(body())],
    queryFn: () => onboardingApi.invitePreview(body()),
    enabled: cur.kind === 'DOCS_INVITE',
    staleTime: 60_000,
    retry: false,
  });

  const create = useMutation({
    meta: { busy: (invite: unknown) => (invite ? 'Creating the hire and sending the invite…' : 'Saving the new hire…') },
    mutationFn: (invite: boolean) => onboardingApi.create(body(), invite),
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      onCreated(h.id);
    },
    onError: (e) => {
      const fe = fieldErrors(e);
      setErrs(fe);
      const at = steps.findIndex((s) => s.fields.some((f) => fe[f.key]));
      if (at >= 0) setStep(at);
      setErr(Object.keys(fe).length ? 'Fix the highlighted fields.' : errorText(e));
    },
  });

  const valueOf = (k: string) => (k === 'mgr' ? (mgr?.id ?? '') : (v[k] ?? ''));

  const validate = (s: FormStep): boolean => {
    const e: Record<string, string> = {};
    for (const f of s.fields) {
      const val = valueOf(f.key);
      if ((f.required || HARD_REQUIRED[f.key]) && !val) e[f.key] = `${f.label} is required`;
      if (f.key === 'pemail' && val && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) e[f.key] = 'Enter a valid email address';
    }
    if (s.kind === 'M365' && m365On && upnCheck.data && !upnCheck.data.available) e.upn = 'This address is taken';
    setErrs(e);
    setErr(Object.keys(e).length ? 'Fill in the highlighted fields.' : null);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(cur)) return;
    setStep((n) => Math.min(n + 1, steps.length - 1));
  };

  const name = [v.first, v.last].filter(Boolean).join(' ');

  const renderField = (f: FormField) => {
    const e = errs[f.key];
    const req = f.required || !!HARD_REQUIRED[f.key];
    let input;
    switch (f.key) {
      case 'dept':
        input = (
          <select className="input sm" value={v.dept ?? ''} onChange={(x) => set('dept', x.target.value)} aria-invalid={!!e}>
            <option value="">Select</option>
            {depts.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.path || d.name}
              </option>
            ))}
          </select>
        );
        break;
      case 'loc':
        input = (
          <select className="input sm" value={v.loc ?? ''} onChange={(x) => set('loc', x.target.value)} aria-invalid={!!e}>
            <option value="">Select</option>
            {locs.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        );
        break;
      case 'etype':
        input = (
          <select className="input sm" value={v.etype ?? ''} onChange={(x) => set('etype', x.target.value)} aria-invalid={!!e}>
            <option value="">Select</option>
            {etypes.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        );
        break;
      case 'mgr':
        input = (
          <PersonPicker
            value={mgr}
            onChange={(p) => {
              setMgr(p);
              setErrs((x) => ({ ...x, mgr: '' }));
            }}
            invalid={!!e}
          />
        );
        break;
      case 'title':
        input = (
          <>
            <input className="input sm" list="title-options" value={v.title ?? ''} onChange={(x) => set('title', x.target.value)} aria-invalid={!!e} />
            <datalist id="title-options">
              {titles.data?.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </>
        );
        break;
      case 'contractEnd':
        if (!etypes.data?.find((t) => t.id === v.etype)?.fixedTerm) return null;
        input = <ConfigInput type="DATE" value={v[f.key] ?? ''} onChange={(x) => set(f.key, x)} invalid={!!e} />;
        break;
      default:
        input = (
          <ConfigInput
            type={['dob', 'doj'].includes(f.key) ? 'DATE' : ['prob', 'ctc'].includes(f.key) ? 'NUMBER' : f.type}
            value={v[f.key] ?? ''}
            onChange={(x) => set(f.key, x)}
            options={f.key === 'gender' && !f.options.length ? ['Female', 'Male', 'Non-binary', 'Prefer not to say'] : f.options}
            invalid={!!e}
          />
        );
    }
    const empty = { dept: [depts, 'departments', 'Departments'], loc: [locs, 'locations', 'Locations'], etype: [etypes, 'employment-types', 'Employment types'] } as const;
    const lk = empty[f.key as keyof typeof empty];
    return (
      <FieldShell key={f.key} label={f.label} required={req} error={e} wide={f.type.toUpperCase() === 'TEXTAREA'}>
        {input}
        {lk && lk[0].data?.length === 0 && (
          <span className="field-hint">
            None set up yet — add them in{' '}
            <Link to={`/configuration/${lk[1]}`} onClick={onClose}>
              Configuration → {lk[2]}
            </Link>
          </span>
        )}
      </FieldShell>
    );
  };

  const last = step === steps.length - 1;

  return (
    <Drawer
      title="New hire"
      sub={name ? [name, v.title].filter(Boolean).join(' · ') : 'Set up the record, work account and invite'}
      onClose={onClose}
      busy={create.isPending}
      wide={cur.kind === 'DOCS_INVITE'}
      foot={
        <>
          {step > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)} disabled={create.isPending}>
              {Icon.chevL} Back
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={create.isPending}>
            Cancel
          </button>
          {last ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" disabled={create.isPending} onClick={() => create.mutate(false)}>
                Save as draft
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={create.isPending || chosen.length === 0} title={chosen.length === 0 ? 'Pick at least one document' : undefined} onClick={() => create.mutate(true)}>
                {create.isPending ? 'Saving…' : 'Send invite'}
              </button>
            </>
          ) : cur.kind === 'M365' ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setM365On(false);
                  setErrs({});
                  setErr(null);
                  setStep(step + 1);
                }}
              >
                Skip for now
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setM365On(true);
                  next();
                }}
              >
                Next
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={next}>
              Next
            </button>
          )}
        </>
      }
    >
      <div className="wizard-steps">
        {steps.map((s, i) => (
          <div key={s.key} className={`wizard-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>
            <span className="n">{i < step ? '✓' : i + 1}</span>
            <span className="t">
              <b>{s.name}</b>
              <small>{SUBTITLE[s.kind] ?? s.fields.slice(0, 2).map((f) => f.label).join(' & ')}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="drawer-body">
        <PermissionsNotice errors={[depts.error, locs.error, etypes.error]} />
        {form.isError && <Alert>{form.error.message}</Alert>}
        {err && <Alert>{err}</Alert>}

        {cur.kind === 'FIELDS' && (
          <>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="form-sec-title">{cur.name}</span>
              <Link to="/configuration/fields/onboarding" onClick={onClose} style={{ fontSize: 12 }}>
                Add fields in onboarding configuration
              </Link>
            </span>
            <div className="form-grid">{cur.fields.map(renderField)}</div>
          </>
        )}

        {cur.kind === 'M365' && (
          <>
            <div className="callout">
              <span className="kpi-ic" style={{ background: 'var(--brand-tint)', color: 'var(--brand)', flexShrink: 0 }}>
                {Icon.laptop}
              </span>
              <span>
                <b>Microsoft 365 work account</b>
                Creates the user in Entra ID, assigns a license, adds groups and sets up the mailbox and Teams. Until a Microsoft tenant is connected, the API simulates these steps.
              </span>
            </div>
            <div className="form-grid">
              <FieldShell label="Work email (UPN)" required error={errs.upn}>
                <div className="upn">
                  <input
                    value={upn}
                    onChange={(e) => {
                      setUpn(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                      setUpnTouched(true);
                    }}
                    aria-label="Work email user name"
                  />
                  <span>@{domain}</span>
                </div>
                {upnCheck.data && (
                  <span className="field-hint" style={{ color: upnCheck.data.available ? 'var(--success)' : 'var(--danger)' }}>
                    {upnCheck.data.available ? 'Available' : `Taken${upnCheck.data.suggestion ? ` · try ${upnCheck.data.suggestion}` : ''}`}
                  </span>
                )}
              </FieldShell>
              <FieldShell label="License" required>
                <select className="input sm" value={license || rule?.licenseSku || ''} onChange={(e) => setLicense(e.target.value)}>
                  {form.data?.licenses.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </FieldShell>
            </div>
            <div className="field">
              <span className="field-label">Groups</span>
              <div className="chips">
                {allGroups.map((g) => (
                  <button key={g} type="button" className="chip" aria-pressed={groupList.includes(g)} onClick={() => setGroups(groupList.includes(g) ? groupList.filter((x) => x !== g) : [...groupList, g])}>
                    {groupList.includes(g) && '✓ '}
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <label className="check" style={{ gap: 10 }}>
              <button type="button" className="switch" role="switch" aria-checked={forceReset} onClick={() => setForceReset(!forceReset)} />
              Require password change at first sign-in
            </label>
            <label className="check" style={{ gap: 10 }}>
              <button type="button" className="switch" role="switch" aria-checked={sendSms} onClick={() => setSendSms(!sendSms)} />
              Send sign-in details by SMS to {v.phone || 'the mobile number'}
            </label>
            <span className="field-hint">The account is created when you save the hire. "Skip for now" lets you create it later from the hire's page.</span>
          </>
        )}

        {cur.kind === 'DOCS_INVITE' && (
          <div className="split">
            <div className="field">
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="form-sec-title">Documents to collect</span>
                <span className="field-hint">
                  {chosen.length} selected · {chosen.filter((d) => docs[d.key].required).length} required
                </span>
              </span>
              {!v.etype && <Alert kind="info">Pick an employment type to see its documents.</Alert>}
              {v.etype && templates.length === 0 && !form.isLoading && <Alert kind="info">No documents are configured for this employment type.</Alert>}
              <div className="doc-pick">
                {templates.map((d) => (
                  <label key={d.key}>
                    <input
                      type="checkbox"
                      checked={!!docs[d.key]?.on}
                      onChange={(e) => setDocs((x) => ({ ...x, [d.key]: { on: e.target.checked, required: x[d.key]?.required ?? d.required } }))}
                      style={{ accentColor: 'var(--brand)' }}
                    />
                    <span className="txt">
                      <b>{d.name}</b>
                      <small>{d.group ?? d.hint}</small>
                    </span>
                    {docs[d.key]?.on && (
                      <button
                        type="button"
                        className={`pill no-dot ${docs[d.key].required ? 'pill-brand' : 'pill-muted'}`}
                        style={{ border: 'none', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.preventDefault();
                          setDocs((x) => ({ ...x, [d.key]: { ...x[d.key], required: !x[d.key].required } }));
                        }}
                        title="Click to toggle"
                      >
                        {docs[d.key].required ? 'Required' : 'Optional'}
                      </button>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="form-sec-title">Invite email preview</span>
              {preview.isLoading && <BlockLoader fill label="Preparing the preview…" />}
              {preview.isError && <Alert>{preview.error.message}</Alert>}
              {preview.data && (
                <>
                  <span className="field-hint">
                    To <b>{preview.data.to}</b>
                    {preview.data.cc ? ` · cc ${preview.data.cc}` : ''} · <b>{preview.data.subject}</b>
                  </span>
                  {/* Rendered by the API with escaped values; sandboxed so it can't run script or navigate. */}
                  <iframe className="email-frame" title="Invite email preview" sandbox="" srcDoc={preview.data.html} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
