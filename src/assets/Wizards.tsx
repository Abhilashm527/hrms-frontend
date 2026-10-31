import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { Modal } from '../leave/ui';
import { PersonPicker } from '../onboarding/shared';
import { assetApi, type Extract, type Field as CfgField, type HwDetail, type LicDetail, type Mode, rupees } from './api';
import { Field } from './ui';

type Done = (msg: string, id?: string) => void;
const SAMPLE_HW = `Dell Latitude 7450 laptop
Serial: 7XK2M93 · Intel Core Ultra 7 165U, 32 GB RAM, 512 GB SSD, Windows 11 Pro
Tax invoice INV-2026-1184 · 12 Oct 2026 · Dell India Pvt Ltd
Warranty: 3 years ProSupport
Total: Rs 1,24,500.00`;
const SAMPLE_SW = `Order confirmation · Notion Labs Inc.
Plan: Notion Business (annual)
Seats: 25 @ USD 15 / seat / month (₹1,250 per seat per month)
Term: 01 Nov 2026 – 31 Oct 2027`;

function Steps({ step, labels, set, max }: { step: number; labels: [string, string][]; set: (n: number) => void; max: number }) {
  return (
    <div className="as-steps">
      {labels.map(([l, sub], i) => (
        <button key={l} type="button" className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} disabled={i + 1 > max} onClick={() => set(i + 1)}>
          <i>{step > i + 1 ? Icon.check : i + 1}</i>
          <span>
            <b>{l}</b>
            <small>{sub}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Step 1 of both wizards: paste or upload a document; the API maps it to fields. */
function AiFill({ mode, onMapped }: { mode: Mode; onMapped: (x: Extract) => void }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Extract | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    meta: { silent: true },
    mutationFn: () => (file ? assetApi.extractFile(mode, file) : assetApi.extract(mode, text)),
    onSuccess: (r) => (setRes(r), setErr(null), onMapped(r)),
    onError: (e) => setErr(errorText(e)),
  });
  return (
    <div className="as-ai">
      <div className="as-ai-head">
        <span className="glow">{Icon.check}</span>
        <span>
          <b>Let AI fill this in</b>
          <small>
            {mode === 'hardware'
              ? 'Paste an invoice, delivery note or vendor email. Fields are mapped to your asset configuration — you can check everything on the next step.'
              : 'Paste an order confirmation, subscription invoice or renewal email. Application, seats, pricing and term are mapped for you.'}
          </small>
        </span>
      </div>
      {err && <Alert>{err}</Alert>}
      <div className="lv-field">
        <span>
          Document text{' '}
          <a href="#" onClick={(e) => (e.preventDefault(), setText(mode === 'hardware' ? SAMPLE_HW : SAMPLE_SW), setFile(null))}>
            Use a sample
          </a>
        </span>
        <textarea className="input sm" rows={8} value={text} placeholder="Paste text here…" onChange={(e) => (setText(e.target.value), setFile(null))} />
      </div>
      <div className="as-ai-row">
        <label className="btn btn-secondary btn-sm as-up">
          {Icon.plus} Upload file
          <input type="file" accept=".txt,.csv,.eml,.json,text/*" onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ''))} />
        </label>
        {file && <span className="as-muted">{file.name}</span>}
        <span style={{ flex: 1 }} />
        {m.isPending ? (
          <span className="as-muted">Reading the document and mapping fields…</span>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={!text.trim() && !file} onClick={() => m.mutate()}>
            Extract details
          </button>
        )}
      </div>
      {res && (
        <div className="as-mapped">
          <b>
            {Icon.check} Mapped fields · {res.mapped.length}
          </b>
          {res.mapped.map((x, i) => (
            <span key={i}>
              <small>{x.group}</small>
              <em>{x.key}</em>
              <b>{x.value}</b>
            </span>
          ))}
          {res.unmatched.length > 0 && <small className="as-muted">Not matched: {res.unmatched.join(', ')}</small>}
        </div>
      )}
    </div>
  );
}

function SpecInputs({ fields, values, set, ai, errs }: { fields: CfgField[]; values: Record<string, unknown>; set: (k: string, v: unknown) => void; ai: Set<string>; errs: Record<string, string> }) {
  return (
    <div className="as-form-grid">
      {fields.map((f) => {
        const v = values[f.key];
        return (
          <Field key={f.key} label={f.label} required={f.required} ai={ai.has(f.key)} error={errs[f.key]}>
            {f.type === 'BOOLEAN' ? (
              <span className="cal-tg">
                <button type="button" className="switch" role="switch" aria-checked={v === true || v === 'true'} onClick={() => set(f.key, !(v === true || v === 'true'))} />
                {v === true || v === 'true' ? 'Yes' : 'No'}
              </span>
            ) : f.type === 'SELECT' || f.type === 'DROPDOWN' ? (
              <select className="input sm" value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">—</option>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input className="input sm" type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </Field>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------- hardware

type HwForm = {
  categoryId: string;
  typeId: string;
  model: string;
  serial: string;
  cost: string;
  purchasedOn: string;
  warrantyFrom: string;
  warrantyUntil: string;
  vendor: string;
  invoiceNo: string;
  insurer: string;
  policyNo: string;
  insuredUntil: string;
  ownershipId: string;
  ownershipData: Record<string, string>;
  statusId: string;
  employee: { id: string; name: string } | null;
  specs: Record<string, unknown>;
  notes: string;
};

export function HardwareWizard({ edit, onClose, onDone }: { edit?: HwDetail; onClose: () => void; onDone: Done }) {
  const cfg = useQuery({ queryKey: ['assets', 'config', 'hardware'], queryFn: () => assetApi.config('hardware'), staleTime: 60_000 });
  const [step, setStep] = useState(edit ? 2 : 1);
  const [f, setF] = useState<HwForm | null>(null);
  const [ai, setAi] = useState<Set<string>>(new Set());
  const [aiId, setAiId] = useState<string | undefined>();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const c = cfg.data;

  useEffect(() => {
    if (f || !c) return;
    const basic = (k: string) => edit?.basic.find((b) => b.k === k)?.v as string | undefined;
    setF({
      categoryId: edit?.category?.id ?? c.categories[0]?.id ?? '',
      typeId: edit?.type.id ?? c.types.find((t) => t.categoryId === c.categories[0]?.id)?.id ?? '',
      model: edit?.model ?? '',
      serial: edit?.serial ?? '',
      cost: edit?.purchaseCost != null ? String(Math.round(edit.purchaseCost / 100)) : '',
      purchasedOn: basic('Purchase date') ?? '',
      warrantyFrom: edit?.warranty.from ?? '',
      warrantyUntil: edit?.warranty.until ?? '',
      vendor: edit?.vendor ?? '',
      invoiceNo: edit?.invoiceNo ?? '',
      insurer: edit?.insurance.insurer ?? '',
      policyNo: edit?.insurance.policyNo ?? '',
      insuredUntil: edit?.insurance.until ?? '',
      ownershipId: edit?.ownership.id ?? c.ownership?.[0]?.id ?? '',
      ownershipData: Object.fromEntries((edit?.ownership.fields ?? []).map((x) => [x.k, String(x.v ?? '')])),
      statusId: edit?.status.id ?? c.statuses.find((s) => s.assignable)?.id ?? c.statuses[0]?.id ?? '',
      employee: null,
      specs: Object.fromEntries((edit?.specs ?? []).map((x) => [x.key ?? x.k, x.v])),
      notes: edit?.notes ?? '',
    });
  }, [c, f, edit]);

  const fields = useQuery({ queryKey: ['assets', 'fields', 'hardware', f?.typeId], queryFn: () => assetApi.fields('hardware', f!.typeId), enabled: !!f?.typeId });
  const set = <K extends keyof HwForm>(k: K, v: HwForm[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const types = useMemo(() => (c?.types ?? []).filter((t) => !f?.categoryId || t.categoryId === f.categoryId), [c, f?.categoryId]);
  const own = c?.ownership?.find((o) => o.id === f?.ownershipId);
  const status = c?.statuses.find((s) => s.id === f?.statusId);
  const needEmp = !edit && /^assigned$/i.test(status?.name ?? '');
  const typeName = c?.types.find((t) => t.id === f?.typeId)?.name ?? '';

  const mapped = (x: Extract) => {
    setAiId(x.extractionId);
    const v = x.fields as Record<string, unknown>;
    const keys = new Set<string>();
    setF((cur) => {
      if (!cur) return cur;
      const n = { ...cur };
      const put = <K extends keyof HwForm>(k: K, val: HwForm[K], tag = k as string) => {
        n[k] = val;
        keys.add(tag);
      };
      if (v.categoryId) put('categoryId', String(v.categoryId));
      if (v.typeId) put('typeId', String(v.typeId));
      if (v.model) put('model', String(v.model));
      if (v.serial) put('serial', String(v.serial));
      if (v.purchaseCost != null) put('cost', String(Math.round(Number(v.purchaseCost) / 100)));
      if (v.purchasedOn) put('purchasedOn', String(v.purchasedOn));
      if (v.warrantyUntil) put('warrantyUntil', String(v.warrantyUntil));
      if (v.vendor) put('vendor', String(v.vendor));
      if (v.invoiceNo) put('invoiceNo', String(v.invoiceNo));
      if (v.ownershipId) put('ownershipId', String(v.ownershipId));
      if (v.specs && typeof v.specs === 'object') {
        n.specs = { ...n.specs, ...(v.specs as Record<string, unknown>) };
        Object.keys(v.specs as object).forEach((k) => keys.add(k));
      }
      return n;
    });
    setAi(keys);
  };

  const body = () => ({
    typeId: f!.typeId,
    categoryId: f!.categoryId,
    model: f!.model.trim(),
    serial: f!.serial.trim(),
    purchaseCost: f!.cost ? Math.round(Number(f!.cost) * 100) : null,
    purchasedOn: f!.purchasedOn || null,
    warrantyFrom: f!.warrantyFrom || null,
    warrantyUntil: f!.warrantyUntil || null,
    vendor: f!.vendor || null,
    invoiceNo: f!.invoiceNo || null,
    insurer: f!.insurer || null,
    policyNo: f!.policyNo || null,
    insuredUntil: f!.insuredUntil || null,
    ownershipId: f!.ownershipId,
    ownershipData: f!.ownershipData,
    statusId: f!.statusId,
    employeeId: needEmp ? f!.employee?.id : undefined,
    specs: f!.specs,
    notes: f!.notes || null,
    aiExtractionId: aiId,
  });
  const save = useMutation({
    meta: { busy: edit ? 'Saving the asset…' : 'Creating the asset…' },
    mutationFn: () => (edit ? assetApi.hwUpdate(edit.id, body(), edit.version) : assetApi.hwCreate(body())),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      onDone(edit ? `${d.tag} saved` : `${d.tag} created`, d.id);
    },
    onError: (e) => {
      const fe = fieldErrors(e);
      setErrs(fe);
      setErr(errorText(e));
      const step2 = ['model', 'serial', 'typeId', 'categoryId', 'purchaseCost', 'purchasedOn', 'warrantyUntil', ...(fields.data ?? []).map((x) => x.key)];
      if (Object.keys(fe).some((k) => step2.includes(k))) setStep(2);
    },
  });
  const step2Err = () => {
    const e: Record<string, string> = {};
    if (!f!.typeId) e.typeId = 'Pick a type';
    if (!f!.model.trim()) e.model = 'Add the make and model';
    if (!f!.serial.trim()) e.serial = 'Add the serial number';
    for (const x of fields.data ?? []) if (x.required && (f!.specs[x.key] == null || f!.specs[x.key] === '')) e[x.key] = `${x.label} is required`;
    return e;
  };
  const next = () => {
    if (step === 2) {
      const e = step2Err();
      setErrs(e);
      if (Object.keys(e).length) return;
    }
    setStep(step + 1);
  };
  const finish = () => {
    const e: Record<string, string> = {};
    if (!f!.ownershipId) e.ownershipId = 'Pick an ownership type';
    if (needEmp && !f!.employee) e.employee = 'Pick who gets it';
    setErrs(e);
    if (!Object.keys(e).length) save.mutate();
  };

  return (
    <Modal
      width={780}
      title={edit ? `Edit ${edit.tag}` : 'Add hardware'}
      onClose={onClose}
      foot={
        <>
          {step > (edit ? 2 : 1) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>
              {Icon.chevL} Back
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          {step < 3 ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={!f} onClick={next}>
              {step === 1 ? 'Continue' : 'Next'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={finish}>
              {edit ? 'Save changes' : 'Create asset'}
            </button>
          )}
        </>
      }
    >
      {!c || !f ? (
        <BlockLoader label="Loading asset configuration…" height={220} />
      ) : (
        <>
          <Steps
            step={step}
            set={(n) => (n < step || n === 2 ? setStep(n) : next())}
            max={edit ? 3 : 3}
            labels={[
              ['AI fill', 'Optional'],
              ['Details', 'Type, model, specs'],
              ['Ownership & status', 'Who owns it, who has it'],
            ]}
          />
          {err && step === 3 && <Alert>{err}</Alert>}
          {step === 1 && <AiFill mode="hardware" onMapped={mapped} />}
          {step === 2 && (
            <div className="as-form">
              <div className="as-form-head">
                <b>{f.model || 'New asset'}</b>
                <small>{[c.categories.find((x) => x.id === f.categoryId)?.name, typeName].filter(Boolean).join(' · ')}</small>
              </div>
              <h4>Classification</h4>
              <div className="as-form-grid">
                <Field label="Category" required ai={ai.has('categoryId')}>
                  <select className="input sm" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value, typeId: c.types.find((t) => t.categoryId === e.target.value)?.id ?? '' })}>
                    {c.categories.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Type" required ai={ai.has('typeId')} error={errs.typeId}>
                  <select className="input sm" value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value, specs: {} })}>
                    {types.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <h4>Details</h4>
              <div className="as-form-grid">
                <Field label="Make & model" required ai={ai.has('model')} error={errs.model}>
                  <input className="input sm" value={f.model} placeholder="e.g. Dell Latitude 7450" onChange={(e) => set('model', e.target.value)} />
                </Field>
                <Field label="Serial number" required ai={ai.has('serial')} error={errs.serial}>
                  <input className="input sm" value={f.serial} onChange={(e) => set('serial', e.target.value)} />
                </Field>
                <Field label="Purchase cost (₹)" ai={ai.has('cost')} error={errs.purchaseCost}>
                  <input className="input sm" inputMode="numeric" value={f.cost} onChange={(e) => set('cost', e.target.value.replace(/[^\d.]/g, ''))} />
                </Field>
                <Field label="Purchase date" ai={ai.has('purchasedOn')}>
                  <input className="input sm" type="date" value={f.purchasedOn} onChange={(e) => set('purchasedOn', e.target.value)} />
                </Field>
                <Field label="Vendor" ai={ai.has('vendor')}>
                  <input className="input sm" value={f.vendor} onChange={(e) => set('vendor', e.target.value)} />
                </Field>
                <Field label="Invoice number" ai={ai.has('invoiceNo')}>
                  <input className="input sm" value={f.invoiceNo} onChange={(e) => set('invoiceNo', e.target.value)} />
                </Field>
                <Field label="Warranty from">
                  <input className="input sm" type="date" value={f.warrantyFrom} onChange={(e) => set('warrantyFrom', e.target.value)} />
                </Field>
                <Field label="Warranty until" ai={ai.has('warrantyUntil')} error={errs.warrantyUntil}>
                  <input className="input sm" type="date" value={f.warrantyUntil} onChange={(e) => set('warrantyUntil', e.target.value)} />
                </Field>
              </div>
              <h4>{typeName ? `${typeName} specifications` : 'Specifications'}</h4>
              {fields.isLoading ? (
                <span className="as-muted">Loading fields…</span>
              ) : (fields.data ?? []).length ? (
                <SpecInputs fields={fields.data!} values={f.specs} set={(k, v) => set('specs', { ...f.specs, [k]: v })} ai={ai} errs={errs} />
              ) : (
                <span className="as-muted">No custom fields for this type. Add them in Configuration → Asset configuration.</span>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="as-form">
              <div className="as-form-head">
                <b>{f.model}</b>
                <small>
                  {typeName} · S/N {f.serial}
                </small>
              </div>
              <h4>Ownership</h4>
              <div className="as-form-grid">
                <Field label="Ownership type" required ai={ai.has('ownershipId')} error={errs.ownershipId}>
                  <select className="input sm" value={f.ownershipId} onChange={(e) => setF({ ...f, ownershipId: e.target.value, ownershipData: {} })}>
                    {c.ownership?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {own?.captureFields.map((label) => (
                  <Field key={label} label={label} required={own.returnRequired && /return|end/i.test(label)} error={/return|end/i.test(label) ? errs.returnDue : undefined}>
                    <input
                      className="input sm"
                      type={/date|end|until/i.test(label) ? 'date' : 'text'}
                      value={f.ownershipData[label] ?? ''}
                      onChange={(e) => set('ownershipData', { ...f.ownershipData, [label]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
              <h4>Insurance</h4>
              <div className="as-form-grid">
                <Field label="Insurer">
                  <input className="input sm" value={f.insurer} onChange={(e) => set('insurer', e.target.value)} />
                </Field>
                <Field label="Policy number">
                  <input className="input sm" value={f.policyNo} onChange={(e) => set('policyNo', e.target.value)} />
                </Field>
                <Field label="Insured until">
                  <input className="input sm" type="date" value={f.insuredUntil} onChange={(e) => set('insuredUntil', e.target.value)} />
                </Field>
              </div>
              <h4>Status & assignment</h4>
              <div className="as-form-grid">
                <Field label="Status" required hint={edit ? 'Use Assign, Recover and Repair on the asset to change who holds it' : undefined}>
                  <select className="input sm" value={f.statusId} disabled={!!edit} onChange={(e) => set('statusId', e.target.value)}>
                    {c.statuses
                      .filter((s) => edit || !/retired|repair/i.test(s.name))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
                {needEmp && (
                  <Field label="Assign to" required error={errs.employee}>
                    <PersonPicker value={f.employee as never} onChange={(p) => set('employee', p ? { id: p.id, name: p.name } : null)} invalid={!!errs.employee} />
                  </Field>
                )}
              </div>
              <Field label="Notes">
                <textarea className="input sm" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------------------- software

type SwForm = {
  categoryId: string;
  typeId: string;
  name: string;
  vendor: string;
  seats: string;
  per: string;
  termStart: string;
  renewsOn: string;
  owner: { id: string; name: string } | null;
  statusId: string;
  autoRenew: boolean;
  holders: Record<string, string>;
  specs: Record<string, unknown>;
  notes: string;
};

export function SoftwareWizard({ edit, onClose, onDone }: { edit?: LicDetail; onClose: () => void; onDone: Done }) {
  const cfg = useQuery({ queryKey: ['assets', 'config', 'software'], queryFn: () => assetApi.config('software'), staleTime: 60_000 });
  const [step, setStep] = useState(edit ? 2 : 1);
  const [f, setF] = useState<SwForm | null>(null);
  const [ai, setAi] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const c = cfg.data;
  useEffect(() => {
    if (f || !c) return;
    setF({
      categoryId: edit?.category.id ?? c.categories[0]?.id ?? '',
      typeId: edit?.type.id ?? c.types[0]?.id ?? '',
      name: edit?.name ?? '',
      vendor: edit?.vendor ?? '',
      seats: edit?.seats != null ? String(edit.seats) : '',
      per: edit ? String(Math.round(edit.cost.perSeat / 100)) : '',
      termStart: edit?.termStart ?? '',
      renewsOn: edit?.renewsOn ?? '',
      owner: edit?.owner ? { id: edit.owner.id, name: edit.owner.name } : null,
      statusId: edit?.status?.id ?? '',
      autoRenew: edit?.autoRenew ?? false,
      holders: {},
      specs: Object.fromEntries((edit?.specs ?? []).map((x) => [x.key ?? x.k, x.v])),
      notes: edit?.notes ?? '',
    });
  }, [c, f, edit]);
  const fields = useQuery({ queryKey: ['assets', 'fields', 'software', f?.categoryId], queryFn: () => assetApi.fields('software', f!.categoryId), enabled: !!f?.categoryId });
  const cands = useQuery({ queryKey: ['assets', 'cands', q], queryFn: () => assetApi.swCandidates(q || undefined), enabled: step === 3 && !edit });
  const lid = useQuery({
    queryKey: ['assets', 'lid', f?.typeId, f?.name],
    queryFn: () => assetApi.swPreviewId(f!.typeId, f!.name || 'App'),
    enabled: !!f?.typeId && !edit,
    staleTime: 30_000,
  });
  const set = <K extends keyof SwForm>(k: K, v: SwForm[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const type = c?.types.find((t) => t.id === f?.typeId);
  const billing = (type?.billing ?? '').toUpperCase();
  const siteWide = /site/i.test(type?.unit ?? '');
  const free = billing === 'FREE';
  const perLabel = billing === 'MONTHLY' ? 'Price per seat / month (₹)' : billing === 'ONE-TIME' || billing === 'ONE_TIME' ? 'Price per seat (₹, one-time)' : 'Price per seat / year (₹)';
  const annual = free ? 0 : (Number(f?.per || 0) * (siteWide ? 1 : Number(f?.seats || 0)) * (billing === 'MONTHLY' ? 12 : billing.startsWith('ONE') ? 0 : 1)) * 100;
  const holders = Object.keys(f?.holders ?? {});

  const mapped = (x: Extract) => {
    const v = x.fields as Record<string, unknown>;
    const keys = new Set<string>();
    setF((cur) => {
      if (!cur) return cur;
      const n = { ...cur };
      const put = (k: keyof SwForm, val: string) => {
        (n as Record<string, unknown>)[k] = val;
        keys.add(k);
      };
      if (v.categoryId) put('categoryId', String(v.categoryId));
      if (v.typeId) put('typeId', String(v.typeId));
      if (v.name) put('name', String(v.name));
      if (v.vendor) put('vendor', String(v.vendor));
      if (v.seats != null) put('seats', String(v.seats));
      if (v.costPerSeat != null) put('per', String(Math.round(Number(v.costPerSeat) / 100)));
      if (v.termStart) put('termStart', String(v.termStart));
      if (v.renewsOn) put('renewsOn', String(v.renewsOn));
      return n;
    });
    setAi(keys);
  };
  const body = () => ({
    categoryId: f!.categoryId,
    typeId: f!.typeId,
    name: f!.name.trim(),
    vendor: f!.vendor || null,
    seats: siteWide ? null : Number(f!.seats || 0),
    costPerSeat: free ? 0 : Math.round(Number(f!.per || 0) * 100),
    termStart: f!.termStart || null,
    renewsOn: f!.renewsOn || null,
    ownerEmployeeId: f!.owner?.id,
    ownerId: f!.owner?.id,
    statusId: f!.statusId || null,
    autoRenew: f!.autoRenew,
    holders: edit ? undefined : holders,
    specs: f!.specs,
    notes: f!.notes || null,
  });
  const save = useMutation({
    meta: { busy: edit ? 'Saving the license…' : 'Creating the license…' },
    mutationFn: () => (edit ? assetApi.swUpdate(edit.id, body(), edit.version) : assetApi.swCreate(body())),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      onDone(edit ? `${d.name} saved` : `${d.name} added · ${d.lid}`, d.id);
    },
    onError: (e) => {
      const fe = fieldErrors(e);
      setErrs(fe);
      setErr(errorText(e));
      if (['name', 'seats', 'costPerSeat', 'renewsOn', 'termStart'].some((k) => fe[k])) setStep(2);
    },
  });
  const next = () => {
    if (step === 2) {
      const e: Record<string, string> = {};
      if (!f!.name.trim()) e.name = 'Add the application name';
      if (!siteWide && !(Number(f!.seats) > 0)) e.seats = 'Enter the number of seats';
      if (!free && !(Number(f!.per) >= 0 && f!.per !== '')) e.costPerSeat = 'Enter the price';
      if (!free && !billing.startsWith('ONE') && !f!.renewsOn) e.renewsOn = 'Add the renewal date';
      for (const x of fields.data ?? []) if (x.required && (f!.specs[x.key] == null || f!.specs[x.key] === '')) e[x.key] = `${x.label} is required`;
      setErrs(e);
      if (Object.keys(e).length) return;
    }
    setStep(step + 1);
  };
  const finish = () => {
    const e: Record<string, string> = {};
    if (!f!.owner) e.owner = 'Pick who owns this license';
    if (!siteWide && holders.length > Number(f!.seats || 0)) e.holders = `Only ${f!.seats} seats — remove some people or add seats`;
    setErrs(e);
    if (!Object.keys(e).length) save.mutate();
  };

  return (
    <Modal
      width={780}
      title={edit ? `Edit ${edit.name}` : 'Add software license'}
      onClose={onClose}
      foot={
        <>
          {step > (edit ? 2 : 1) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>
              {Icon.chevL} Back
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          {step < 3 ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={!f} onClick={next}>
              {step === 1 ? 'Continue' : 'Next'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={finish}>
              {edit ? 'Save changes' : 'Add license'}
            </button>
          )}
        </>
      }
    >
      {!c || !f ? (
        <BlockLoader label="Loading software configuration…" height={220} />
      ) : (
        <>
          <Steps
            step={step}
            set={(n) => (n < step ? setStep(n) : next())}
            max={3}
            labels={[
              ['AI fill', 'Optional'],
              ['Application & billing', 'Seats, price, term'],
              ['Owner & seat holders', 'Who owns and uses it'],
            ]}
          />
          {err && step === 3 && <Alert>{err}</Alert>}
          {step === 1 && <AiFill mode="software" onMapped={mapped} />}
          {step >= 2 && (
            <div className="as-form-head as-lichead">
              <span>
                <b>{f.name || 'New license'}</b>
                <small>
                  {edit?.lid ?? lid.data?.lid ?? ''} · {c.categories.find((x) => x.id === f.categoryId)?.name} · {type?.name}
                </small>
              </span>
              <span>
                <small>Annual cost</small>
                <b>{rupees(annual)}</b>
              </span>
            </div>
          )}
          {step === 2 && (
            <div className="as-form">
              <h4>Application</h4>
              <div className="as-form-grid">
                <Field label="Category" required ai={ai.has('categoryId')}>
                  <select className="input sm" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value, specs: {} })}>
                    {c.categories.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="License type" required ai={ai.has('typeId')} hint={type ? `${type.billing} · ${type.unit}` : undefined}>
                  <select className="input sm" value={f.typeId} disabled={!!edit} onChange={(e) => set('typeId', e.target.value)}>
                    {c.types.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Application" required ai={ai.has('name')} error={errs.name}>
                  <input className="input sm" value={f.name} placeholder="e.g. Notion Business" onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Vendor" ai={ai.has('vendor')}>
                  <input className="input sm" value={f.vendor} placeholder="e.g. Notion Labs Inc." onChange={(e) => set('vendor', e.target.value)} />
                </Field>
              </div>
              <h4>Seats & billing</h4>
              <div className="as-form-grid">
                {!siteWide && (
                  <Field label="Seats" required ai={ai.has('seats')} error={errs.seats}>
                    <input className="input sm" type="number" min={edit?.used ?? 1} value={f.seats} onChange={(e) => set('seats', e.target.value)} />
                  </Field>
                )}
                {!free && (
                  <Field label={siteWide ? 'Price (₹)' : perLabel} required ai={ai.has('per')} error={errs.costPerSeat}>
                    <input className="input sm" inputMode="numeric" value={f.per} onChange={(e) => set('per', e.target.value.replace(/[^\d.]/g, ''))} />
                  </Field>
                )}
                <Field label="Contract start" ai={ai.has('termStart')}>
                  <input className="input sm" type="date" value={f.termStart} onChange={(e) => set('termStart', e.target.value)} />
                </Field>
                {!billing.startsWith('ONE') && (
                  <Field label={free ? 'Trial / term ends' : 'Renews on'} required={!free} ai={ai.has('renewsOn')} error={errs.renewsOn}>
                    <input className="input sm" type="date" value={f.renewsOn} onChange={(e) => set('renewsOn', e.target.value)} />
                  </Field>
                )}
              </div>
              <h4>{c.categories.find((x) => x.id === f.categoryId)?.name} details</h4>
              {(fields.data ?? []).length ? (
                <SpecInputs fields={fields.data!} values={f.specs} set={(k, v) => set('specs', { ...f.specs, [k]: v })} ai={ai} errs={errs} />
              ) : (
                <span className="as-muted">No custom fields for this category. Add them in Configuration → Asset configuration.</span>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="as-form">
              <h4>Ownership & status</h4>
              <div className="as-form-grid">
                <Field label="License owner" required error={errs.owner}>
                  <PersonPicker value={f.owner as never} onChange={(p) => set('owner', p ? { id: p.id, name: p.name } : null)} invalid={!!errs.owner} />
                </Field>
                <Field label="Status" hint="Leave on automatic to follow renewals and seat use">
                  <select className="input sm" value={f.statusId} onChange={(e) => set('statusId', e.target.value)}>
                    <option value="">Automatic</option>
                    {c.statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <span className="cal-tg">
                <button type="button" className="switch" role="switch" aria-checked={f.autoRenew} onClick={() => set('autoRenew', !f.autoRenew)} />
                {f.autoRenew ? 'Renews automatically' : 'Renews manually · we remind you before the date'}
              </span>
              {!edit && (
                <>
                  <h4>
                    Seat holders · {holders.length}
                    {!siteWide && f.seats ? ` of ${f.seats}` : ''}
                    {holders.length > 0 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('holders', {})}>
                        Clear
                      </button>
                    )}
                  </h4>
                  {errs.holders && <div className="cal-errs">{errs.holders}</div>}
                  <label className="dfx-search">
                    {Icon.search}
                    <input placeholder="search employees…" value={q} onChange={(e) => setQ(e.target.value)} />
                  </label>
                  <div className="as-pick">
                    {cands.data?.map((x) => {
                      const on = !!f.holders[x.id];
                      return (
                        <button key={x.id} type="button" className={on ? 'on' : ''} onClick={() => set('holders', on ? Object.fromEntries(Object.entries(f.holders).filter(([k]) => k !== x.id)) : { ...f.holders, [x.id]: x.name })}>
                          <span className="chk">{on && Icon.check}</span>
                          <span>
                            <b>{x.name}</b>
                            <small>{[x.code, x.department].filter(Boolean).join(' · ')}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <Field label="Notes">
                <textarea className="input sm" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
