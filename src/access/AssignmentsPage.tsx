import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { errorText } from '../lib/http';
import { date } from '../lib/format';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { Drawer, FieldShell, PersonPicker, useDepartments, useLocations } from '../onboarding/shared';
import type { Person } from '../onboarding/api';
import { SettingsHead } from '../settings/SettingsLayout';
import { MODULES, SCOPES, accessApi, useAssignments, useRoles, type Scope } from './api';
import { BlockLoader } from '../components/Splash';

export function AssignmentsPage() {
  const qc = useQueryClient();
  const roles = useRoles();
  const a = useAssignments();
  const depts = useDepartments();
  const locs = useLocations();
  const [role, setRole] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rows = useMemo(() => (a.data ?? []).flatMap((x) => x.roles.map((ur) => ({ ...x, ur }))).filter((r) => !role || r.ur.roleId === role), [a.data, role]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    (a.data ?? []).forEach((x) => x.roles.forEach((r) => c.set(r.roleId, (c.get(r.roleId) ?? 0) + 1)));
    return c;
  }, [a.data]);
  const refName = (scope: Scope, ref: string | null) =>
    !ref ? '' : scope === 'DEPARTMENT' ? depts.data?.find((d) => d.id === ref)?.name : scope === 'LOCATION' ? locs.data?.find((l) => l.id === ref)?.name : a.data?.find((x) => x.person?.id === ref)?.person?.name;

  const revoke = useMutation({
    meta: { busy: 'Removing role…' },
    mutationFn: ({ userId, urId }: { userId: string; urId: string }) => accessApi.revoke(userId, urId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access', 'assignments'] }),
    onError: (e) => setMsg(errorText(e)),
  });

  return (
    <>
      <SettingsHead title="Role assignments" sub="Who holds which role, plus approval delegations." />
      <PermissionsNotice errors={[roles.error, a.error]} />
      {msg && <Alert>{msg}</Alert>}

      <div className="kpis">
        {(roles.data ?? []).map((r) => (
          <button key={r.id} type="button" className="stat-tile" aria-pressed={role === r.id} onClick={() => setRole(role === r.id ? '' : r.id)}>
            <span className="lbl">{r.name}</span>
            <span className="val">{a.data ? (counts.get(r.id) ?? 0) : '—'}</span>
            <span className="sub">{r.system ? 'System role' : 'Custom role'}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <span>Assigned roles</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <select className="sel" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
              <option value="">All roles</option>
              {roles.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAssigning(true)}>
              + Assign role
            </button>
          </span>
        </div>
        {a.isLoading && <div className="card-empty">Loading assignments…</div>}
        {a.data && rows.length === 0 && <div className="card-empty">No assignments{role ? ' for this role' : ''}.</div>}
        {rows.map((r) => (
          <div className="list-row" key={r.ur.id}>
            <Avatar url={r.person?.photoUrl} initials={r.person?.initials ?? '?'} size={30} />
            <span className="txt">
              <b>{r.person?.name ?? 'Unknown employee'}</b>
              <span>{[r.person?.title, r.person?.department?.name].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="txt" style={{ flex: '0 1 220px' }}>
              <b>{r.ur.roleName}</b>
              <span>
                {SCOPES.find((s) => s.value === r.ur.scope)?.label ?? r.ur.scope}
                {r.ur.scopeRef ? ` · ${refName(r.ur.scope, r.ur.scopeRef) ?? ''}` : ''}
              </span>
            </span>
            <span className={`pill ${r.user.status === 'ACTIVE' ? 'pill-ok' : 'pill-muted'}`}>{r.user.status.toLowerCase()}</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={revoke.isPending} onClick={() => confirm(`Revoke ${r.ur.roleName} from ${r.person?.name ?? 'this person'}?`) && revoke.mutate({ userId: r.user.id, urId: r.ur.id })}>
              Revoke
            </button>
          </div>
        ))}
      </div>

      <Delegations people={a.data ?? []} />
      {assigning && <AssignDrawer onClose={() => setAssigning(false)} users={a.data ?? []} />}
    </>
  );
}

type Row = NonNullable<ReturnType<typeof useAssignments>['data']>[number];

function AssignDrawer({ onClose, users }: { onClose: () => void; users: Row[] }) {
  const qc = useQueryClient();
  const roles = useRoles();
  const depts = useDepartments();
  const locs = useLocations();
  const [person, setPerson] = useState<Person | null>(null);
  const [roleId, setRoleId] = useState('');
  const [scope, setScope] = useState<Scope>('ORGANIZATION');
  const [ref, setRef] = useState('');
  const user = users.find((u) => u.person?.id === person?.id || u.user.employeeId === person?.id);
  const assign = useMutation({
    meta: { busy: 'Assigning role…' },
    mutationFn: () => accessApi.assign(user!.user.id, { roleId, scope, scopeRef: scope === 'DEPARTMENT' || scope === 'LOCATION' ? ref || null : null }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['access', 'assignments'] }), onClose()),
  });
  const needsRef = scope === 'DEPARTMENT' || scope === 'LOCATION';
  return (
    <Drawer
      title="Assign role"
      sub="Gives the person the role's access, limited to the scope you pick."
      onClose={onClose}
      busy={assign.isPending}
      foot={
        <>
          <span className="grow" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!user || !roleId || (needsRef && !ref) || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? 'Assigning…' : 'Assign role'}
          </button>
        </>
      }
    >
      <div className="drawer-body">
        {assign.error && <Alert>{errorText(assign.error)}</Alert>}
        <div className="form-grid">
          <FieldShell label="Person" required>
            <PersonPicker value={person} onChange={setPerson} />
            {person && !user && <span className="field-err">{person.name} has no sign-in account yet, so a role can't be assigned.</span>}
          </FieldShell>
          <FieldShell label="Role" required>
            <select className="input sm" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Select</option>
              {roles.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </FieldShell>
          <FieldShell label="Scope" required>
            <select className="input sm" value={scope} onChange={(e) => (setScope(e.target.value as Scope), setRef(''))}>
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </FieldShell>
          {needsRef && (
            <FieldShell label={scope === 'DEPARTMENT' ? 'Department' : 'Location'} required>
              <select className="input sm" value={ref} onChange={(e) => setRef(e.target.value)}>
                <option value="">Select</option>
                {(scope === 'DEPARTMENT' ? depts.data : locs.data)?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </FieldShell>
          )}
        </div>
        {user && <span className="field-hint">Already holds: {user.roles.map((r) => r.roleName).join(', ') || 'no assigned roles'}</span>}
      </div>
    </Drawer>
  );
}

function Delegations({ people }: { people: Row[] }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ['access', 'delegations'], queryFn: accessApi.delegations });
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<Person | null>(null);
  const [module, setModule] = useState('leave');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const nameOf = (userId: string) => people.find((p) => p.user.id === userId)?.person?.name ?? 'Unknown';
  const toUser = people.find((p) => p.user.employeeId === to?.id);
  const create = useMutation({
    meta: { busy: 'Creating delegation…' },
    mutationFn: () => accessApi.createDelegation({ toUserId: toUser!.user.id, module, startsAt: new Date(`${from}T00:00:00`).toISOString(), endsAt: new Date(`${until}T23:59:59`).toISOString(), reason: reason.trim() || undefined }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['access', 'delegations'] }), setOpen(false), setTo(null), setReason('')),
  });
  const remove = useMutation({ meta: { busy: 'Removing delegation…' }, mutationFn: accessApi.deleteDelegation, onSuccess: () => qc.invalidateQueries({ queryKey: ['access', 'delegations'] }) });
  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <span>
          Delegations
          <span className="field-hint" style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>
            Hand approvals to someone else while you are away. They see your pending requests in their Approvals.
          </span>
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(!open)}>
          + New delegation
        </button>
      </div>
      {open && (
        <div className="card-body" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {create.error && <Alert>{errorText(create.error)}</Alert>}
          <div className="form-grid">
            <FieldShell label="Delegate to" required>
              <PersonPicker value={to} onChange={setTo} />
            </FieldShell>
            <FieldShell label="Approvals for" required>
              <select className="input sm" value={module} onChange={(e) => setModule(e.target.value)}>
                {MODULES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </FieldShell>
            <FieldShell label="From" required>
              <input className="input sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </FieldShell>
            <FieldShell label="Until" required>
              <input className="input sm" type="date" min={from || undefined} value={until} onChange={(e) => setUntil(e.target.value)} />
            </FieldShell>
            <FieldShell label="Reason" wide>
              <input className="input sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. On leave 4–8 Nov" />
            </FieldShell>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!toUser || !from || !until || create.isPending} onClick={() => create.mutate()}>
              Save delegation
            </button>
          </div>
        </div>
      )}
      {d.isLoading && <BlockLoader height={100} size={24} label="Loading delegations…" />}
      {d.data?.length === 0 && <div className="card-empty">No delegations</div>}
      {d.data?.map((x) => (
        <div className="list-row" key={x.id}>
          <span className="txt">
            <b>
              {nameOf(x.fromUserId)} → {nameOf(x.toUserId)}
            </b>
            <span>
              {MODULES.find((m) => m.key === x.module)?.label ?? x.module} · {date(x.startsAt)} – {date(x.endsAt)}
              {x.reason ? ` · ${x.reason}` : ''}
            </span>
          </span>
          <span className={`pill ${new Date(x.endsAt) > new Date() ? 'pill-ok' : 'pill-muted'}`}>{new Date(x.endsAt) > new Date() ? 'active' : 'ended'}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={remove.isPending} onClick={() => confirm('End this delegation?') && remove.mutate(x.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
