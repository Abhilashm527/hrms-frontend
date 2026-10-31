import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { Modal } from '../leave/ui';
import { type Decl, inr, type Kind, reqApi, saveBlob } from './api';
import { Pill, RequestDrawer } from './InboxPage';

type Tab = 'letters' | 'reimb' | 'tickets' | 'tax';
const KIND: Record<Exclude<Tab, 'tax'>, Kind> = { letters: 'LETTER', reimb: 'REIMBURSEMENT', tickets: 'HELPDESK' };
const NEW: Record<Exclude<Tab, 'tax'>, string> = { letters: 'Request letter', reimb: 'New claim', tickets: 'New ticket' };
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function MyRequestsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'letters';
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ['requests', 'mine'], queryFn: () => reqApi.mine() });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const withdraw = useMutation({
    meta: { busy: 'Withdrawing the request…' },
    mutationFn: (id: string) => reqApi.withdraw(id),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ['requests'] }), setToast(`${r.ref} withdrawn`)),
    onError: (e) => setErr(errorText(e)),
  });
  const dl = (id: string, name: string) => reqApi.file(id, 'letter').then((b) => saveBlob(b, name), (e) => setErr(errorText(e)));

  const kind = tab === 'tax' ? null : KIND[tab];
  const rows = (mine.data?.items ?? []).filter((r) => r.kind === kind);
  const open_ = mine.data?.open;
  const tabs: [Tab, string, number][] = [
    ['letters', 'Letters', open_?.LETTER ?? 0],
    ['reimb', 'Reimbursements', open_?.REIMBURSEMENT ?? 0],
    ['tickets', 'Helpdesk', open_?.HELPDESK ?? 0],
    ['tax', 'Tax declaration', 0],
  ];

  return (
    <div className="rq-page">
      <div className="rq-top">
        <span>
          <h1>Requests</h1>
          <small>Letters, reimbursements, helpdesk tickets and your tax declaration</small>
        </span>
        {tab !== 'tax' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm(true)}>
            {Icon.plus} {NEW[tab]}
          </button>
        )}
      </div>
      <div className="dfx-tabbar" role="tablist">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => setSp(k === 'letters' ? {} : { tab: k })}>
            {l}
            {n > 0 && <span className="dfx-count red">{n}</span>}
          </button>
        ))}
      </div>
      {err && <Alert>{err}</Alert>}
      {tab === 'tax' ? (
        <TaxForm toast={setToast} />
      ) : (
        <div className="rq-list">
          {mine.isLoading ? (
            <BlockLoader label="Loading your requests…" height={180} />
          ) : mine.isError ? (
            <Alert>{errorText(mine.error)}</Alert>
          ) : rows.length === 0 ? (
            <div className="rq-empty">Nothing here yet</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rq-row mine click" onClick={() => setOpen(r.id)}>
                <span className="rq-what">
                  <b>
                    {r.title}
                    {r.amount != null && ` · ${inr(r.amount)}`}
                  </b>
                  <small>{[r.ref, fmt(r.createdAt), r.kind === 'HELPDESK' ? `${r.type.name} · ${r.note}` : r.note].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="rq-stage">{r.stageLabel}</span>
                <Pill status={r.status} />
                <span className="rq-acts" onClick={(e) => e.stopPropagation()}>
                  {r.status === 'ISSUED' && r.letter && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => dl(r.id, r.letter!)}>
                      {Icon.download} Download
                    </button>
                  )}
                  {r.canWithdraw && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => withdraw.mutate(r.id)}>
                      Withdraw
                    </button>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      )}
      {form && kind && (
        <NewRequest
          kind={kind}
          label={NEW[tab as Exclude<Tab, 'tax'>]}
          onClose={() => setForm(false)}
          onDone={(msg) => {
            setForm(false);
            setToast(msg);
          }}
        />
      )}
      {open && <RequestDrawer id={open} onClose={() => setOpen(null)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function NewRequest({ kind, label, onClose, onDone }: { kind: Kind; label: string; onClose: () => void; onDone: (msg: string) => void }) {
  const types = useQuery({ queryKey: ['requests', 'types', kind], queryFn: () => reqApi.types(kind), staleTime: 60_000 });
  const qc = useQueryClient();
  const [f, setF] = useState({ typeId: '', title: '', note: '', amount: '', date: '' });
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const list = (types.data ?? []).filter((t) => t.active !== false);
  const typeId = f.typeId || list[0]?.id || '';
  const localErr =
    kind === 'LETTER'
      ? f.note.trim().length < 3
        ? 'Add the purpose of the letter'
        : ''
      : kind === 'REIMBURSEMENT'
        ? !(Number(f.amount) > 0)
          ? 'Enter the amount'
          : !f.date
            ? 'Choose the expense date'
            : !file
              ? 'Attach a receipt'
              : ''
        : f.title.trim().length < 3
          ? 'Add a subject'
          : '';
  const m = useMutation({
    meta: { busy: 'Submitting your request…' },
    mutationFn: () => {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('typeId', typeId);
      fd.append('note', f.note);
      if (kind === 'HELPDESK') fd.append('title', f.title);
      if (kind === 'REIMBURSEMENT') {
        fd.append('amount', f.amount);
        fd.append('expenseDate', f.date);
        if (file) fd.append('file', file);
      }
      return reqApi.submit(fd);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      onDone(`${r.ref} submitted · ${r.stageLabel.replace(/^With /, '') || 'HR'} notified`);
    },
    onError: (e) => {
      setFe(fieldErrors(e));
      setErr(errorText(e));
    },
  });
  const submit = () => {
    setTried(true);
    if (localErr || !typeId) return;
    setErr(null);
    setFe({});
    m.mutate();
  };
  const shown = tried && localErr ? localErr : err;
  return (
    <Modal
      width={500}
      title={label}
      sub="You will be notified in the app"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={m.isPending || !typeId} onClick={submit}>
            Submit
          </button>
        </>
      }
    >
      {types.isLoading ? (
        <BlockLoader label="Getting the form ready…" height={160} />
      ) : list.length === 0 ? (
        <Alert>No types are switched on for this kind of request. Ask HR to set them up in Configuration → Request types.</Alert>
      ) : (
        <div className="cal-form">
          {shown && <Alert>{shown}</Alert>}
          <label className="lv-field">
            <span>Type</span>
            <select className="input sm" value={typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}>
              {list.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {kind === 'HELPDESK' && (
            <label className="lv-field">
              <span>Subject</span>
              <input className="input sm" autoFocus value={f.title} aria-invalid={tried && f.title.trim().length < 3} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </label>
          )}
          {kind === 'REIMBURSEMENT' && (
            <>
              <div className="lv-two-col">
                <label className="lv-field">
                  <span>Amount (₹)</span>
                  <input className="input sm" inputMode="numeric" value={f.amount} aria-invalid={!!fe.amount || (tried && !(Number(f.amount) > 0))} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '').slice(0, 9) })} />
                </label>
                <label className="lv-field">
                  <span>Expense date</span>
                  <input className="input sm" type="date" max={today()} value={f.date} aria-invalid={!!fe.expenseDate || (tried && !f.date)} onChange={(e) => setF({ ...f, date: e.target.value })} />
                </label>
              </div>
              <label className={`rq-file${tried && !file ? ' bad' : ''}`}>
                {Icon.plus}
                <span>{file ? file.name : 'Attach receipt (PDF or image)'}</span>
                <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </>
          )}
          <label className="lv-field">
            <span>{kind === 'LETTER' ? 'Purpose' : 'Details'}</span>
            <textarea
              className="input sm"
              rows={3}
              value={f.note}
              aria-invalid={kind === 'LETTER' && tried && f.note.trim().length < 3}
              placeholder={kind === 'LETTER' ? 'e.g. Home loan application · HDFC' : ''}
              onChange={(e) => setF({ ...f, note: e.target.value })}
            />
          </label>
        </div>
      )}
    </Modal>
  );
}

const FIELDS: [keyof Decl, string, string][] = [
  ['sec80c', '80C investments', 'PPF, ELSS, life insurance, tuition fees'],
  ['sec80d', '80D health insurance', 'Premiums for you and your family'],
  ['rentMonthly', 'Rent paid per month', 'For HRA exemption'],
  ['nps', 'NPS 80CCD(1B)', 'Your own NPS contribution'],
  ['homeLoan', 'Home-loan interest', 'Section 24(b)'],
];

function TaxForm({ toast }: { toast: (t: string) => void }) {
  const q = useQuery({ queryKey: ['requests', 'tax'], queryFn: reqApi.tax });
  const qc = useQueryClient();
  const [d, setD] = useState<Record<string, string>>({});
  const [regime, setRegime] = useState<'NEW' | 'OLD'>('NEW');
  const [fe, setFe] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return;
    setRegime(q.data.regime);
    setD(Object.fromEntries(FIELDS.map(([k]) => [k, Number(q.data[k]) ? String(q.data[k]) : ''])));
  }, [q.data]);
  const m = useMutation({
    meta: { busy: (v: unknown) => ((v as boolean) ? 'Submitting your declaration…' : 'Saving your draft…') },
    mutationFn: (submit: boolean) => reqApi.saveTax({ regime, ...Object.fromEntries(FIELDS.map(([k]) => [k, d[k] || '0'])), submit } as never),
    onSuccess: (_r, submit) => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      setFe({});
      setErr(null);
      toast(submit ? 'Declaration submitted · HR notified' : 'Draft saved');
    },
    onError: (e) => {
      setFe(fieldErrors(e));
      setErr(errorText(e));
    },
  });
  if (q.isLoading) return <BlockLoader label="Loading your declaration…" height={200} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const s = q.data;
  const locked = s.status === 'VERIFIED';
  return (
    <div className="rq-tax">
      <div className="rq-tax-head">
        <span>
          <b>Income-tax declaration · FY {s.fy}</b>
          <small>
            {s.status === 'VERIFIED'
              ? `Verified${s.decidedBy ? ` by ${s.decidedBy}` : ''} · TDS uses these figures`
              : s.status === 'SUBMITTED'
                ? `Submitted ${fmt(s.submittedAt)} · waiting for HR to verify. You can still change it.`
                : s.status === 'REJECTED'
                  ? `Sent back${s.decisionNote ? `: ${s.decisionNote}` : ''} · update it and submit again`
                  : 'Pick your regime and declare your investments; HR verifies it before payroll uses it.'}
          </small>
        </span>
        <Pill status={s.status} />
      </div>
      {err && !Object.keys(fe).length && <Alert>{err}</Alert>}
      <div className="lv-field">
        <span>Tax regime</span>
        <span className="lv-seg" role="group">
          {(
            [
              ['NEW', 'New regime'],
              ['OLD', 'Old regime'],
            ] as ['NEW' | 'OLD', string][]
          ).map(([k, l]) => (
            <button key={k} type="button" disabled={locked} aria-pressed={regime === k} onClick={() => setRegime(k)}>
              {l}
            </button>
          ))}
        </span>
        <small>{regime === 'NEW' ? 'Lower rates, no deductions. Nothing else to declare.' : 'Higher rates, but these deductions reduce your taxable income.'}</small>
      </div>
      {regime === 'OLD' && (
        <div className="rq-tax-grid">
          {FIELDS.map(([k, l, h]) => {
            const max = s.limits?.find((x) => x.key === k)?.max;
            return (
              <label key={k} className="lv-field">
                <span>{l}</span>
                <input className="input sm" inputMode="numeric" disabled={locked} value={d[k] ?? ''} aria-invalid={!!fe[k]} placeholder="0" onChange={(e) => setD({ ...d, [k]: e.target.value.replace(/[^\d.]/g, '') })} />
                {fe[k] ? <small className="err">{fe[k]}</small> : <small>{h}{max ? ` · up to ${inr(max)}` : ''}</small>}
              </label>
            );
          })}
        </div>
      )}
      {!locked && (
        <div className="rq-tax-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => m.mutate(false)}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => m.mutate(true)}>
            {s.status === 'SUBMITTED' ? 'Submit changes' : 'Submit to HR'}
          </button>
        </div>
      )}
    </div>
  );
}
