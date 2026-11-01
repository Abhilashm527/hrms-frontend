import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/icons';
import { Overlay } from '../components/Overlay';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { PersonPicker } from '../onboarding/shared';
import { assetApi, type Extract, type Field as CfgField, type HwDetail, type LicDetail, type Mode, rupees, SLOT } from './api';

type Done = (msg: string, id?: string) => void;
const SAMPLE_HW = `Dell Latitude 7450 laptop
Serial: 7XK2M93 · Intel Core Ultra 7 165U, 32 GB RAM, 512 GB SSD, Windows 11 Pro
Tax invoice INV-2026-1184 · 12 Oct 2026 · Dell India Pvt Ltd
Warranty: 3 years ProSupport
Total: Rs 1,24,500.00`;
const SAMPLE_SW = `Order confirmation · Notion Labs Inc.
Plan: Notion Business (annual)
Seats: 25 @ ₹1,250 per seat per month
Term: 01 Nov 2026 – 31 Oct 2027`;

const sparkle = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
  </svg>
);
const upload = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5M12 3v12" />
  </svg>
);
const appIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

/** A 3-letter code for a type name as the ID format shows it: Laptop → LPT, Monitor → MNT. */
const typeCode = (name: string) => {
  const s = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const rest = s.slice(1).replace(/[AEIOU]/g, '');
  return (s.charAt(0) + rest + 'XXX').slice(0, 3);
};

// ------------------------------------------------------------------------------------------------------------- layout

/** The design's slide-in panel: header, steps joined by lines, scrolling body, footer with the error inline. */
function Panel({ title, step, steps, go, onClose, foot, children }: { title: string; step: number; steps: [string, string][]; go: (n: number) => void; onClose: () => void; foot: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <Overlay>
      <div className="aw-wrap">
        <div className="aw-scrim" onClick={onClose} />
        <div className="aw-panel" role="dialog" aria-modal="true" aria-label={title}>
          <div className="aw-head">
            <span>{title}</span>
            <button type="button" className="dfx-icon-btn" onClick={onClose} aria-label="Close">
              {Icon.close}
            </button>
          </div>
          <div className="aw-steps">
            {steps.map(([l, sub], i) => {
              const n = i + 1;
              const st = step === n ? 'on' : step > n ? 'done' : '';
              return (
                <button key={l} type="button" className={st} onClick={() => go(n)}>
                  <i>{step > n ? Icon.check : n}</i>
                  <span>
                    <b>{l}</b>
                    <small>{sub}</small>
                  </span>
                  <em />
                </button>
              );
            })}
          </div>
          <div className="aw-body">{children}</div>
          <div className="aw-foot">{foot}</div>
        </div>
      </div>
    </Overlay>
  );
}

function Foot({ back, error, onClose, next, nextLabel, busy }: { back?: () => void; error: string | null; onClose: () => void; next: () => void; nextLabel: string; busy?: boolean }) {
  return (
    <>
      {back && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={back}>
          {Icon.chevL} Back
        </button>
      )}
      <span className="aw-ferr">{error}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={next}>
        {nextLabel}
      </button>
    </>
  );
}

const AiPill = () => <span className="aw-ai">AI</span>;
function F({ label, req, ai, bad, wide, children }: { label: ReactNode; req?: boolean; ai?: boolean; bad?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`aw-f${bad ? ' bad' : ''}${wide ? ' wide' : ''}`}>
      <span>
        {label}
        {req && <em> *</em>}
        {ai && <AiPill />}
      </span>
      {children}
    </label>
  );
}
const Sec = ({ title, extra, children }: { title: ReactNode; extra?: ReactNode; children: ReactNode }) => (
  <div className="aw-sec">
    <span className="aw-sec-t">
      <span>{title}</span>
      {extra}
    </span>
    {children}
  </div>
);
function Toggle({ on, set, text }: { on: boolean; set: (v: boolean) => void; text: string }) {
  return (
    <span className="aw-tg">
      <button type="button" className="switch" role="switch" aria-checked={on} onClick={() => set(!on)} />
      <span>{text}</span>
    </span>
  );
}

/** Step 1 of both wizards: paste or upload a document; the API maps it to fields. */
function AiFill({ mode, onMapped, kept }: { mode: Mode; onMapped: (x: Extract) => void; kept: Extract | null }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    meta: { silent: true },
    mutationFn: () => (file ? assetApi.extractFile(mode, file) : assetApi.extract(mode, text)),
    onSuccess: (r) => (setErr(null), onMapped(r)),
    onError: (e) => setErr(errorText(e)),
  });
  const res = kept;
  return (
    <div className="aw-ai-wrap">
      <div className="aw-ai-box">
        <span className="dfx-ai-glow aw-glow">{sparkle}</span>
        <div>
          <b>Let AI fill this in</b>
          <span>
            {mode === 'hardware'
              ? 'Paste an invoice, delivery note or vendor email. Fields are mapped to your asset configuration — categories, types, specifications and ownership.'
              : 'Paste an order confirmation, subscription invoice or renewal email. Application, seats, pricing and term are mapped to your software configuration.'}
          </span>
        </div>
      </div>
      <label className="aw-f">
        <span className="aw-doc">
          <span>Document text</span>
          <a href="#" onClick={(e) => (e.preventDefault(), setText(mode === 'hardware' ? SAMPLE_HW : SAMPLE_SW), setFile(null))}>
            {mode === 'hardware' ? 'Use sample invoice' : 'Use sample order'}
          </a>
        </span>
        <textarea className="aw-mono" rows={9} value={text} placeholder={mode === 'hardware' ? 'Paste invoice text here…' : 'Paste order or invoice text here…'} onChange={(e) => (setText(e.target.value), setFile(null))} />
      </label>
      <div className="aw-ai-row">
        <label className="aw-upload">
          {upload}
          Upload file
          <input
            type="file"
            accept=".txt,.csv,.eml,.json,text/*"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              setFile(f);
            }}
          />
        </label>
        {file && <span className="aw-fname">{file.name}</span>}
        <span style={{ flex: 1 }} />
        {m.isPending ? (
          <span className="aw-busy">Reading document and mapping fields…</span>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={!text.trim() && !file} onClick={() => m.mutate()}>
            {sparkle} Extract details
          </button>
        )}
      </div>
      {err && <span className="aw-ferr">{err}</span>}
      {res && (
        <div className="aw-mapped">
          <div className="aw-mapped-h">
            <span className="ok">{Icon.check}</span>
            <b>Mapped fields</b>
            <small>{res.mapped.length}</small>
          </div>
          {res.mapped.map((x, i) => (
            <div key={i} className="aw-mapped-r">
              <span>{x.group}</span>
              <span>{x.key}</span>
              <b>{x.value}</b>
            </div>
          ))}
          {res.unmatched.length > 0 && (
            <div className="aw-mapped-r">
              <span>Skipped</span>
              <span>Not matched</span>
              <b>{res.unmatched.join(', ')}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SpecInputs({ fields, values, set, ai, errs }: { fields: CfgField[]; values: Record<string, unknown>; set: (k: string, v: unknown) => void; ai: Set<string>; errs: Record<string, string> }) {
  return (
    <div className="aw-grid">
      {fields.map((f) => {
        const v = values[f.key];
        const on = v === true || v === 'true';
        return (
          <F key={f.key} label={f.label} req={f.required} ai={ai.has(f.key)} bad={!!errs[f.key]}>
            {f.type === 'BOOLEAN' ? (
              <Toggle on={on} set={(x) => set(f.key, x)} text={on ? 'Yes' : 'No'} />
            ) : f.type === 'SELECT' || f.type === 'DROPDOWN' ? (
              <select value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">Select…</option>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </F>
        );
      })}
    </div>
  );
}

function NoSpecs({ what }: { what: string }) {
  const nav = useNavigate();
  return (
    <div className="aw-nospecs">
      No custom fields for this {what}.{' '}
      <a href="#" onClick={(e) => (e.preventDefault(), nav('/configuration/assets'))}>
        Add fields in asset configuration
      </a>
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
  const nav = useNavigate();
  const [step, setStep] = useState(edit ? 2 : 1);
  const [f, setF] = useState<HwForm | null>(null);
  const [ai, setAi] = useState<Set<string>>(new Set());
  const [extract, setExtract] = useState<Extract | null>(null);
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
  const catName = c?.categories.find((x) => x.id === f?.categoryId)?.name ?? '';
  const fmt = c?.idFormats.find((x) => x.ownershipId === f?.ownershipId)?.fmt ?? 'CMP-{TYPE}-####';
  const tag = edit?.tag ?? fmt.replace('{TYPE}', typeName ? typeCode(typeName) : 'XXX');
  const stColor = SLOT[status?.color ?? 4] ?? SLOT[4];

  const mapped = (x: Extract) => {
    setExtract(x);
    const v = x.fields as Record<string, unknown>;
    const keys = new Set<string>();
    setF((cur) => {
      if (!cur) return cur;
      const n = { ...cur };
      const put = <K extends keyof HwForm>(k: K, val: HwForm[K]) => {
        n[k] = val;
        keys.add(k as string);
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
      if (v.ownershipData && typeof v.ownershipData === 'object') {
        n.ownershipData = { ...n.ownershipData, ...(v.ownershipData as Record<string, string>) };
        Object.keys(v.ownershipData as object).forEach((k) => keys.add('own:' + k));
      }
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
    vendor: f!.vendor || f!.ownershipData['Vendor'] || null,
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
    aiExtractionId: extract?.extractionId,
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
      setErr(Object.values(e)[0] ?? null);
      if (Object.keys(e).length) return;
      // Ownership often asks again for what step 2 already has: carry it over where the field is still empty.
      const known: Record<string, string> = { 'purchase date': f!.purchasedOn, vendor: f!.vendor, 'warranty end': f!.warrantyUntil, 'warranty until': f!.warrantyUntil };
      const filled = { ...f!.ownershipData };
      for (const label of own?.captureFields ?? []) if (!filled[label] && known[label.toLowerCase()]) filled[label] = known[label.toLowerCase()];
      set('ownershipData', filled);
    }
    setErr(null);
    setStep(step + 1);
  };
  const finish = () => {
    const e: Record<string, string> = {};
    if (!f!.ownershipId) e.ownershipId = 'Pick an ownership type';
    for (const label of own?.captureFields ?? []) if (own?.returnRequired && /return|end/i.test(label) && !f!.ownershipData[label]) e['own:' + label] = `${label} is required for ${own.name} assets`;
    if (needEmp && !f!.employee) e.employee = 'Pick who gets it';
    setErrs(e);
    setErr(Object.values(e)[0] ?? null);
    if (!Object.keys(e).length) save.mutate();
  };
  const go = (n: number) => {
    if (n === step || (edit && n === 1)) return;
    if (n < step) return setStep(n);
    if (step === 1) return setStep(Math.min(n, 2));
    next();
  };
  const head = (sub: string, pill?: boolean) => (
    <div className="aw-card">
      <span className="aw-tile">{Icon.laptop}</span>
      <div>
        <span className="aw-tag">{tag}</span>
        <span>{sub}</span>
      </div>
      {pill && status && (
        <span className="aw-pill" style={{ background: stColor[1], color: stColor[0] }}>
          <i style={{ background: stColor[0] }} />
          {status.name}
        </span>
      )}
    </div>
  );

  return (
    <Panel
      title={edit ? `Edit ${edit.tag}` : 'Create hardware asset'}
      step={step}
      go={go}
      onClose={onClose}
      steps={[
        ['AI fill', 'Optional · from a document'],
        ['Details', 'Category, type, specs'],
        ['Ownership & status', 'Who owns it, who has it'],
      ]}
      foot={
        <Foot
          back={step > (edit ? 2 : 1) ? () => (setErr(null), setStep(step - 1)) : undefined}
          error={err}
          onClose={onClose}
          next={step < 3 ? next : finish}
          nextLabel={step === 1 ? (extract ? 'Review details' : 'Skip · enter manually') : step === 2 ? 'Next' : edit ? 'Save changes' : 'Create asset'}
          busy={!f || save.isPending}
        />
      }
    >
      {!c || !f ? (
        <BlockLoader label="Loading asset configuration…" height={220} />
      ) : (
        <>
          {step === 1 && <AiFill mode="hardware" onMapped={mapped} kept={extract} />}
          {step === 2 && (
            <div className="aw-step">
              {head(`${catName || 'Category'} · ${typeName || 'Type'}`)}
              <Sec title="Classification">
                <div className="aw-grid">
                  <F label="Category" req ai={ai.has('categoryId')}>
                    <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value, typeId: c.types.find((t) => t.categoryId === e.target.value)?.id ?? '', specs: {} })}>
                      {c.categories.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </F>
                  <F label="Type" req ai={ai.has('typeId')} bad={!!errs.typeId}>
                    <select value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value, specs: {} })}>
                      {types.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </F>
                </div>
              </Sec>
              <Sec title="Details">
                <F label="Make & model" req ai={ai.has('model')} bad={!!errs.model}>
                  <input value={f.model} placeholder="e.g. Dell Latitude 7450" onChange={(e) => set('model', e.target.value)} />
                </F>
                <div className="aw-grid">
                  <F label="Serial number" req ai={ai.has('serial')} bad={!!errs.serial}>
                    <input value={f.serial} onChange={(e) => set('serial', e.target.value)} />
                  </F>
                  <F label="Purchase cost (₹)" ai={ai.has('cost')} bad={!!errs.purchaseCost}>
                    <input type="number" value={f.cost} onChange={(e) => set('cost', e.target.value)} />
                  </F>
                  <F label="Purchase date" ai={ai.has('purchasedOn')}>
                    <input type="date" value={f.purchasedOn} onChange={(e) => set('purchasedOn', e.target.value)} />
                  </F>
                  <F label="Warranty until" ai={ai.has('warrantyUntil')} bad={!!errs.warrantyUntil}>
                    <input type="date" value={f.warrantyUntil} onChange={(e) => set('warrantyUntil', e.target.value)} />
                  </F>
                </div>
              </Sec>
              <Sec title={typeName ? `${typeName} specifications` : 'Specifications'}>
                {fields.isLoading ? (
                  <span className="aw-muted">Loading fields…</span>
                ) : (fields.data ?? []).length ? (
                  <SpecInputs fields={fields.data!} values={f.specs} set={(k, v) => set('specs', { ...f.specs, [k]: v })} ai={ai} errs={errs} />
                ) : (
                  <NoSpecs what="type" />
                )}
              </Sec>
            </div>
          )}
          {step === 3 && (
            <div className="aw-step">
              {head(`${f.model || 'Model'} · ${typeName}`, true)}
              <Sec
                title="Ownership"
                extra={
                  <a href="#" onClick={(e) => (e.preventDefault(), nav('/configuration/assets'))}>
                    Configure
                  </a>
                }
              >
                <F label="Ownership type" req ai={ai.has('ownershipId')} bad={!!errs.ownershipId}>
                  <select value={f.ownershipId} onChange={(e) => setF({ ...f, ownershipId: e.target.value, ownershipData: {} })}>
                    {c.ownership?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </F>
                {own && own.captureFields.length > 0 && (
                  <>
                    <span className="aw-muted">
                      {own.name} assets record {own.captureFields.join(', ').toLowerCase()}.{own.returnRequired ? ' A return date is required.' : ''}
                    </span>
                    <div className="aw-grid">
                      {own.captureFields.map((label) => {
                        const req = own.returnRequired && /return|end/i.test(label);
                        return (
                          <F key={label} label={label} req={req} ai={ai.has('own:' + label)} bad={!!errs['own:' + label] || (req && !!errs.returnDue)}>
                            <input type={/date|end|until/i.test(label) ? 'date' : 'text'} value={f.ownershipData[label] ?? ''} onChange={(e) => set('ownershipData', { ...f.ownershipData, [label]: e.target.value })} />
                          </F>
                        );
                      })}
                    </div>
                  </>
                )}
              </Sec>
              <Sec title="Status & assignment">
                <div className="aw-grid">
                  <F label="Status" req>
                    <select value={f.statusId} disabled={!!edit} onChange={(e) => set('statusId', e.target.value)}>
                      {c.statuses
                        .filter((s) => edit || !/retired|repair/i.test(s.name))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </F>
                  {needEmp && (
                    <F label="Assign to" req bad={!!errs.employee}>
                      <PersonPicker value={f.employee as never} onChange={(p) => set('employee', p ? { id: p.id, name: p.name } : null)} invalid={!!errs.employee} />
                    </F>
                  )}
                </div>
                {edit && <span className="aw-muted">Status changes through Assign, Recover and Repair on the asset.</span>}
              </Sec>
            </div>
          )}
        </>
      )}
    </Panel>
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
  const [extract, setExtract] = useState<Extract | null>(null);
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
  const oneTime = billing.startsWith('ONE');
  const perLabel = billing === 'MONTHLY' ? 'Price per seat / month (₹)' : oneTime ? 'Price per seat (₹)' : 'Price per seat / year (₹)';
  const annual = free || oneTime ? 0 : Number(f?.per || 0) * (siteWide ? 1 : Number(f?.seats || 0)) * (billing === 'MONTHLY' ? 12 : 1) * 100;
  const holders = Object.keys(f?.holders ?? {});
  const catName = c?.categories.find((x) => x.id === f?.categoryId)?.name ?? '';
  const suggested = (cands.data ?? []).filter((x) => x.suggested && !f?.holders[x.id]);
  const seatMax = siteWide ? null : Number(f?.seats || 0);

  const mapped = (x: Extract) => {
    setExtract(x);
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
      if (!free && f!.per === '') e.costPerSeat = 'Enter the price';
      if (!free && !oneTime && !f!.renewsOn) e.renewsOn = 'Add the renewal date';
      for (const x of fields.data ?? []) if (x.required && (f!.specs[x.key] == null || f!.specs[x.key] === '')) e[x.key] = `${x.label} is required`;
      setErrs(e);
      setErr(Object.values(e)[0] ?? null);
      if (Object.keys(e).length) return;
    }
    setErr(null);
    setStep(step + 1);
  };
  const finish = () => {
    const e: Record<string, string> = {};
    if (!f!.owner) e.owner = 'Pick who owns this license';
    if (seatMax != null && holders.length > seatMax) e.holders = `Only ${seatMax} seats — remove some people or add seats`;
    setErrs(e);
    setErr(Object.values(e)[0] ?? null);
    if (!Object.keys(e).length) save.mutate();
  };
  const go = (n: number) => {
    if (n === step || (edit && n === 1)) return;
    if (n < step) return setStep(n);
    if (step === 1) return setStep(Math.min(n, 2));
    next();
  };
  const head = (
    <div className="aw-card">
      <span className="aw-tile">{appIcon}</span>
      <div>
        <span className="aw-title">
          <b>{f?.name || 'New application'}</b>
          <span className="aw-lid">{edit?.lid ?? lid.data?.lid ?? ''}</span>
        </span>
        <span>
          {catName} · {type?.name} · {type?.unit}
        </span>
      </div>
      <span className="aw-cost">
        <small>Annual cost</small>
        <b>{oneTime ? `${rupees(Number(f?.per || 0) * (siteWide ? 1 : Number(f?.seats || 0)) * 100)} once` : rupees(annual)}</b>
      </span>
    </div>
  );

  return (
    <Panel
      title={edit ? `Edit ${edit.name}` : 'Create software license'}
      step={step}
      go={go}
      onClose={onClose}
      steps={[
        ['AI fill', 'Optional · from a document'],
        ['Application & billing', 'Seats, price, term'],
        ['Owner & seats', 'Who owns and uses it'],
      ]}
      foot={
        <Foot
          back={step > (edit ? 2 : 1) ? () => (setErr(null), setStep(step - 1)) : undefined}
          error={err}
          onClose={onClose}
          next={step < 3 ? next : finish}
          nextLabel={step === 1 ? (extract ? 'Review details' : 'Skip · enter manually') : step === 2 ? 'Next' : edit ? 'Save changes' : 'Create license'}
          busy={!f || save.isPending}
        />
      }
    >
      {!c || !f ? (
        <BlockLoader label="Loading software configuration…" height={220} />
      ) : (
        <>
          {step === 1 && <AiFill mode="software" onMapped={mapped} kept={extract} />}
          {step === 2 && (
            <div className="aw-step">
              {head}
              <Sec title="Application">
                <div className="aw-grid">
                  <F label="Category" req ai={ai.has('categoryId')}>
                    <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value, specs: {} })}>
                      {c.categories.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </F>
                  <F label="License type" req ai={ai.has('typeId')}>
                    <select value={f.typeId} disabled={!!edit} onChange={(e) => set('typeId', e.target.value)}>
                      {c.types.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </F>
                  <F label="Application" req ai={ai.has('name')} bad={!!errs.name}>
                    <input value={f.name} placeholder="e.g. Notion Business" onChange={(e) => set('name', e.target.value)} />
                  </F>
                  <F label="Vendor" ai={ai.has('vendor')}>
                    <input value={f.vendor} placeholder="e.g. Notion Labs Inc." onChange={(e) => set('vendor', e.target.value)} />
                  </F>
                </div>
              </Sec>
              <Sec title="Seats & billing" extra={<span className="aw-bill">{type ? `${type.billing} · ${type.unit}` : ''}</span>}>
                <div className="aw-grid">
                  {!siteWide && (
                    <F label="Seats" req ai={ai.has('seats')} bad={!!errs.seats}>
                      <input type="number" min={edit?.used ?? 1} value={f.seats} onChange={(e) => set('seats', e.target.value)} />
                    </F>
                  )}
                  {!free && (
                    <F label={siteWide ? 'Price (₹)' : perLabel} req ai={ai.has('per')} bad={!!errs.costPerSeat}>
                      <input type="number" value={f.per} onChange={(e) => set('per', e.target.value)} />
                    </F>
                  )}
                  <F label="Contract start" ai={ai.has('termStart')}>
                    <input type="date" value={f.termStart} onChange={(e) => set('termStart', e.target.value)} />
                  </F>
                  {!oneTime && (
                    <F label={free ? 'Trial / term ends' : 'Renewal date'} req={!free} ai={ai.has('renewsOn')} bad={!!errs.renewsOn}>
                      <input type="date" value={f.renewsOn} onChange={(e) => set('renewsOn', e.target.value)} />
                    </F>
                  )}
                </div>
              </Sec>
              <Sec title={catName ? `${catName} details` : 'Details'}>
                {(fields.data ?? []).length ? (
                  <SpecInputs fields={fields.data!} values={f.specs} set={(k, v) => set('specs', { ...f.specs, [k]: v })} ai={ai} errs={errs} />
                ) : (
                  <NoSpecs what="category" />
                )}
              </Sec>
            </div>
          )}
          {step === 3 && (
            <div className="aw-step">
              {head}
              <Sec title="Ownership & status">
                <div className="aw-grid">
                  <F label="License owner" req bad={!!errs.owner}>
                    <PersonPicker value={f.owner as never} onChange={(p) => set('owner', p ? { id: p.id, name: p.name } : null)} invalid={!!errs.owner} />
                  </F>
                  <F label="Status" req>
                    <select value={f.statusId} onChange={(e) => set('statusId', e.target.value)}>
                      <option value="">Automatic · from renewal and seat use</option>
                      {c.statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </F>
                  <div className="aw-f">
                    <span>Renewal</span>
                    <Toggle on={f.autoRenew} set={(v) => set('autoRenew', v)} text={f.autoRenew ? 'Auto-renews' : 'Renews manually'} />
                  </div>
                </div>
              </Sec>
              {!edit && (
                <Sec
                  title={
                    <>
                      Seat holders <span className={`aw-count${errs.holders ? ' bad' : ''}`}>{seatMax != null ? `${holders.length} / ${seatMax}` : holders.length}</span>
                    </>
                  }
                  extra={
                    <span className="aw-seat-acts">
                      {suggested.length > 0 && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('holders', { ...f.holders, ...Object.fromEntries(suggested.map((x) => [x.id, x.name])) })}>
                          {Icon.userPlus} Add {catName || 'suggested'} team ({suggested.length})
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('holders', {})}>
                        Clear
                      </button>
                    </span>
                  }
                >
                  <div className="aw-seats">
                    <div className="aw-seats-q">
                      <label className="dfx-search" style={{ width: '100%', boxSizing: 'border-box' }}>
                        {Icon.search}
                        <input placeholder="search employees…" value={q} onChange={(e) => setQ(e.target.value)} />
                      </label>
                    </div>
                    <div className="aw-seats-list">
                      {cands.data?.map((x) => {
                        const on = !!f.holders[x.id];
                        const ini = x.name
                          .split(/\s+/)
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase();
                        return (
                          <button key={x.id} type="button" className={on ? 'on' : ''} onClick={() => set('holders', on ? Object.fromEntries(Object.entries(f.holders).filter(([k]) => k !== x.id)) : { ...f.holders, [x.id]: x.name })}>
                            <span className="box">{on && Icon.check}</span>
                            <span className="av">{ini}</span>
                            <span className="nm">
                              <b>{x.name}</b>
                              <small>{[x.code, x.department].filter(Boolean).join(' · ')}</small>
                            </span>
                          </button>
                        );
                      })}
                      {cands.data?.length === 0 && <div className="aw-muted" style={{ padding: 12 }}>No one found</div>}
                    </div>
                  </div>
                </Sec>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
