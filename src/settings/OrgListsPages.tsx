import { useQuery } from '@tanstack/react-query';
import { api, del, get, post } from '../lib/http';
import { useDepartments } from '../onboarding/shared';
import { ListEditor, toBody } from './ListEditor';

const s = (v: unknown) => (v == null ? '' : String(v));
const ifMatch = (v: number) => ({ 'If-Match': `"${v}"` });
const crud = (base: string) => ({
  create: (b: Record<string, unknown>) => post<unknown>(base, b),
  update: (id: string, b: Record<string, unknown>, v: number) => api<unknown>(`${base}/${id}`, { method: 'PATCH', body: b, headers: ifMatch(v) }),
  remove: (id: string) => del<void>(`${base}/${id}`),
});

/** Everyone who can lead a team or manage a project. */
export function usePeople() {
  return useQuery({
    queryKey: ['lookup', 'people-all'],
    queryFn: () => get<{ items: { id: string; name: string }[] }>('/employees?size=200&sort=name'),
    staleTime: 5 * 60_000,
    select: (d) => d.items.map((p) => [p.id, p.name] as [string, string]),
  });
}
function usePositions() {
  return useQuery({
    queryKey: ['lookup', 'positions-all'],
    queryFn: () => get<{ id: string; name: string; grade: string | null; active: boolean }[]>('/positions'),
    staleTime: 5 * 60_000,
    select: (d) => d.map((p) => [p.id, p.grade ? `${p.name} · ${p.grade}` : p.name] as [string, string]),
  });
}
const useDeptOptions = () => (useDepartments().data ?? []).map((d) => [d.id, d.name] as [string, string]);

// ------------------------------------------------------------------ titles

type Title = { id: string; name: string; code: string | null; position?: { id: string; name: string }; department?: { id: string }; description?: string | null; active: boolean; headcount?: number; bandText?: string; version: number };
type TitleRow = { id: string; version: number; name: string; code: string; positionId: string; departmentId: string; description: string; active: boolean; headcount: number; band: string };
const titles = crud('/titles');

export function TitlesPage() {
  const positions = usePositions();
  const depts = useDeptOptions();
  return (
    <ListEditor<Title, TitleRow>
      title="Titles"
      sub="Job titles people hold. Each maps to one position, which sets its level and salary band."
      card="Organisation · Titles"
      desc="Leave Department blank for titles used across departments."
      addLabel="Add title"
      empty="No titles yet. Add the job titles people hold."
      queryKey={['settings', 'titles']}
      list={() => get<Title[]>('/titles?include=stats')}
      toRow={(t) => ({ id: t.id, version: t.version, name: t.name, code: s(t.code), positionId: s(t.position?.id), departmentId: s(t.department?.id), description: s(t.description), active: t.active, headcount: t.headcount ?? 0, band: s(t.bandText) })}
      blank={() => ({ name: '', code: '', positionId: '', departmentId: '', description: '', active: true, headcount: 0, band: '' })}
      cols={[
        { key: 'name', label: 'Title', kind: 'text', placeholder: 'e.g. Senior Software Engineer' },
        { key: 'code', label: 'Code', kind: 'mono', width: 80 },
        { key: 'positionId', label: 'Position', kind: 'select', options: positions.data ?? [] },
        { key: 'departmentId', label: 'Department', kind: 'select', options: depts, none: 'All departments' },
        { key: 'description', label: 'Responsibilities', kind: 'text', placeholder: 'Optional' },
        { key: 'active', label: 'Active', kind: 'toggle' },
      ]}
      body={(r) => toBody(r, { skip: ['headcount', 'band'] })}
      create={titles.create}
      update={titles.update}
      remove={(r) => titles.remove(r.id)}
      removeHint="Only possible when nobody holds it."
      extra={{ label: 'Used by', render: (r) => (r.isNew ? '' : `${r.headcount} ${r.headcount === 1 ? 'person' : 'people'}${r.band ? ` · ${r.band}` : ''}`) }}
      refresh={[['lookup', 'titles']]}
      saving="Saving titles…"
    />
  );
}

// ------------------------------------------------------------------ teams

type Team = { id: string; name: string; department?: { id: string }; lead?: { employeeId: string }; memberCount?: number; active: boolean; version: number };
type TeamRow = { id: string; version: number; name: string; departmentId: string; leadEmployeeId: string; active: boolean; members: number };
const teams = crud('/teams');

export function TeamsPage() {
  const people = usePeople();
  const depts = useDeptOptions();
  return (
    <ListEditor<Team, TeamRow>
      title="Teams"
      sub="Functional teams inside departments."
      card="Organisation · Teams"
      desc="The lead is the default manager for team members. For cross-functional work use Projects."
      addLabel="Add team"
      empty="No teams yet."
      queryKey={['settings', 'teams']}
      list={() => get<Team[]>('/teams?include=stats')}
      toRow={(t) => ({ id: t.id, version: t.version, name: t.name, departmentId: s(t.department?.id), leadEmployeeId: s(t.lead?.employeeId), active: t.active, members: t.memberCount ?? 0 })}
      blank={() => ({ name: '', departmentId: '', leadEmployeeId: '', active: true, members: 0 })}
      cols={[
        { key: 'name', label: 'Team', kind: 'text', placeholder: 'e.g. Platform' },
        { key: 'departmentId', label: 'Department', kind: 'select', options: depts },
        { key: 'leadEmployeeId', label: 'Team lead', kind: 'select', options: people.data ?? [], none: 'No lead' },
        { key: 'active', label: 'Active', kind: 'toggle' },
      ]}
      body={(r) => toBody(r, { skip: ['members'] })}
      create={teams.create}
      update={teams.update}
      remove={(r) => teams.remove(r.id)}
      removeHint="Members are taken off the team."
      extra={{ label: 'Members', render: (r) => (r.isNew ? '' : `${r.members} ${r.members === 1 ? 'member' : 'members'}`) }}
      refresh={[['lookup', 'teams']]}
      saving="Saving teams…"
    />
  );
}

// ------------------------------------------------------------------ projects

type Project = { id: string; name: string; code: string | null; client: string | null; manager?: { employeeId: string }; status: string; memberCount?: number; allocatedPct?: number; active: boolean; version: number };
type ProjectRow = { id: string; version: number; name: string; code: string; client: string; ownerEmployeeId: string; status: string; active: boolean; members: number };
const projects = crud('/projects');
const STATUS: [string, string][] = [
  ['PLANNED', 'Planned'],
  ['ACTIVE', 'Active'],
  ['ON_HOLD', 'On hold'],
  ['COMPLETED', 'Completed'],
];

export function ProjectsPage() {
  const people = usePeople();
  return (
    <ListEditor<Project, ProjectRow>
      title="Projects"
      sub="Projects people work on across departments. Timesheets use this list."
      card="Organisation · Projects"
      desc="Assign people and their allocation in Org chart → By project."
      addLabel="Add project"
      empty="No projects yet."
      queryKey={['settings', 'projects']}
      list={() => get<Project[]>('/projects?include=stats')}
      toRow={(p) => ({ id: p.id, version: p.version, name: p.name, code: s(p.code), client: s(p.client), ownerEmployeeId: s(p.manager?.employeeId), status: p.status, active: p.active, members: p.memberCount ?? 0 })}
      blank={() => ({ name: '', code: '', client: 'Internal', ownerEmployeeId: '', status: 'ACTIVE', active: true, members: 0 })}
      cols={[
        { key: 'name', label: 'Project', kind: 'text', placeholder: 'e.g. Customer portal' },
        { key: 'code', label: 'Code', kind: 'mono', width: 90 },
        { key: 'client', label: 'Client', kind: 'text' },
        { key: 'ownerEmployeeId', label: 'Project manager', kind: 'select', options: people.data ?? [], none: 'No manager' },
        { key: 'status', label: 'Status', kind: 'select', options: STATUS, width: 130 },
        { key: 'active', label: 'Active', kind: 'toggle' },
      ]}
      body={(r) => toBody(r, { skip: ['members'] })}
      create={projects.create}
      update={projects.update}
      remove={(r) => projects.remove(r.id)}
      removeHint="Only possible when nobody is assigned or has logged time."
      extra={{ label: 'People', render: (r) => (r.isNew ? '' : `${r.members} ${r.members === 1 ? 'person' : 'people'}`) }}
      refresh={[['lookup', 'projects']]}
      saving="Saving projects…"
    />
  );
}
