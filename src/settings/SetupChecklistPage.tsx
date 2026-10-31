import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { del, errorText, get, post } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { SettingsHead } from './SettingsLayout';
import { BlockLoader } from '../components/Splash';

type Step = { n: number; key: string; tab: string; title: string; desc: string; done: boolean; status: string; canAck: boolean };
type Setup = { done: number; total: number; pct: number; text: string; steps: Step[] };

/** Where each step's "Open" goes; steps whose page isn't built yet have no link. */
const ROUTES: Record<string, string> = {
  orgprof: '/configuration/organization',
  audit: '/configuration/organization',
  depts: '/configuration/departments',
  desigs: '/configuration/positions',
  locations: '/configuration/locations',
  etypes: '/configuration/employment-types',
};

export function SetupChecklistPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings', 'setup'], queryFn: () => get<Setup>('/org/setup') });
  const ack = useMutation({
    meta: { busy: (v: unknown) => ((v as { on: boolean }).on ? 'Marking as done…' : 'Marking as not done…') },
    mutationFn: ({ key, on }: { key: string; on: boolean }) => (on ? post<Setup>(`/org/setup/${key}/ack`) : del<Setup>(`/org/setup/${key}/ack`)),
    onSuccess: (r) => (r ? qc.setQueryData(['settings', 'setup'], r) : qc.invalidateQueries({ queryKey: ['settings', 'setup'] })),
  });

  return (
    <>
      <SettingsHead title="Setup checklist" sub="Configure the organization step by step, from company profile to roles and custom fields." />
      <PermissionsNotice errors={[q.error]} />
      {ack.error && <Alert>{errorText(ack.error)}</Alert>}
      {q.isLoading && <BlockLoader page label="Loading setup checklist…" />}
      {q.data && (
        <>
          <div className="card">
            <div className="card-body">
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b style={{ color: 'var(--fg-1)', fontWeight: 600 }}>Organization setup</b>
                <span>
                  {q.data.done} of {q.data.total} done
                </span>
              </span>
              <div className="progress">
                <i style={{ width: `${q.data.pct}%` }} />
              </div>
              <span className="field-hint">{q.data.text || 'Follow the order below — later steps use what earlier steps define. Every step can be changed later.'}</span>
            </div>
          </div>
          <div className="card">
            {q.data.steps.map((s) => (
              <div className="set-row" key={s.key}>
                <span className={`step-n${s.done ? ' done' : ''}`}>{s.done ? '✓' : s.n}</span>
                <span className="txt">
                  <b>{s.title}</b>
                  <span>{s.desc}</span>
                </span>
                <span className="step-status">{s.status}</span>
                {s.canAck && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={ack.isPending} onClick={() => ack.mutate({ key: s.key, on: !s.done })}>
                    {s.done ? 'Undo review' : 'Mark reviewed'}
                  </button>
                )}
                {ROUTES[s.tab] ? (
                  <Link className="btn btn-secondary btn-sm" to={ROUTES[s.tab]}>
                    Open
                  </Link>
                ) : (
                  <span className="btn btn-secondary btn-sm" aria-disabled="true" title="This page is coming next" style={{ opacity: 0.45, cursor: 'default' }}>
                    Open
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
