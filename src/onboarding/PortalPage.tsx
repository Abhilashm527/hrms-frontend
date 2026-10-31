import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon, Logo } from '../components/icons';
import { ThemeButton } from '../components/ThemeButton';
import { ApiError } from '../lib/http';
import { date } from '../lib/format';
import { portalApi, type HireDoc, type PortalView } from './api';
import { ConfigInput, FieldShell, fmtBytes } from './shared';
import { BlockLoader } from '../components/Splash';

const KEY = 'hrms-portal-token';

/**
 * The invite token is the new hire's only key. It is taken off the address bar on arrival and kept for this tab only
 * (sessionStorage), so a reload keeps working but it doesn't linger in history or other tabs.
 */
function usePortalToken(): string {
  const [t] = useState(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('token');
    if (fromUrl) {
      try {
        sessionStorage.setItem(KEY, fromUrl);
      } catch {
        // memory only
      }
      url.searchParams.delete('token');
      window.history.replaceState(null, '', url.pathname + url.search);
      return fromUrl;
    }
    try {
      return sessionStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  });
  return t;
}

export function PortalPage() {
  const token = usePortalToken();
  const qc = useQueryClient();
  const view = useQuery({ queryKey: ['portal', token], queryFn: () => portalApi.view(token), enabled: !!token, retry: false, refetchOnWindowFocus: false });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success' | 'info'; text: string } | null>(null);
  const [missing, setMissing] = useState<{ keys: Set<string>; docs: Set<string> }>({ keys: new Set(), docs: new Set() });

  useEffect(() => {
    document.title = 'Onboarding · Ivoyant';
  }, []);

  // Fill the form from the server, keeping what the user is still editing.
  useEffect(() => {
    if (!view.data) return;
    const next: Record<string, string> = {};
    view.data.sections.forEach((s) => s.fields.forEach((f) => (next[f.key] = f.value ?? '')));
    setVals((cur) => ({ ...next, ...Object.fromEntries([...dirty].map((k) => [k, cur[k]])) }));
  }, [view.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const put = (data: PortalView) => qc.setQueryData(['portal', token], data);

  const save = useMutation({
    meta: { busy: 'Saving your details…' },
    mutationFn: () => portalApi.save(token, Object.fromEntries([...dirty].map((k) => [k, vals[k] || null]))),
    onSuccess: (d) => {
      setDirty(new Set());
      put(d);
    },
    onError: (e) => setMsg({ kind: 'danger', text: e.message }),
  });

  const submit = useMutation({
    meta: { busy: 'Submitting your details…' },
    mutationFn: async () => {
      if (dirty.size) put(await portalApi.save(token, Object.fromEntries([...dirty].map((k) => [k, vals[k] || null]))));
      setDirty(new Set());
      return portalApi.submit(token);
    },
    onSuccess: (d) => {
      put(d);
      setMissing({ keys: new Set(), docs: new Set() });
      setMsg({ kind: 'success', text: 'Submitted. HR will review your details and documents.' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION') {
        const details = (e.extra.details as { key: string }[] | undefined) ?? [];
        const docs = (e.extra.documents as string[] | undefined) ?? [];
        setMissing({ keys: new Set(details.map((d) => d.key)), docs: new Set(docs) });
      }
      setMsg({ kind: 'danger', text: e.message });
    },
  });

  if (!token || (view.error instanceof ApiError && [401, 403, 404, 410].includes(view.error.status))) {
    return (
      <Shell>
        <div className="card" style={{ padding: 28, gap: 8 }}>
          <h1 style={{ fontSize: 20 }}>This link doesn't work</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-2)' }}>
            {view.error?.message ?? 'Open the link from your invite email. If it expired, ask HR to send a new one.'}
          </p>
        </div>
      </Shell>
    );
  }
  if (view.isLoading || !view.data) {
    return (
      <Shell>
        {view.isError ? <Alert>{view.error.message}</Alert> : <BlockLoader page label="Loading your onboarding…" />}
      </Shell>
    );
  }

  const d = view.data;
  const p = d.progress;
  const submitted = d.state !== 'NOT_SUBMITTED';

  return (
    <Shell email={d.hire.upn}>
      <div>
        <h1>Welcome to Ivoyant, {d.hire.first}</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-2)' }}>
          You join as {d.hire.title} on {date(d.hire.doj)}
          {d.hire.location ? ` at ${d.hire.location}` : ''}
          {d.hire.manager ? `, reporting to ${d.hire.manager}` : ''}.{d.hire.dueDate ? ` Please finish these steps by ${date(d.hire.dueDate)}.` : ''}
        </p>
      </div>
      <div className="card" style={{ padding: '14px 16px', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, gap: 8, flexWrap: 'wrap' }}>
          <b style={{ color: 'var(--fg-1)', fontWeight: 600 }}>
            {p.pct}% complete · {p.detailsFilled} of {p.detailsRequired} details · {p.docsDone} of {p.docsRequired} documents
          </b>
          <span style={{ color: submitted ? 'var(--success)' : 'var(--fg-3)' }}>{d.state === 'ALL_VERIFIED' ? 'All verified' : submitted ? 'Submitted · HR is reviewing' : 'Not submitted yet'}</span>
        </div>
        <div className="progress">
          <i style={{ width: `${p.pct}%` }} />
        </div>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {d.sections.map((s, si) => (
        <div className="card" key={s.name}>
          <div className="card-head">
            {si + 1} · {s.name}
          </div>
          <div className="card-body">
            <div className="form-grid">
              {s.fields.map((f) => (
                <FieldShell key={f.key} label={f.label} required={f.required} error={missing.keys.has(f.key) ? (f.required && !vals[f.key] ? 'Required' : 'Check the format') : undefined} wide={f.type.toUpperCase() === 'TEXTAREA'}>
                  <ConfigInput
                    type={f.type}
                    options={f.options}
                    value={vals[f.key] ?? ''}
                    invalid={missing.keys.has(f.key)}
                    disabled={d.state === 'ALL_VERIFIED'}
                    onChange={(v) => {
                      setVals((o) => ({ ...o, [f.key]: v }));
                      setDirty((x) => new Set(x).add(f.key));
                    }}
                  />
                  {f.help && <span className="field-hint">{f.help}</span>}
                </FieldShell>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="card">
        <div className="card-head">
          {d.sections.length + 1} · Documents
          <span className="field-hint" style={{ fontWeight: 400 }}>
            PDF, JPG or PNG · up to 6 MB
          </span>
        </div>
        {d.documents.length === 0 && <div className="card-empty">No documents needed</div>}
        {d.documents.map((doc) => (
          <DocRow key={doc.id} doc={doc} token={token} highlight={missing.docs.has(doc.id)} onDone={put} onError={(t) => setMsg({ kind: 'danger', text: t })} locked={d.state === 'ALL_VERIFIED'} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
        {dirty.size > 0 && <span className="field-hint">Unsaved changes</span>}
        <button type="button" className="btn btn-secondary" disabled={!dirty.size || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {d.state !== 'ALL_VERIFIED' && (
          <button type="button" className="btn btn-primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? 'Submitting…' : submitted ? 'Submit changes' : 'Submit for review'}
          </button>
        )}
      </div>
    </Shell>
  );
}

function DocRow({ doc, token, highlight, onDone, onError, locked }: { doc: HireDoc; token: string; highlight: boolean; onDone: (d: PortalView) => void; onError: (t: string) => void; locked: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const up = useMutation({
    meta: { busy: 'Uploading document…' },
    mutationFn: (f: File) => portalApi.upload(token, doc.id, f),
    onSuccess: onDone,
    onError: (e) => onError(`${doc.name}: ${e.message}`),
  });
  const pill = doc.status === 'VERIFIED' ? 'pill-ok' : doc.status === 'SUBMITTED' ? 'pill-info' : doc.status === 'REJECTED' ? 'pill-danger' : 'pill-muted';
  const label = doc.status === 'VERIFIED' ? 'verified' : doc.status === 'SUBMITTED' ? 'uploaded' : doc.status === 'REJECTED' ? 'please re-upload' : doc.required ? 'needed' : 'optional';
  return (
    <div className="list-row" style={highlight ? { background: 'var(--danger-bg)' } : undefined}>
      <span className={`doc-ic ${doc.status === 'VERIFIED' ? 'ok' : doc.status === 'REJECTED' ? 'bad' : doc.status === 'MISSING' ? 'none' : ''}`}>{Icon.file}</span>
      <span className="txt">
        <b>
          {doc.name}
          {doc.required && <span className="req">*</span>}
        </b>
        <span>{doc.file ? `${doc.file.name} · ${fmtBytes(doc.file.sizeBytes)}` : (doc.hint ?? '')}</span>
        {doc.status === 'REJECTED' && doc.note && <span style={{ color: 'var(--danger)' }}>{doc.note}</span>}
      </span>
      <span className={`pill ${pill}`}>{label}</span>
      {!locked && doc.status !== 'VERIFIED' && (
        <>
          <input
            ref={input}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > 6 * 1024 * 1024) return onError(`${doc.name}: the file is larger than 6 MB`);
              up.mutate(f);
            }}
          />
          <button type="button" className="btn btn-secondary btn-sm" disabled={up.isPending} onClick={() => input.current?.click()}>
            {up.isPending ? 'Uploading…' : doc.file ? 'Replace' : 'Upload'}
          </button>
        </>
      )}
    </div>
  );
}

function Shell({ children, email }: { children: ReactNode; email?: string | null }) {
  return (
    <div className="portal">
      <div className="portal-top">
        <Logo size={22} />
        <b style={{ fontSize: 14, color: 'var(--fg-1)' }}>ivoyant</b>
        <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>· Onboarding</span>
        <span style={{ flex: 1 }} />
        {email && <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>{email}</span>}
        <ThemeButton />
      </div>
      <main className="portal-main">{children}</main>
    </div>
  );
}
