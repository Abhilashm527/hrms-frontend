import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, get } from '../lib/http';

type Person = { id: string; code: string; name: string; initials: string; title: string | null; department: { id: string; name: string; color: number } | null; managerId: string | null; photoUrl: string; location: string | null };
type Dept = { id: string; name: string; parentId: string | null; head: { id: string; name: string } | null; count: number; color: number };
type Chart = { people: Person[]; departments: Dept[]; canSeeGroups: boolean };
type TeamView = { id: string; name: string; department: { name: string; color: number } | null; lead: { name: string } | null; memberCount: number; members: { id: string; name: string; initials: string; title: string | null }[] };
type ProjView = { stats: { projects: number; multiProject: number; overAllocated: number }; projects: { id: string; code: string; name: string; status: string; client: string | null; manager: { name: string } | null; memberCount: number; fte: number; members: { id: string; name: string; initials: string; role: string; allocation: number; total?: number }[] }[] };

/** Department colours, the same eight the rest of the app uses. */
const DC = ['#2563EB', '#7C3AED', '#0F766E', '#B45309', '#DB2777', '#15803D', '#DC2626', '#475569'];
type View = 'tree' | 'departments' | 'teams' | 'projects';

export function OrgChartPage() {
  const [sp, setSp] = useSearchParams();
  const view = (sp.get('view') as View) || 'tree';
  const q = useQuery({ queryKey: ['org', 'chart'], queryFn: () => get<Chart>('/org/chart') });
  const views: [View, string][] = [
    ['tree', 'Reporting tree'],
    ['departments', 'Departments'],
    ...(q.data?.canSeeGroups
      ? ([
          ['teams', 'Teams'],
          ['projects', 'Projects'],
        ] as [View, string][])
      : []),
  ];
  return (
    <div className="oc-page">
      <div className="ml-top">
        <span>
          <h1>Org chart</h1>
          <small>{q.data ? `${q.data.people.length} people · ${q.data.departments.length} departments` : 'Who reports to whom'}</small>
        </span>
        <span className="seg lg" role="tablist" aria-label="View">
          {views.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} aria-pressed={view === k} onClick={() => setSp(k === 'tree' ? {} : { view: k })}>
              {l}
            </button>
          ))}
        </span>
      </div>
      {q.isLoading ? (
        <BlockLoader page label="Drawing the org chart…" />
      ) : q.isError || !q.data ? (
        <Alert>{errorText(q.error)}</Alert>
      ) : view === 'departments' ? (
        <Departments c={q.data} />
      ) : view === 'teams' && q.data.canSeeGroups ? (
        <Teams />
      ) : view === 'projects' && q.data.canSeeGroups ? (
        <Projects />
      ) : (
        <Tree c={q.data} />
      )}
    </div>
  );
}

// ====================================================================== reporting tree

function Avatar({ p, size = 34 }: { p: Pick<Person, 'initials' | 'photoUrl' | 'department'>; size?: number }) {
  const [ok, setOk] = useState(true);
  const c = DC[p.department?.color ?? 7];
  return (
    <span className="oc-av" style={{ width: size, height: size, background: c + '22', color: c }}>
      {p.initials}
      {ok && <img src={p.photoUrl} alt="" loading="lazy" onError={() => setOk(false)} />}
    </span>
  );
}

function Tree({ c }: { c: Chart }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(c.people.map((p) => [p.id, p])), [c.people]);
  const kids = useMemo(() => {
    const m = new Map<string | null, Person[]>();
    for (const p of c.people) {
      // someone whose manager has left or is missing sits at the top
      const parent = p.managerId && byId.has(p.managerId) && p.managerId !== p.id ? p.managerId : null;
      if (!m.has(parent)) m.set(parent, []);
      m.get(parent)!.push(p);
    }
    return m;
  }, [c.people, byId]);
  const subCount = useMemo(() => {
    const memo = new Map<string, number>();
    const count = (id: string, seen = new Set<string>()): number => {
      if (memo.has(id)) return memo.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const n = (kids.get(id) ?? []).reduce((a, k) => a + 1 + count(k.id, seen), 0);
      memo.set(id, n);
      return n;
    };
    c.people.forEach((p) => count(p.id));
    return memo;
  }, [c.people, kids]);

  // roots: the top of the company, or the top people of the chosen department
  const roots = useMemo(() => {
    if (dept === 'all') return kids.get(null) ?? [];
    return c.people.filter((p) => p.department?.id === dept && !(p.managerId && byId.get(p.managerId)?.department?.id === dept));
  }, [dept, c.people, kids, byId]);

  // first open: the first two levels
  useEffect(() => {
    setOpen(new Set(roots.flatMap((r) => [r.id])));
  }, [roots]);

  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => (needle ? c.people.filter((p) => `${p.name} ${p.title ?? ''} ${p.code}`.toLowerCase().includes(needle)) : []), [needle, c.people]);
  // searching opens the path to every match
  useEffect(() => {
    if (!hits.length) return;
    setOpen((o) => {
      const n = new Set(o);
      for (const h of hits) {
        let m = h.managerId;
        const seen = new Set<string>();
        while (m && byId.has(m) && !seen.has(m)) {
          n.add(m);
          seen.add(m);
          m = byId.get(m)!.managerId;
        }
      }
      return n;
    });
    const t = setTimeout(() => document.querySelector('.oc-node.hit')?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }), 80);
    return () => clearTimeout(t);
  }, [hits, byId]);

  const toggle = (id: string) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const hitIds = new Set(hits.map((h) => h.id));

  const node = (p: Person, seen: Set<string>): ReactNode => {
    const ch = kids.get(p.id) ?? [];
    const isOpen = open.has(p.id) && !seen.has(p.id);
    const next = new Set(seen).add(p.id);
    return (
      <li key={p.id}>
        <div className={`oc-node${hitIds.has(p.id) ? ' hit' : ''}`} style={{ borderTopColor: DC[p.department?.color ?? 7] }}>
          <button type="button" className="oc-card" onClick={() => nav(`/employees/${p.id}`)} title={`${p.name}${p.title ? ` · ${p.title}` : ''}`}>
            <Avatar p={p} />
            <span className="oc-card-t">
              <b>{p.name}</b>
              <small>{p.title ?? '—'}</small>
              <small className="oc-dept">{p.department?.name ?? 'No department'}</small>
            </span>
          </button>
          {ch.length > 0 && (
            <button type="button" className="oc-tog" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} ${p.name}'s team`} onClick={() => toggle(p.id)}>
              {isOpen ? '−' : `${ch.length}${(subCount.get(p.id) ?? 0) > ch.length ? ` · ${subCount.get(p.id)}` : ''}`}
            </button>
          )}
        </div>
        {isOpen && ch.length > 0 && <ul>{ch.map((k) => node(k, next))}</ul>}
      </li>
    );
  };

  return (
    <>
      <div className="oc-tools">
        <label className="search-in oc-search">
          {Icon.search}
          <input placeholder="find a person…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a person" />
        </label>
        <select className="input sm oc-sel" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="all">Whole company</option>
          {c.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {needle && <span className="ml-muted">{hits.length ? `${hits.length} match${hits.length > 1 ? 'es' : ''}` : 'Nobody matches'}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(new Set(c.people.map((p) => p.id)))}>
          Expand all
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(new Set())}>
          Collapse all
        </button>
        <span className="oc-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}>
            −
          </button>
          <button type="button" title="Reset zoom" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))}>
            +
          </button>
        </span>
      </div>
      <div className="oc-canvas">
        <div className="oc-zoomer" style={{ transform: `scale(${zoom})` }}>
          {roots.length ? <ul className="oc-tree">{roots.map((r) => node(r, new Set()))}</ul> : <div className="ml-empty">Nobody here yet</div>}
        </div>
      </div>
      <span className="ml-muted">
        Click a person to open their profile. Reporting lines are changed in <Link to="/configuration/reporting-lines">Configuration → Reporting lines</Link>.
      </span>
    </>
  );
}

// ====================================================================== departments

function Departments({ c }: { c: Chart }) {
  const kids = useMemo(() => {
    const m = new Map<string | null, Dept[]>();
    const ids = new Set(c.departments.map((d) => d.id));
    for (const d of c.departments) {
      const p = d.parentId && ids.has(d.parentId) ? d.parentId : null;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(d);
    }
    return m;
  }, [c.departments]);
  const people = useMemo(() => {
    const m = new Map<string, Person[]>();
    c.people.forEach((p) => p.department && (m.get(p.department.id) ?? m.set(p.department.id, []).get(p.department.id)!).push(p));
    return m;
  }, [c.people]);
  const [open, setOpen] = useState<string | null>(null);
  const card = (d: Dept, depth: number): ReactNode => (
    <div key={d.id} className="oc-dcard-wrap" style={{ marginLeft: depth * 24 }}>
      <button type="button" className="oc-dcard" aria-expanded={open === d.id} onClick={() => setOpen(open === d.id ? null : d.id)} style={{ borderLeftColor: DC[d.color] }}>
        <span className="oc-dcard-t">
          <b>{d.name}</b>
          <small>
            {d.head ? `Head · ${d.head.name}` : 'No head set'} · {d.count} {d.count === 1 ? 'person' : 'people'}
          </small>
        </span>
        <span className="ml-muted">{open === d.id ? '▾' : '▸'}</span>
      </button>
      {open === d.id && (
        <div className="oc-members">
          {(people.get(d.id) ?? []).map((p) => (
            <Link key={p.id} to={`/employees/${p.id}`} className="oc-member">
              <Avatar p={p} size={28} />
              <span>
                <b>{p.name}</b>
                <small>{p.title ?? '—'}</small>
              </span>
            </Link>
          ))}
          {!(people.get(d.id) ?? []).length && <span className="ml-muted">Nobody in this department yet</span>}
        </div>
      )}
      {(kids.get(d.id) ?? []).map((k) => card(k, depth + 1))}
    </div>
  );
  return <div className="oc-depts">{(kids.get(null) ?? []).map((d) => card(d, 0))}</div>;
}

// ====================================================================== teams & projects

function Teams() {
  const q = useQuery({ queryKey: ['org', 'teams-view'], queryFn: () => get<TeamView[]>('/org/teams-view') });
  if (q.isLoading) return <BlockLoader label="Loading teams…" height={200} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  return (
    <div className="oc-groups">
      {q.data.map((t) => (
        <section key={t.id} className="oc-group">
          <header>
            <b>{t.name}</b>
            <span className="ml-muted">{t.memberCount}</span>
          </header>
          <small className="ml-muted oc-group-sub">
            {t.department ? <span style={{ color: DC[t.department.color] }}>{t.department.name}</span> : 'No department'} · led by {t.lead?.name ?? 'nobody yet'}
          </small>
          <div className="oc-members">
            {t.members.map((m) => (
              <Link key={m.id} to={`/employees/${m.id}`} className="oc-member">
                <span className="oc-av" style={{ width: 28, height: 28 }}>
                  {m.initials}
                </span>
                <span>
                  <b>{m.name}</b>
                  <small>{m.title ?? '—'}</small>
                </span>
              </Link>
            ))}
            {!t.members.length && (
              <span className="ml-muted">
                No members yet · add people in <Link to="/configuration/reporting-lines">Reporting lines</Link>
              </span>
            )}
          </div>
        </section>
      ))}
      {!q.data.length && <div className="ml-empty">No teams yet. Add them in Configuration → Teams.</div>}
    </div>
  );
}

function Projects() {
  const q = useQuery({ queryKey: ['org', 'projects-view'], queryFn: () => get<ProjView>('/org/projects-view') });
  if (q.isLoading) return <BlockLoader label="Loading projects…" height={200} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const s = q.data.stats;
  return (
    <>
      <span className="ml-muted">
        {s.projects} projects · {s.multiProject} people on more than one · {s.overAllocated} over-allocated. Members and allocations are set in{' '}
        <Link to="/configuration/reporting-lines">Reporting lines</Link>; projects in <Link to="/configuration/projects">Configuration → Projects</Link>.
      </span>
      <div className="oc-groups">
        {q.data.projects.map((p) => (
          <section key={p.id} className="oc-group">
            <header>
              <span className="mono ml-muted">{p.code}</span>
              <b>{p.name}</b>
              <span className={`pill no-dot ${p.status === 'ACTIVE' ? 'pill-ok' : p.status === 'PLANNED' ? 'pill-info' : 'pill-muted'}`}>{p.status.toLowerCase()}</span>
            </header>
            <small className="ml-muted oc-group-sub">
              {p.client ?? 'Internal'} · PM {p.manager?.name ?? '—'} · {p.memberCount} {p.memberCount === 1 ? 'person' : 'people'} · {p.fte} FTE
            </small>
            <div className="oc-members">
              {p.members.map((m) => (
                <Link key={m.id} to={`/employees/${m.id}`} className="oc-member">
                  <span className="oc-av" style={{ width: 28, height: 28 }}>
                    {m.initials}
                  </span>
                  <span>
                    <b>{m.name}</b>
                    <small>
                      {m.role.toLowerCase()} · {m.allocation}%{m.total != null && m.total > 100 ? <span style={{ color: 'var(--danger-fg)' }}> · {m.total}% in total</span> : null}
                    </small>
                  </span>
                </Link>
              ))}
              {!p.members.length && <span className="ml-muted">No one assigned yet</span>}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
