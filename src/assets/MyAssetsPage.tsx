import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { Modal } from '../leave/ui';
import { assetApi, fmtD, type Mine } from './api';
import { Field, StateBadge } from './ui';

const RS: Record<string, [string, string]> = {
  PENDING: ['Pending', 'degraded'],
  APPROVED: ['Approved · being arranged', 'info'],
  FULFILLED: ['Handed over', 'healthy'],
  REJECTED: ['Rejected', 'failed'],
  CANCELLED: ['Cancelled', 'paused'],
};

/** Employee self-service: what I hold, and what I've asked for. */
export function MyAssetsPage() {
  const q = useQuery({ queryKey: ['assets', 'mine'], queryFn: assetApi.mine });
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const cancel = useMutation({
    meta: { busy: 'Cancelling the request…' },
    mutationFn: (id: string) => assetApi.cancelRequest(id),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['assets'] }), setToast('Request cancelled')),
    onError: (e) => setErr(errorText(e)),
  });
  return (
    <div className="rq-page">
      <div className="rq-top">
        <span>
          <h1>My assets</h1>
          <small>Hardware and software issued to you, and your requests</small>
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsking(true)}>
          {Icon.plus} Request an asset
        </button>
      </div>
      {err && <Alert>{err}</Alert>}
      {q.isLoading ? (
        <BlockLoader label="Loading your assets…" height={240} />
      ) : q.isError || !q.data ? (
        <Alert>{errorText(q.error)}</Alert>
      ) : (
        <MineView data={q.data} onCancel={(id) => cancel.mutate(id)} />
      )}
      {asking && <RequestDialog onClose={() => setAsking(false)} onDone={(m) => (setAsking(false), setToast(m))} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/** The three lists; also used read-only on an employee's profile. */
export function MineView({ data, onCancel }: { data: Mine; onCancel?: (id: string) => void }) {
  return (
    <div className="as-mine">
      <section className="as-card">
        <div className="as-card-h">
          <b>Hardware</b>
          <span className="dfx-count">{data.hardware.length}</span>
        </div>
        <div className="as-card-b">
          {data.hardware.length === 0 && <div className="as-empty sm">No hardware issued</div>}
          {data.hardware.map((h) => (
            <div key={h.id} className="as-mrow">
              <span className="as-type">{h.type}</span>
              <span className="as-two">
                <b>{h.model}</b>
                <small>
                  {h.tag} · S/N {h.serial}
                </small>
              </span>
              <span className="as-two r">
                <small>Since {fmtD(h.since)}</small>
                <small>{h.warrantyUntil ? `Warranty until ${fmtD(h.warrantyUntil)}` : 'No warranty on record'}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="as-card">
        <div className="as-card-h">
          <b>Software licenses</b>
          <span className="dfx-count">{data.licences.length}</span>
        </div>
        <div className="as-card-b">
          {data.licences.length === 0 && <div className="as-empty sm">No licenses assigned</div>}
          {data.licences.map((l) => (
            <div key={l.id} className="as-mrow">
              <span className="as-type">App</span>
              <span className="as-two">
                <b>{l.name}</b>
                <small>{l.lid}</small>
              </span>
              <span className="as-two r">
                <small>Since {fmtD(l.since)}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="as-card wide">
        <div className="as-card-h">
          <b>Requests</b>
        </div>
        <div className="as-card-b">
          {data.requests.length === 0 && <div className="as-empty sm">No requests yet</div>}
          {data.requests.map((r) => (
            <div key={r.id} className="as-mrow">
              <span className="as-type">{r.kind === 'HARDWARE' ? 'Hardware' : 'Software'}</span>
              <span className="as-two">
                <b>{r.item}</b>
                <small>
                  {fmtD(r.date)} · {r.reason}
                  {r.note ? ` · ${r.note}` : ''}
                </small>
              </span>
              <StateBadge s={{ label: RS[r.status]?.[0] ?? r.status, badge: RS[r.status]?.[1] ?? 'paused' }} />
              {onCancel && r.status === 'PENDING' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCancel(r.id)}>
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RequestDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [kind, setKind] = useState<'HARDWARE' | 'SOFTWARE'>('HARDWARE');
  const opts = useQuery({ queryKey: ['assets', 'req-opts', kind], queryFn: () => assetApi.requestOptions(kind) });
  const [item, setItem] = useState('');
  const [reason, setReason] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [fe, setFe] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const items = opts.data?.items ?? [];
  const pick = item || items[0]?.id || '';
  const m = useMutation({
    meta: { busy: 'Sending your request…' },
    mutationFn: () => assetApi.submitRequest({ kind, assetTypeId: kind === 'HARDWARE' ? pick : undefined, licenseId: kind === 'SOFTWARE' ? pick : undefined, reason: reason.trim(), fields: vals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      onDone('Request sent · your manager is notified');
    },
    onError: (e) => (setFe(fieldErrors(e)), setErr(errorText(e))),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!pick) e.item = 'Pick what you need';
    if (reason.trim().length < 3) e.reason = 'Say why you need it';
    for (const f of opts.data?.fields ?? []) if (f.required && !(vals[f.key] ?? '').trim() && f.key !== 'business_justification') e[f.key] = `${f.label} is required`;
    setFe(e);
    if (!Object.keys(e).length) m.mutate();
  };
  return (
    <Modal
      width={480}
      title="Request an asset"
      sub="Your manager approves it, then IT hands it over"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={m.isPending} onClick={submit}>
            Send request
          </button>
        </>
      }
    >
      {err && !Object.keys(fe).length && <Alert>{err}</Alert>}
      <div className="lv-field">
        <span>What kind</span>
        <span className="lv-seg" role="group">
          {(
            [
              ['HARDWARE', 'Hardware'],
              ['SOFTWARE', 'Software'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => (setKind(k), setItem(''))}>
              {l}
            </button>
          ))}
        </span>
      </div>
      <Field label={kind === 'HARDWARE' ? 'Item' : 'Application'} required error={fe.item ?? fe.assetTypeId ?? fe.licenseId}>
        <select className="input sm" value={pick} onChange={(e) => setItem(e.target.value)} disabled={!items.length}>
          {items.length === 0 && <option value="">{opts.isLoading ? 'Loading…' : 'Nothing to request'}</option>}
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Why you need it" required error={fe.reason}>
        <textarea className="input sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {(opts.data?.fields ?? [])
        .filter((f) => f.key !== 'business_justification')
        .map((f) => (
          <Field key={f.key} label={f.label} required={f.required} error={fe[f.key]} hint={f.helpText ?? undefined}>
            {f.type === 'SELECT' || f.type === 'DROPDOWN' ? (
              <select className="input sm" value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>
                <option value="">—</option>
                {(Array.isArray(f.options) ? f.options : []).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.type === 'TEXTAREA' ? (
              <textarea className="input sm" rows={2} value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            ) : (
              <input className="input sm" type={f.type === 'DATE' ? 'date' : f.type === 'NUMBER' ? 'number' : 'text'} value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            )}
          </Field>
        ))}
    </Modal>
  );
}
