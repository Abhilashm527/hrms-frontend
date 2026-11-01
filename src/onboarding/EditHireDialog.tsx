import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { ApiError, errorText, fieldErrors } from '../lib/http';
import { Modal } from '../leave/ui';
import { onboardingApi, type FormField, type HireDetail, type Person } from './api';
import { HARD_REQUIRED, SYSTEM, hireSteps } from './NewHireDrawer';
import { ConfigInput, FieldShell, PersonPicker, useDepartments, useEmploymentTypes, useLocations, useTitles } from './shared';
import { BlockLoader } from '../components/Splash';

const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
const str = (x: unknown) => (x == null ? '' : Array.isArray(x) ? x.join(', ') : String(x));

/**
 * Edits a hire still in the pipeline. The fields, their order, labels and required flags are the new hire form from
 * Configuration → Fields & forms → Onboarding · new hire form, so custom fields added there can be corrected here too.
 */
export function EditHireDialog({ h, onClose, onSaved }: { h: HireDetail; onClose: () => void; onSaved: (msg: string) => void }) {
  const qc = useQueryClient();
  const j = h.job;
  const [v, setV] = useState<Record<string, string>>(() => {
    const extra: Record<string, string> = {};
    for (const s of h.extraPanel?.sections ?? []) for (const f of s.fields) extra[f.key] = str(f.value);
    return {
      ...extra,
      first: h.first,
      last: h.last ?? '',
      pemail: j.personalEmail,
      phone: j.phone ?? '',
      gender: j.gender ?? '',
      dob: j.dob ?? '',
      title: h.title,
      dept: j.department.id,
      loc: j.location.id,
      etype: j.employmentType.id,
      doj: j.doj,
      prob: j.probationMonths != null ? String(j.probationMonths) : '',
      ctc: j.ctcLakh != null ? String(j.ctcLakh) : '',
      contractEnd: j.contractEnd ?? '',
    };
  });
  const [mgr, setMgr] = useState<Person | null>({ id: j.reportsTo.id, name: j.reportsTo.name });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; breaks: string[] } | null>(null);
  const form = useQuery({ queryKey: ['onboarding', 'hire-form', v.etype ?? ''], queryFn: () => onboardingApi.form(v.etype || undefined), staleTime: 5 * 60_000 });
  const depts = useDepartments();
  const locs = useLocations();
  const etypes = useEmploymentTypes();
  const titles = useTitles(v.dept || undefined);
  const titleListed = !!titles.data?.some((t) => t.name.toLowerCase() === (v.title ?? '').toLowerCase());
  const fixedTerm = !!etypes.data?.find((t) => t.id === v.etype)?.fixedTerm;

  // Only the field steps of the configured form; Microsoft 365 and the invite have their own cards in the drawer.
  const sections = useMemo(() => {
    const s = hireSteps(form.data?.steps).filter((x) => x.kind === 'FIELDS');
    const present = new Set(s.flatMap((x) => x.fields.map((f) => f.key)));
    if (fixedTerm && !present.has('contractEnd') && s.length) s[s.length - 1].fields.push({ key: 'contractEnd', label: 'Contract ends', type: 'DATE', required: true, options: [] });
    return s.map((x) => ({ ...x, fields: x.fields.filter((f) => (f.key !== 'contractEnd' || fixedTerm) && (f.key !== 'ctc' || h.permissions.canViewCtc)) }));
  }, [form.data, fixedTerm, h.permissions.canViewCtc]);

  const set = (k: string, val: string) => {
    setV((o) => ({ ...o, [k]: val }));
    setFe((e) => ({ ...e, [k]: '' }));
    setErr(null);
  };
  const valueOf = (k: string) => (k === 'mgr' ? (mgr?.id ?? '') : (v[k] ?? ''));
  const fields = sections.flatMap((s) => s.fields);

  const save = useMutation({
    meta: { busy: 'Saving the hire…' },
    mutationFn: (force: boolean) => {
      const values: Record<string, unknown> = {};
      const extra: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.key === 'mgr') continue;
        const val = (v[f.key] ?? '').trim();
        if (SYSTEM.includes(f.key)) values[f.key] = val === '' ? null : val;
        else extra[f.key] = val === '' ? null : val;
      }
      values.mgr = mgr?.id ?? null;
      if (!fixedTerm) values.contractEnd = null;
      return onboardingApi.update(h.id, values, h.version, force, Object.keys(extra).length ? extra : undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      onSaved(`${(v.first ?? '').trim()}'s details saved`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CONFIRM_REQUIRED') return setConfirm({ text: e.message, breaks: (e.extra.breaks as string[]) ?? [] });
      const x = fieldErrors(e);
      setFe(x);
      setErr(Object.keys(x).length ? 'Fix the highlighted fields.' : errorText(e));
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    for (const f of fields) {
      const val = valueOf(f.key);
      if ((f.required || HARD_REQUIRED[f.key]) && !val) e[f.key] = `${f.label} is required`;
      if (f.key === 'pemail' && val && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) e[f.key] = 'Enter a valid email address';
    }
    setFe(e);
    setErr(Object.keys(e).length ? 'Fill in the highlighted fields.' : null);
    if (!Object.keys(e).length) save.mutate(false);
  };

  const select = (k: string, list: { id: string; name: string; path?: string }[] | undefined, invalid: boolean) => (
    <select className="input sm" value={v[k] ?? ''} onChange={(e) => set(k, e.target.value)} aria-invalid={invalid}>
      <option value="">Select</option>
      {list?.map((o) => (
        <option key={o.id} value={o.id}>
          {o.path || o.name}
        </option>
      ))}
    </select>
  );

  const renderField = (f: FormField) => {
    const e = fe[f.key];
    let input;
    switch (f.key) {
      case 'dept':
        input = select('dept', depts.data, !!e);
        break;
      case 'loc':
        input = select('loc', locs.data, !!e);
        break;
      case 'etype':
        input = select('etype', etypes.data, !!e);
        break;
      case 'mgr':
        input = <PersonPicker value={mgr} onChange={(p) => (setMgr(p), setFe((x) => ({ ...x, mgr: '' })))} invalid={!!e} />;
        break;
      case 'title':
        input = (
          <>
            <select className="input sm" value={v.title ?? ''} onChange={(x) => set('title', x.target.value)} aria-invalid={!!e} disabled={titles.isLoading}>
              <option value="">{titles.isLoading ? 'Loading titles…' : titles.data?.length ? 'Select a title' : 'No titles yet'}</option>
              {v.title && !titleListed && <option value={v.title}>{v.title} · not in this department’s list</option>}
              {titles.data?.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.positionName ? `${t.name} · ${t.positionName}` : t.name}
                </option>
              ))}
            </select>
            {titles.data && !titles.data.length && (
              <span className="field-hint">
                Add job titles in <Link to="/configuration/titles">Configuration → Titles</Link> first.
              </span>
            )}
          </>
        );
        break;
      case 'gender':
        input = <ConfigInput type="SELECT" value={v.gender ?? ''} options={f.options?.length ? f.options : GENDERS} onChange={(x) => set('gender', x)} invalid={!!e} />;
        break;
      default:
        input = (
          <ConfigInput
            type={['dob', 'doj', 'contractEnd'].includes(f.key) ? 'DATE' : ['prob', 'ctc'].includes(f.key) ? 'NUMBER' : f.type}
            value={v[f.key] ?? ''}
            onChange={(x) => set(f.key, x)}
            options={f.options}
            invalid={!!e}
          />
        );
    }
    return (
      <FieldShell key={f.key} label={f.label} required={f.required || !!HARD_REQUIRED[f.key]} error={e} wide={f.type === 'TEXTAREA'}>
        {input}
      </FieldShell>
    );
  };

  return (
    <Modal
      width={680}
      title={`Edit ${h.name}`}
      sub="The fields of the new hire form in Configuration. Changes apply straight away and show in the hire's activity."
      onClose={onClose}
      foot={
        confirm ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(null)}>
              Back
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(true)}>
              Change email and re-send invite
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending || form.isLoading} onClick={submit}>
              Save changes
            </button>
          </>
        )
      }
    >
      {confirm ? (
        <Alert kind="info">
          <b>{confirm.text}</b>
          {confirm.breaks.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {confirm.breaks.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </Alert>
      ) : form.isLoading ? (
        <BlockLoader label="Loading the new hire form…" height={200} />
      ) : (
        <>
          {err && <Alert>{err}</Alert>}
          {sections.map((s) => (
            <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-2)' }}>{s.name}</div>
              <div className="form-grid">{s.fields.map(renderField)}</div>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
