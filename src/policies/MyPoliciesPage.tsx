import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { downloadPdf, fmtD, polApi } from './api';
import { CatChip, Reader } from './PoliciesPage';

/** Employee self-service: read each policy and acknowledge the current version. */
export function MyPoliciesPage() {
  const [sp, setSp] = useSearchParams();
  const open = sp.get('open');
  return open ? <ReadPolicy key={open} id={open} onBack={() => setSp({})} /> : <PolicyList onOpen={(id) => setSp({ open: id })} />;
}

function PolicyList({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useQuery({ queryKey: ['policies', 'mine'], queryFn: polApi.mine });
  const [search, setSearch] = useState('');
  const [only, setOnly] = useState(false);
  if (q.isLoading) return <BlockLoader page label="Loading policies…" />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const needle = search.trim().toLowerCase();
  const rows = q.data.items.filter((p) => (!only || p.needsAck) && (!needle || `${p.name} ${p.category.name}`.toLowerCase().includes(needle)));
  return (
    <div className="po-page po-ess">
      <div className="po-top">
        <span>
          <h1>Policies</h1>
          <small>Read each policy and acknowledge the current version</small>
        </span>
      </div>
      {q.data.pending > 0 && (
        <div className="po-banner po-banner-ess">
          <b>
            {q.data.pending} polic{q.data.pending === 1 ? 'y needs' : 'ies need'} your acknowledgement
          </b>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOnly((o) => !o)}>
            {only ? 'Show all' : 'Show only these'}
          </button>
        </div>
      )}
      <label className="search-in po-search">
        {Icon.search}
        <input placeholder="search policies…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search policies" />
      </label>
      <div className="po-ess-list">
        {rows.map((p) => (
          <button key={p.id} type="button" className="po-ess-row" onClick={() => onOpen(p.id)}>
            <span className="po-ess-t">
              <b>{p.name}</b>
              <small>
                <CatChip c={p.category} /> v{p.version} · effective {fmtD(p.effective)}
              </small>
            </span>
            {p.ackRequired ? (
              p.needsAck ? (
                <span className="pill pill-warn">To acknowledge</span>
              ) : (
                <span className="pill pill-ok">Acknowledged {p.acknowledgedAt ? fmtD(p.acknowledgedAt) : ''}</span>
              )
            ) : (
              <span className="po-muted" style={{ fontSize: 12 }}>
                For information
              </span>
            )}
            {Icon.chevR}
          </button>
        ))}
        {rows.length === 0 && <div className="po-empty">{q.data.items.length ? 'Nothing matches' : 'No policies have been published yet'}</div>}
      </div>
    </div>
  );
}

function ReadPolicy({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['policies', 'read', id], queryFn: () => polApi.read(id) });
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const ack = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: () => polApi.acknowledge(id),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ['policies'] }), setToast(`Acknowledged v${r.version}`)),
    onError: (e) => setErr(errorText(e)),
  });
  if (q.isLoading) return <BlockLoader page label="Loading the policy…" />;
  if (q.isError || !q.data) return (
    <div className="po-page po-ess">
      <button type="button" className="ep-link" onClick={onBack}>
        {Icon.chevL} All policies
      </button>
      <Alert>{errorText(q.error)}</Alert>
    </div>
  );
  const p = q.data;
  return (
    <div className="po-page po-ess">
      <div className="po-read-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          {Icon.chevL} All policies
        </button>
        <span className="po-ess-t" style={{ flex: 1 }}>
          <b style={{ fontSize: 16 }}>{p.name}</b>
          <small>
            <CatChip c={p.category} /> v{p.version} · effective {fmtD(p.effective)}
            {p.owner ? ` · owner ${p.owner}` : ''}
          </small>
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadPdf(p.id, p.name).catch((e) => setErr(errorText(e)))}>
          {Icon.download} Download
        </button>
        {p.ackRequired &&
          (p.acknowledgedAt ? (
            <span className="pill pill-ok">Acknowledged {fmtD(p.acknowledgedAt)}</span>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={ack.isPending} onClick={() => ack.mutate()}>
              I have read and acknowledge
            </button>
          ))}
      </div>
      {err && <Alert>{err}</Alert>}
      {p.note && p.version !== '1.0' && <div className="po-whatsnew">What changed in v{p.version}: {p.note}</div>}
      <Reader sections={p.sections} />
      {p.ackRequired && !p.acknowledgedAt && (
        <div className="po-ack-foot">
          <span>By acknowledging you confirm you have read v{p.version} and will follow it.</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={ack.isPending} onClick={() => ack.mutate()}>
            I have read and acknowledge
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
