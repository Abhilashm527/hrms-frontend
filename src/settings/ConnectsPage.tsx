import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { BlockLoader } from '../components/Splash';
import { get } from '../lib/http';
import { LEVELS, MODULES, SCOPES, levelOf } from '../access/api';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { usePeople } from './OrgListsPages';
import { SettingsHead } from './SettingsLayout';

type Profile = {
  id: string;
  name: string;
  initials: string;
  code: string;
  department: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  title: string | null;
  position: { id: string; name: string; grade: string | null } | null;
  manager: { id: string; name: string; title: string } | null;
  reports: { id: string; name: string }[];
  statusLabel: string;
};
type Dept = { id: string; name: string; head?: { employeeId: string; name: string } | null; parentId?: string | null };
type UserRole = { id: string; roleId: string; roleKey: string; roleName: string; scope: string };
type Perm = { module: string; action: string; scope: string };

/** Configuration → How it connects: one person traced through structure, their employee record and the access it gives them. */
export function ConnectsPage() {
  const { user } = useAuth();
  const people = usePeople();
  const [pick, setPick] = useState('');
  const id = pick || user?.employeeId || '';
  const org = useQuery({ queryKey: ['settings', 'org'], queryFn: () => get<{ name: string; legalName?: string; counts?: Record<string, number> }>('/org'), staleTime: 5 * 60_000 });
  const profile = useQuery({ queryKey: ['connects', 'profile', id], queryFn: () => get<Profile>(`/employees/${id}/profile`), enabled: !!id });
  const chain = useQuery({ queryKey: ['connects', 'chain', id], queryFn: () => get<{ chain: { id: string; name: string; title: string }[]; directReports: number }>(`/employees/${id}/chain`), enabled: !!id });
  const groups = useQuery({ queryKey: ['connects', 'groups', id], queryFn: () => get<{ teams: { id: string; name: string; primary: boolean }[]; projects: { id: string; name: string; allocation: number }[] }>(`/employees/${id}/groups`), enabled: !!id });
  const depts = useQuery({ queryKey: ['connects', 'departments'], queryFn: () => get<Dept[]>('/departments'), staleTime: 5 * 60_000 });
  const relations = useQuery({ queryKey: ['connects', 'relations', id], queryFn: () => get<{ items: { type: string; typeLabel: string; related: { name: string }; status: string }[] }>(`/relations?employeeId=${id}`), enabled: !!id, retry: false });
  const users = useQuery({ queryKey: ['access', 'users'], queryFn: () => get<{ id: string; employeeId: string }[]>('/users'), staleTime: 60_000, retry: false });
  const userId = users.data?.find((u) => u.employeeId === id)?.id;
  const roles = useQuery({ queryKey: ['connects', 'roles', userId], queryFn: () => get<UserRole[]>(`/users/${userId}/roles`), enabled: !!userId, retry: false });
  const perms = useQueries({ queries: (roles.data ?? []).map((r) => ({ queryKey: ['access', 'perms', r.roleId], queryFn: () => get<Perm[]>(`/roles/${r.roleId}/permissions`), staleTime: 60_000 })) });

  const p = profile.data;
  const dept = depts.data?.find((d) => d.id === p?.department?.id);
  const path: string[] = [];
  for (let d = dept, n = 0; d && n < 6; d = depts.data?.find((x) => x.id === d!.parentId), n++) path.unshift(d.name);
  const isHead = !!dept?.head && dept.head.employeeId === id;
  const reports = chain.data?.directReports ?? p?.reports.length ?? 0;

  // Strongest grant per module across the person's roles.
  const best = new Map<string, { lv: number; scope: string }>();
  perms.forEach((q) =>
    (q.data ?? []).forEach((x) => {
      const lv = levelOf(x.action);
      const cur = best.get(x.module);
      if (!cur || lv > cur.lv) best.set(x.module, { lv, scope: x.scope });
    }),
  );
  const grants = MODULES.map((m) => ({ ...m, g: best.get(m.key) })).filter((m) => m.g && m.g.lv > 0);
  const scopeLabel = (s: string) => SCOPES.find((x) => x.value === s)?.label ?? s;
  const why = [
    reports > 0 && `Has ${reports} direct ${reports === 1 ? 'report' : 'reports'} → approves their leave and requests`,
    isHead && `Heads ${dept!.name} → department-head approvals`,
    ...(roles.data ?? []).filter((r) => r.roleKey !== 'employee').map((r) => `Assigned ${r.roleName} (${scopeLabel(r.scope).toLowerCase()})`),
  ].filter(Boolean) as string[];
  const dotted = (relations.data?.items ?? []).filter((r) => r.status !== 'ENDED');
  const loading = !!id && (profile.isLoading || chain.isLoading);

  return (
    <>
      <SettingsHead title="How it connects" sub="How the organization, people, teams, roles and permissions link — traced for one person." />
      <PermissionsNotice errors={[profile.error]} />
      <div className="lv-bar">
        <span className="field-hint">Trace one person:</span>
        <select className="sel" value={id} onChange={(e) => setPick(e.target.value)} aria-label="Person">
          {(people.data ?? []).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
        {user?.employeeId && id !== user.employeeId && (
          <button type="button" className="lv-fchip" onClick={() => setPick(user.employeeId)}>
            Me
          </button>
        )}
      </div>
      {loading && <BlockLoader page label="Tracing…" />}
      {p && (
        <>
          <div className="hc-grid">
            <div className="hc-col">
              <Step n={1} title="Structure" sub="Where they sit — set once in Organisation" />
              <Node label="Organization" to="/configuration/organization" main={org.data?.legalName ?? org.data?.name ?? '—'} sub={p.location ? `Works from ${p.location.name}` : undefined} />
              <Arrow text="has nested" />
              <Node label="Department" to="/configuration/departments" main={path.length ? path.join(' › ') : (p.department?.name ?? 'No department')} sub={dept?.head ? `Head: ${dept.head.name}${isHead ? ' (them)' : ''}` : 'No head set'} />
              <Arrow text="groups people into" />
              <Node
                label="Teams & projects"
                to="/configuration/teams"
                main={groups.data?.teams.length ? groups.data.teams.map((t) => `${t.primary ? '★ ' : ''}${t.name}`).join(', ') : 'No team'}
                sub={groups.data?.projects.length ? groups.data.projects.map((x) => `${x.name} ${x.allocation}%`).join(', ') : 'No projects'}
              />
              <Arrow text="job is described by" />
              <Node label="Title → Position" links={[['Titles', '/configuration/titles'], ['Positions', '/configuration/positions']]} main={p.title ?? 'No title'} sub={p.position ? `${p.position.name}${p.position.grade ? ` · ${p.position.grade}` : ''}` : 'No position'} />
              <Arrow text="reports through" />
              <Node
                label="Reporting lines"
                links={[
                  ['Managers', '/configuration/reporting-lines'],
                  ['Dotted & mentors', '/configuration/relations'],
                ]}
                main={p.manager ? `Reports to ${p.manager.name}` : 'No manager (top of the chart)'}
                sub={chain.data?.chain.length ? `Chain: ${chain.data.chain.map((c) => c.name).join(' › ')}` : undefined}
                extra={[`${reports} direct ${reports === 1 ? 'report' : 'reports'}`, ...dotted.map((r) => `${r.typeLabel}: ${r.related.name}`)]}
              />
            </div>
            <div className="hc-col">
              <Step n={2} title="Employee" sub="One record pulls all of it together" />
              <div className="hc-node hc-emp">
                <div className="lv-who">
                  <span className="avatar-ini" style={{ width: 40, height: 40, fontSize: 14 }}>
                    {p.initials}
                  </span>
                  <span className="lv-two">
                    <b style={{ fontSize: 14 }}>{p.name}</b>
                    <span>
                      {p.code} · {p.statusLabel}
                    </span>
                  </span>
                </div>
                {(
                  [
                    ['Department', p.department?.name, 'Departments', '/configuration/departments'],
                    ['Title', p.title, 'Titles', '/configuration/titles'],
                    ['Position', p.position?.name, 'Positions', '/configuration/positions'],
                    ['Manager', p.manager?.name, 'Reporting lines', '/configuration/reporting-lines'],
                    ['Location', p.location?.name, 'Locations', '/configuration/locations'],
                  ] as const
                ).map(([k, v, from, to]) => (
                  <div key={k} className="hc-rec">
                    <span>{k}</span>
                    <span>
                      <b>{v ?? '—'}</b>
                      <Link to={to}>from {from} →</Link>
                    </span>
                  </div>
                ))}
              </div>
              <Arrow text="structure decides automatic roles" />
              <div className="hc-node">
                <span className="lv-cap">Why they have these roles</span>
                {why.map((w) => (
                  <span key={w} className="hc-why">
                    {w}
                  </span>
                ))}
                <span className="hc-why">Everyone → Employee role</span>
              </div>
            </div>
            <div className="hc-col">
              <Step n={3} title="Access" sub="What they can do — from roles" />
              <Node
                label="Roles"
                links={[
                  ['Roles', '/settings/roles'],
                  ['Assignments', '/settings/assignments'],
                ]}
              >
                {roles.isLoading && <span className="field-hint">Loading…</span>}
                {roles.isError && <span className="field-hint">Your role can't see role assignments.</span>}
                {(roles.data ?? []).map((r) => (
                  <div key={r.id} className="hc-role">
                    <i />
                    <span className="lv-two">
                      <b>{r.roleName}</b>
                      <span>{r.roleKey === 'employee' ? 'Everyone' : `Assigned · ${scopeLabel(r.scope)}`}</span>
                    </span>
                  </div>
                ))}
              </Node>
              <Arrow text="grant access level × scope" />
              <Node label="Permissions" links={[['Full breakdown', '/settings/effective']]}>
                {grants.length === 0 && !roles.isLoading && <span className="field-hint">Only their own records</span>}
                {grants.map((g) => (
                  <div key={g.key} className="hc-perm">
                    <span>{g.label}</span>
                    <b>
                      {LEVELS[g.g!.lv].label} · {scopeLabel(g.g!.scope)}
                    </b>
                  </div>
                ))}
              </Node>
              <Arrow text="narrowed by" />
              <Node label="Field security & conditions" to="/settings/field-security" main="Each field is hidden, masked, view or edit per role" sub="Own record and others' records are set separately" />
            </div>
          </div>
          <div className="hc-result">
            <span className="lv-two">
              <b>Result</b>
              <span>What {p.name.split(' ')[0]} gets</span>
            </span>
            <div className="hc-res">
              <Res k="Approves for" v={reports ? `${reports} ${reports === 1 ? 'person' : 'people'}` : 'Nobody'} />
              <Res k="Modules" v={grants.length ? `${grants.length} beyond self-service` : 'Self-service only'} />
              <Res k="Teams" v={String(groups.data?.teams.length ?? 0)} />
              <Res k="Allocated" v={`${(groups.data?.projects ?? []).reduce((a, x) => a + x.allocation, 0)}%`} />
              <Res k="Chain" v={`${(chain.data?.chain.length ?? 0) + 1} levels`} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Step({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="hc-step">
      <span>
        <i>{n}</i>
        <b>{title}</b>
      </span>
      <small>{sub}</small>
    </div>
  );
}
function Arrow({ text }: { text: string }) {
  return (
    <div className="hc-arrow">
      <span />
      <small>↓ {text}</small>
    </div>
  );
}
function Node({ label, to, links, main, sub, extra, children }: { label: string; to?: string; links?: [string, string][]; main?: string; sub?: string; extra?: string[]; children?: ReactNode }) {
  return (
    <div className="hc-node">
      <div className="hc-node-head">
        <span className="lv-cap">{label}</span>
        <span className="hc-links">
          {to && <Link to={to}>Open</Link>}
          {links?.map(([l, h]) => (
            <Link key={h} to={h}>
              {l}
            </Link>
          ))}
        </span>
      </div>
      {main && <b className="hc-main">{main}</b>}
      {sub && <span className="hc-sub">{sub}</span>}
      {extra?.map((x) => (
        <span key={x} className="hc-sub">
          {x}
        </span>
      ))}
      {children}
    </div>
  );
}
function Res({ k, v }: { k: string; v: string }) {
  return (
    <span className="hc-res-item">
      <small>{k}</small>
      <b>{v}</b>
    </span>
  );
}
