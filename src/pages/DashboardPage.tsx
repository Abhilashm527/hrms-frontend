import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/icons';
import { BlockLoader, Loader } from '../components/Splash';
import { ApiError, get } from '../lib/http';
import { date, greeting, longDate } from '../lib/format';

type Statuses = { statuses: Record<string, number> };
type Person = { id: string; name: string; initials: string; title?: string; department?: { name: string }; doj?: string; statusLabel?: string };
type Page<T> = { items: T[]; total: number };
type Hire = { id: string; name: string; first: string; last: string; title: string; department: { name: string }; doj: string; daysToJoin: number; status: string };
type Hires = Page<Hire> & { counts: { inPipeline: number; joining30: number; joiningWeek: number; attention: number } };

/** A card whose data the user may not be allowed to see: 403 hides it instead of showing an error. */
const hidden = (e: unknown) => e instanceof ApiError && (e.status === 403 || e.status === 404);

export function DashboardPage() {
  const { user, me } = useAuth();
  const admin = me?.consoleAccess ?? false;

  const people = useQuery({ queryKey: ['employees', 'filters'], queryFn: () => get<Statuses>('/employees/filters') });
  const recent = useQuery({ queryKey: ['employees', 'newest'], queryFn: () => get<Page<Person>>('/employees?sort=newest&size=5') });
  const hires = useQuery({ queryKey: ['onboarding', 'hires', '30'], queryFn: () => get<Hires>('/onboarding/hires?window=30&sort=doj&size=6'), enabled: admin });

  const st = people.data?.statuses;
  const headcount = st ? Object.values(st).reduce((a, b) => a + b, 0) : undefined;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{longDate()}</span>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
          {greeting()}, {user?.name.split(' ')[0]}
        </h1>
      </div>

      <div className="kpis">
        {!hidden(people.error) && (
          <Kpi label="Headcount" icon={Icon.users} tone="var(--brand)" loading={people.isLoading} value={headcount} sub={st && `${st.PROBATION ?? 0} on probation · ${st.NOTICE ?? 0} serving notice`} />
        )}
        {admin && !hidden(hires.error) && (
          <Kpi label="Joining in 30 days" icon={Icon.userPlus} tone="#16A34A" loading={hires.isLoading} value={hires.data?.counts.joining30} sub={hires.data && `${hires.data.counts.joiningWeek} this week · ${hires.data.counts.attention} need attention`} />
        )}
        {admin && !hidden(hires.error) && <Kpi label="In onboarding" icon={Icon.briefcase} tone="#D97706" loading={hires.isLoading} value={hires.data?.counts.inPipeline} sub="offers accepted, not yet joined" />}
        <Kpi label="Two-step" icon={Icon.shield} tone="#7C3AED" loading={!me} value={me?.security.mfaEnrolled ? 'On' : 'Off'} sub={me?.amr.includes('otp') ? 'verified this session' : 'not used this session'} />
      </div>

      <div className="grid-2">
        {!hidden(recent.error) && (
          <Card title="Recently joined" action={admin ? <Link to="/employees">All employees</Link> : <Link to="/directory">Directory</Link>} q={recent}>
            {recent.data?.items.length === 0 && <div className="card-empty">No employees yet</div>}
            {recent.data?.items.map((p) => (
              <div className="list-row" key={p.id}>
                <span className="ini">{p.initials}</span>
                <span className="txt">
                  <b>{p.name}</b>
                  <span>{[p.title, p.department?.name].filter(Boolean).join(' · ') || '—'}</span>
                </span>
                {p.doj && /^\d{4}-/.test(p.doj) && <span className="meta">{date(p.doj)}</span>}
              </div>
            ))}
          </Card>
        )}
        {admin && !hidden(hires.error) && (
          <Card title="Joining soon" action={<Link to="/onboarding">Onboarding</Link>} q={hires}>
            {hires.data?.items.length === 0 && <div className="card-empty">No one joining in the next 30 days</div>}
            {hires.data?.items.map((h) => (
              <div className="list-row" key={h.id}>
                <span className="ini">{((h.first?.[0] ?? '') + (h.last?.[0] ?? '')).toUpperCase()}</span>
                <span className="txt">
                  <b>{h.name}</b>
                  <span>{[h.title, h.department?.name].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="meta">{date(h.doj)}</span>
                <span className="pill pill-brand">{h.daysToJoin <= 0 ? 'today' : `in ${h.daysToJoin}d`}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

function Kpi({ label, icon, tone, value, sub, loading }: { label: string; icon: ReactNode; tone: string; value: ReactNode; sub?: ReactNode; loading?: boolean }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-ic" style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}>
          {icon}
        </span>
      </div>
      {loading ? (
        <span className="kpi-loading" role="status">
          <Loader size={22} label={`Loading ${label.toLowerCase()}`} />
          Loading…
        </span>
      ) : (
        <span className="kpi-val">{value ?? '—'}</span>
      )}
      <span className="kpi-sub">{loading ? ' ' : sub}</span>
    </div>
  );
}

function Card({ title, action, q, children }: { title: string; action?: ReactNode; q: { isLoading: boolean; error: Error | null; refetch: () => unknown }; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <span>{title}</span>
        {action}
      </div>
      {q.isLoading && <BlockLoader height={150} size={28} label={`Loading ${title.toLowerCase()}…`} />}
      {q.error && (
        <div className="card-empty">
          {q.error.message}{' '}
          <button type="button" className="link-btn" onClick={() => q.refetch()}>
            Retry
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
