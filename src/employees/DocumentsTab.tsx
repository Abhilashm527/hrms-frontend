import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { blob, errorText } from '../lib/http';
import { date } from '../lib/format';
import { fmtBytes } from '../onboarding/shared';
import { DOC_CATEGORIES, employeesApi, type EmployeeDoc, type Profile } from './api';
import { BlockLoader } from '../components/Splash';
import { say } from '../lib/busy';

const PILL: Record<string, string> = { VERIFIED: 'pill-ok', REJECTED: 'pill-danger', PENDING: 'pill-warn', SUBMITTED: 'pill-warn' };

export function DocumentsTab({ p }: { p: Profile }) {
  const qc = useQueryClient();
  const key = ['employees', 'documents', p.id];
  const docs = useQuery({ queryKey: key, queryFn: () => employeesApi.documents(p.id) });
  const prev = useQuery({ queryKey: ['employees', 'previous', p.id], queryFn: () => employeesApi.previousEmployment(p.id) });
  const [category, setCategory] = useState('Other');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const done = () => qc.invalidateQueries({ queryKey: key });

  const upload = useMutation({ meta: { busy: 'Uploading document…' }, mutationFn: (f: File) => employeesApi.uploadDocument(p.id, f, name.trim(), category), onSuccess: () => (done(), setName(''), setMsg(null)), onError: (e) => setMsg(errorText(e)) });
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: done, onError: (e) => setMsg(errorText(e)) });

  const view = async (d: EmployeeDoc) => {
    const tab = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await blob(employeesApi.docFile(p.id, d.id)));
      if (tab) tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      setMsg(errorText(e));
    }
  };

  const groups = DOC_CATEGORIES.map((c) => [c, docs.data?.filter((d) => d.category === c) ?? []] as const).filter(([, l]) => l.length);

  return (
    <>
      {msg && <Alert>{msg}</Alert>}
      {p.actions.canUploadDocs && (
        <div className="card">
          <div className="card-body" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span className="field-label">Document name</span>
              <input className="input sm" placeholder="e.g. Degree certificate" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '0 1 200px' }}>
              <span className="field-label">Category</span>
              <select className="input sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                {DOC_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <input
              ref={file}
              type="file"
              hidden
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 6 * 1024 * 1024) return setMsg('The file is larger than 6 MB');
                upload.mutate(f);
              }}
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={upload.isPending} onClick={() => file.current?.click()}>
              {Icon.download} {upload.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {docs.isLoading && <BlockLoader height={140} label="Loading documents…" />}
      {docs.data?.length === 0 && <div className="card card-empty">No documents yet</div>}
      {groups.map(([cat, list]) => (
        <div className="card" key={cat}>
          <div className="card-head">
            {cat} <span className="field-hint">{list.length}</span>
          </div>
          {list.map((d) => (
            <div className="list-row" key={d.id}>
              <span className={`doc-ic ${d.status === 'VERIFIED' ? 'ok' : d.status === 'REJECTED' ? 'bad' : ''}`}>{Icon.file}</span>
              <span className="txt">
                <b>{d.name}</b>
                <span>
                  {d.fileName} · {fmtBytes(d.size)} · {date(d.uploadedAt)}
                  {d.uploadedBy ? ` · ${d.uploadedBy}` : ''}
                  {d.source ? ` · from ${d.source.toLowerCase()}` : ''}
                </span>
                {d.note && <span style={{ color: 'var(--danger)' }}>{d.note}</span>}
              </span>
              <span className={`pill ${PILL[d.status] ?? 'pill-muted'}`}>{d.status.toLowerCase()}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => view(d)}>
                  View
                </button>
                {p.actions.canVerifyDocs && d.status !== 'VERIFIED' && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={act.isPending} onClick={() => act.mutate(say('Verifying document…', () => employeesApi.verifyDocument(p.id, d.id)))}>
                    Verify
                  </button>
                )}
                {p.actions.canVerifyDocs && d.status !== 'REJECTED' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={act.isPending}
                    onClick={() => {
                      const r = prompt(`Why is ${d.name} rejected?`);
                      if (r) act.mutate(say('Rejecting document…', () => employeesApi.rejectDocument(p.id, d.id, r)));
                    }}
                  >
                    Reject
                  </button>
                )}
                {p.actions.canUploadDocs && (
                  <button type="button" className="dfx-icon-btn" title="Delete" disabled={act.isPending} onClick={() => confirm(`Delete ${d.name}?`) && act.mutate(say('Deleting document…', () => employeesApi.deleteDocument(p.id, d.id)))}>
                    {Icon.trash}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}

      {(prev.data?.length ?? 0) > 0 && (
        <div className="card">
          <div className="card-head">Previous employment</div>
          {prev.data!.map((x, i) => (
            <div className="list-row" key={String(x.id ?? i)}>
              <span className="txt">
                <b>{String(x.company ?? x.employer ?? '—')}</b>
                <span>{[x.designation ?? x.title, x.from && x.to ? `${x.from} – ${x.to}` : null].filter(Boolean).map(String).join(' · ')}</span>
              </span>
              {x.verified != null && <span className={`pill ${x.verified ? 'pill-ok' : 'pill-muted'}`}>{x.verified ? 'verified' : 'not verified'}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
