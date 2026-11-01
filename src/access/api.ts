import { useQuery } from '@tanstack/react-query';
import { api, blob, del, get, post } from '../lib/http';

export type Role = { id: string; key: string; name: string; description: string | null; system: boolean };
export type Scope = 'OWN' | 'TEAM' | 'DEPARTMENT' | 'LOCATION' | 'ORGANIZATION';
export type RolePermission = { permissionId: string; module: string; action: string; scope: Scope };
export type User = { id: string; employeeId: string; externalSubject: string | null; status: string; lastLoginAt: string | null };
export type UserRole = { id: string; roleId: string; roleKey: string; roleName: string; scope: Scope; scopeRef: string | null };
export type Delegation = { id: string; fromUserId: string; toUserId: string; module: string; startsAt: string; endsAt: string; reason: string | null };
export type AreaOwners = { roles: { id: string; key: string; name: string }[]; areas: { key: string; name: string; roleIds: string[]; superAdminAlways: boolean }[]; canEdit: boolean };
export type NavMenu = { key: string; label: string; portal: 'admin' | 'ess'; sub: string; module: string | null; locked: boolean; on: boolean; changed: boolean; viaEmployee: boolean };
export type PageAccess = 'edit' | 'view' | 'hidden';
export type RoleNav = {
  role: { id: string; key: string; name: string };
  allAccess: boolean;
  canEdit: boolean;
  menus: NavMenu[];
  profileTabs: { key: string; label: string }[];
  tabs: Record<string, boolean>;
  pages: Record<string, PageAccess>;
};
export type MyNav = { menus: string[]; hiddenTabs: string[]; pages: Record<string, 'view' | 'hidden'> };
export type AuditKind = 'Roles' | 'Assignments' | 'Permissions' | 'Relationships' | 'Settings';
export type AuditEntry = { id: string; at: string; by: string; kind: AuditKind; act: string; target: string; det: string };
export type AuditPage = { counts: Record<'All' | AuditKind, number>; total: number; page: number; size: number; items: AuditEntry[] };
type Person = { id: string; name: string; initials: string; title?: string; department?: { id: string; name: string }; photoUrl?: string };

/** Modules a role can be given access to, in the backend's keys, with the names the UI shows. */
export const MODULES: { key: string; label: string }[] = [
  { key: 'employee', label: 'Employees & profiles' },
  { key: 'org', label: 'Org structure' },
  { key: 'leave', label: 'Leave' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'recruiting', label: 'Recruiting & onboarding' },
  { key: 'performance', label: 'Performance' },
  { key: 'assets', label: 'Assets' },
  { key: 'requests', label: 'Requests' },
];
/** Levels in order; a role holds the highest one it has per module. */
export const LEVELS = [
  { action: '', label: 'None' },
  { action: 'view', label: 'View' },
  { action: 'edit', label: 'Edit' },
  { action: 'approve', label: 'Approve' },
  { action: 'admin', label: 'Full' },
];
export const SCOPES: { value: Scope; label: string }[] = [
  { value: 'OWN', label: 'Own' },
  { value: 'TEAM', label: 'Team' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'LOCATION', label: 'Location' },
  { value: 'ORGANIZATION', label: 'Everyone' },
];
export const levelOf = (action: string) => Math.max(0, LEVELS.findIndex((l) => l.action === action));

export const accessApi = {
  roles: () => get<Role[]>('/roles'),
  createRole: (b: { key: string; name: string; description?: string }) => post<Role>('/roles', b),
  updateRole: (id: string, b: { name?: string; description?: string | null }) => api<Role>(`/roles/${id}`, { method: 'PATCH', body: b }),
  deleteRole: (id: string) => del<void>(`/roles/${id}`),
  permissions: (id: string) => get<RolePermission[]>(`/roles/${id}/permissions`),
  setPermissions: (id: string, rows: { module: string; action: string; scope: Scope }[]) => api<RolePermission[]>(`/roles/${id}/permissions`, { method: 'PUT', body: rows }),
  users: () => get<User[]>('/users'),
  userRoles: (userId: string) => get<UserRole[]>(`/users/${userId}/roles`),
  assign: (userId: string, b: { roleId: string; scope: Scope; scopeRef?: string | null }) => post<UserRole>(`/users/${userId}/roles`, b),
  revoke: (userId: string, userRoleId: string) => del<void>(`/users/${userId}/roles/${userRoleId}`),
  delegations: () => get<Delegation[]>('/delegations'),
  createDelegation: (b: { fromUserId?: string; toUserId: string; module: string; startsAt: string; endsAt: string; reason?: string }) => post<Delegation>('/delegations', b),
  deleteDelegation: (id: string) => del<void>(`/delegations/${id}`),
  areaOwners: () => get<AreaOwners>('/config/area-owners'),
  setAreaOwners: (areaKey: string, roleIds: string[]) => api<AreaOwners>(`/config/area-owners/${areaKey}`, { method: 'PUT', body: { roleIds } }),
  people: () => get<{ items: Person[] }>('/employees?size=200'),
  myNav: () => get<MyNav>('/access/nav/me'),
  roleNav: (roleId: string) => get<RoleNav>(`/access/nav/roles/${roleId}`),
  setNav: (roleId: string, b: { area: 'menu' | 'tab' | 'page'; key?: string; keys?: string[]; label?: string; value: string }) => api<RoleNav>(`/access/nav/roles/${roleId}`, { method: 'PUT', body: b }),
  audit: (p: { kind?: string; q?: string; page?: number; size?: number }) => get<AuditPage>(`/access/audit?${qs(p)}`),
  auditCsv: (p: { kind?: string; q?: string }) => blob(`/access/audit/export?${qs(p)}`),
};

const qs = (p: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== 'All').map(([k, v]) => [k, String(v)])).toString();

/**
 * The signed-in person's menus from Module permissions. If the call fails (an older API, or no access) everything
 * stays visible: the API still checks every request, this only tidies the menus.
 */
export const useMyNav = () => useQuery({ queryKey: ['access', 'nav', 'me'], queryFn: accessApi.myNav, staleTime: 5 * 60_000, retry: false });

export const useRoles = () => useQuery({ queryKey: ['access', 'roles'], queryFn: accessApi.roles, staleTime: 60_000 });

/**
 * Everyone who can sign in, with their name and the roles assigned to them. The API has no single "all assignments"
 * call, so this asks for each user's roles (fine for an organization of a few hundred; a bulk endpoint would be better).
 */
export function useAssignments() {
  return useQuery({
    queryKey: ['access', 'assignments'],
    staleTime: 30_000,
    queryFn: async () => {
      const [users, people] = await Promise.all([accessApi.users(), accessApi.people()]);
      const byEmp = new Map(people.items.map((p) => [p.id, p]));
      const rows: { user: User; person: Person | undefined; roles: UserRole[] }[] = [];
      for (let i = 0; i < users.length; i += 8) {
        const chunk = users.slice(i, i + 8);
        const roles = await Promise.all(chunk.map((u) => accessApi.userRoles(u.id)));
        chunk.forEach((u, k) => rows.push({ user: u, person: byEmp.get(u.employeeId), roles: roles[k] }));
      }
      return rows.sort((a, b) => (a.person?.name ?? '').localeCompare(b.person?.name ?? ''));
    },
  });
}
