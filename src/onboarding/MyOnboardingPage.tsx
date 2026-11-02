import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { BlockLoader } from '../components/Splash';
import { api, errorText, get } from '../lib/http';

type Task = { key: string; label: string; sub: string; done: boolean; auto: boolean; action: string | null };
type Mine = { visible: boolean; joiningDate: string | null; manager: string | null; tasks: Task[]; left: number };

const mineApi = {
  get: () => get<Mine>('/me/onboarding'),
  set: (key: string, done: boolean) => api<Mine>(`/me/onboarding/${key}`, { method: 'PATCH', body: { done } }),
};

/** Employee self-service: the new joiner's checklist for their first weeks. */
export function MyOnboardingPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'onboarding'], queryFn: mineApi.get });
  const set = useMutation({
    mutationFn: ({ key, done }: { key: string; done: boolean }) => mineApi.set(key, done),
    onSuccess: (d) => qc.setQueryData(['me', 'onboarding'], d),
  });
  if (q.isLoading) return <BlockLoader page label="Loading your checklist…" />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  if (!d.visible)
    return (
      <div className="mo-page">
        <div className="ml-top">
          <span>
            <h1>Onboarding</h1>
            <small>Your first weeks</small>
          </span>
        </div>
        <div className="ml-empty mo-card">The onboarding checklist covers your first 90 days, and yours are behind you. Welcome aboard!</div>
      </div>
    );
  const total = d.tasks.length;
  const done = total - d.left;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mo-page">
      <div className="ml-top">
        <span>
          <h1>Welcome to Ivoyant</h1>
          <small>
            Your first weeks{d.manager ? ` · manager ${d.manager}` : ''}
            {d.joiningDate ? ` · joined ${new Date(d.joiningDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </small>
        </span>
      </div>
      <div className="mo-card mo-prog">
        <span className="mo-prog-t">
          <b>Progress</b>
          <span className="ml-muted">{d.left ? `${done} of ${total} done · ${d.left} to go` : `All ${total} done`}</span>
        </span>
        <span className="ml-meter">
          <span style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success, #16A34A)' : 'var(--brand)' }} />
        </span>
      </div>
      {set.isError && <Alert>{errorText(set.error)}</Alert>}
      <div className="mo-card mo-list">
        {d.tasks.map((t) => (
          <div key={t.key} className={`mo-task${t.done ? ' done' : ''}`}>
            <button
              type="button"
              role="checkbox"
              aria-checked={t.done}
              aria-label={t.label}
              className="mo-check"
              disabled={t.auto || set.isPending}
              title={t.auto ? 'Ticks itself when it’s done' : t.done ? 'Mark as not done' : 'Mark as done'}
              onClick={() => set.mutate({ key: t.key, done: !t.done })}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
            <span className="mo-task-t">
              <b>{t.label}</b>
              <small>
                {t.sub}
                {t.auto ? ' · ticks itself when done' : ''}
              </small>
            </span>
            {t.action && !t.done && (
              <Link className="ep-link" to={t.action}>
                Open
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
