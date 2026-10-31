import { useQuery } from '@tanstack/react-query';
import { api, del, get, post } from '../lib/http';

export type Role = { id: string; key: string; name: string; description: string | null; system: boolean };
export type Scope = 'OWN' | 'TEAM' | 'DEPARTMENT' | 'LOCATION' | 'ORGANIZATION';
export type RolePermission = { permissionId: string; module: string; action: string; scope: Scope };
export type User = { id: string; employeeId: string; externalSubject: string | null; status: string; lastLoginAt: string | null };
export type UserRole = { id: string; roleId: string; roleKey: string; roleName: string; scope: Scope; scopeRef: string | null };
export type Delegation = { id: string; fromUserId: string; toUserId: string; module: string; startsAt: string; endsAt: string; reason: string | null };
export type AreaOwners = { roles: { id: string; key: string; name: string }[]; areas: { key: string; name: string; roleIds: string[]; superAdminAlways: boolean }[]; canEdit: boolean };
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
};

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
