import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/icons';
import { errorText, fieldErrors } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { FieldShell } from '../onboarding/shared';
import { SettingsHead } from '../settings/SettingsLayout';
import { LEVELS, MODULES, SCOPES, accessApi, levelOf, useAssignments, useRoles, type Role, type Scope } from './api';
import { BlockLoader } from '../components/Splash';

export function RolesPage() {
  const roles = useRoles();
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = roles.data ?? [];
  const role = list.find((r) => r.id === sel) ?? list[0];

  return (
    <>
      <SettingsHead title="Roles & permissions" sub="What each role can see and do, by module." />
      <PermissionsNotice errors={[roles.error]} />
      {roles.isLoading && <BlockLoader page label="Loading roles…" />}
      {roles.data && (
        <div className="roles-layout">
          <div className="card" style={{ alignSelf: 'start' }}>
            {list.map((r) => (
              <button key={r.id} type="button" className={`role-item${role?.id === r.id && !creating ? ' sel' : ''}`} onClick={() => (setSel(r.id), setCreating(false))}>
                <span className="txt">
                  <b>{r.name}</b>
                  <span>{r.description || r.key}</span>
                </span>
                {r.system && <span className="pill no-dot pill-muted caps-pill">System</span>}
              </button>
            ))}
            <div style={{ padding: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => setCreating(true)}>
                + New role
              </button>
            </div>
          </div>
          {creating ? <NewRole onDone={(id) => (setSel(id), setCreating(false))} onCancel={() => setCreating(false)} /> : role ? <RoleEditor key={role.id} role={role} /> : null}
        </div>
      )}
    </>
  );
}

function NewRole({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'r_$1');
  const create = useMutation({
    meta: { busy: 'Creating role…' },
    mutationFn: () => accessApi.createRole({ key: keyTouched ? key : slug(name), name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ['access', 'roles'] }), onDone(r.id)),
  });
  const fe = fieldErrors(create.error);
  return (
    <div className="card">
      <div className="card-head">New role</div>
      <div className="card-body">
        {create.error && <Alert>{errorText(create.error)}</Alert>}
        <div className="form-grid">
          <FieldShell label="Name" required error={fe.name}>
            <input className="input sm" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance reviewer" />
          </FieldShell>
          <FieldShell label="Key" required error={fe.key}>
            <input className="input sm mono" value={keyTouched ? key : slug(name)} onChange={(e) => (setKeyTouched(true), setKey(e.target.value))} />
            <span className="field-hint">lower_snake_case, can't change later</span>
          </FieldShell>
          <FieldShell label="Description" wide>
            <input className="input sm" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FieldShell>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create role'}
          </button>
        </div>
        <span className="field-hint">New roles start with no access. Give them module access below once created, then assign them in Role assignments.</span>
      </div>
    </div>
  );
}

type Grant = { level: number; scope: Scope };

function RoleEditor({ role }: { role: Role }) {
  const qc = useQueryClient();
  const perms = useQuery({ queryKey: ['access', 'perms', role.id], queryFn: () => accessApi.permissions(role.id) });
  const assignments = useAssignments();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [grants, setGrants] = useState<Record<string, Grant>>({});
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success'; text: string } | null>(null);

  // The highest action per module is what counts; its scope is the module's scope.
  const server = useMemo(() => {
    const g: Record<string, Grant> = {};
    for (const m of MODULES) g[m.key] = { level: 0, scope: 'ORGANIZATION' };
    for (const p of perms.data ?? []) {
      const lv = levelOf(p.action);
      if (!g[p.module] || lv > g[p.module].level) g[p.module] = { level: lv, scope: p.scope };
    }
    return g;
  }, [perms.data]);
  useEffect(() => setGrants(server), [server]);
  const dirty = JSON.stringify(grants) !== JSON.stringify(server);
  const extraModules = Object.keys(grants).filter((k) => !MODULES.some((m) => m.key === k));

  const saveMeta = useMutation({
    meta: { busy: 'Saving role…' },
    mutationFn: () => accessApi.updateRole(role.id, { name: name.trim(), description: description.trim() || null }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['access'] }), setMsg({ kind: 'success', text: 'Role saved' })),
    onError: (e) => setMsg({ kind: 'danger', text: errorText(e) }),
  });
  const savePerms = useMutation({
    meta: { busy: 'Saving permissions…' },
    mutationFn: () =>
      accessApi.setPermissions(
        role.id,
        Object.entries(grants)
          .filter(([, g]) => g.level > 0)
          .map(([module, g]) => ({ module, action: LEVELS[g.level].action, scope: g.scope })),
      ),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['access', 'perms', role.id] }), setMsg({ kind: 'success', text: 'Permissions saved' })),
    onError: (e) => setMsg({ kind: 'danger', text: errorText(e) }),
  });
  const remove = useMutation({
    meta: { busy: 'Deleting role…' },
    mutationFn: () => accessApi.deleteRole(role.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access', 'roles'] }),
    onError: (e) => setMsg({ kind: 'danger', text: errorText(e) }),
  });

  const holders = (assignments.data ?? []).flatMap((a) => a.roles.filter((r) => r.roleId === role.id).map((r) => ({ ...a, ur: r })));
  const metaDirty = name.trim() !== role.name || (description.trim() || '') !== (role.description ?? '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card">
        <div className="card-head">
          <span>
            {role.name} <span className="field-hint mono" style={{ fontWeight: 400 }}>· {role.key}</span>
          </span>
          {!role.system && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={remove.isPending} onClick={() => confirm(`Delete the role "${role.name}"? People holding it lose its access.`) && remove.mutate()}>
              {Icon.trash} Delete role
            </button>
          )}
        </div>
        <div className="card-body">
          {role.system && <span className="field-hint">System role: it can be renamed and its access changed, but not deleted.</span>}
          <div className="form-grid">
            <FieldShell label="Name">
              <input className="input sm" value={name} onChange={(e) => setName(e.target.value)} />
            </FieldShell>
            <FieldShell label="Description" wide>
              <input className="input sm" value={description} onChange={(e) => setDescription(e.target.value)} />
            </FieldShell>
          </div>
          {metaDirty && (
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setName(role.name), setDescription(role.description ?? ''))}>
                Reset
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim() || saveMeta.isPending} onClick={() => saveMeta.mutate()}>
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span>Modules</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!dirty || savePerms.isPending} onClick={() => setGrants(server)}>
              Reset
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || savePerms.isPending} onClick={() => savePerms.mutate()}>
              {savePerms.isPending ? 'Saving…' : 'Save permissions'}
            </button>
          </span>
        </div>
        {perms.isLoading && <BlockLoader height={100} size={24} label="Loading permissions…" />}
        {perms.isError && <div className="card-empty">{perms.error.message}</div>}
        {perms.data && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl edit-tbl">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Access</th>
                  <th>Whose records</th>
                </tr>
              </thead>
              <tbody>
                {[...MODULES, ...extraModules.map((k) => ({ key: k, label: k }))].map((m) => {
                  const g = grants[m.key] ?? { level: 0, scope: 'ORGANIZATION' as Scope };
                  return (
                    <tr key={m.key}>
                      <td style={{ paddingTop: 14 }}>{m.label}</td>
                      <td>
                        <span className="seg level-seg">
                          {LEVELS.map((l, i) => (
                            <button key={l.label} type="button" aria-pressed={g.level === i} onClick={() => setGrants((o) => ({ ...o, [m.key]: { ...g, level: i } }))}>
                              {l.label}
                            </button>
                          ))}
                        </span>
                      </td>
                      <td>
                        <select className="input sm" style={{ width: 150 }} value={g.scope} disabled={g.level === 0} onChange={(e) => setGrants((o) => ({ ...o, [m.key]: { ...g, scope: e.target.value as Scope } }))}>
                          {SCOPES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="field-hint" style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          View sees, Edit creates and changes, Approve adds approving requests, Full adds delete, export and configuration. "Whose records" limits it: own, the reporting team, the department, the location or everyone.
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span>Who has this role</span>
          <Link to="/settings/assignments" style={{ fontSize: 12, fontWeight: 400 }}>
            Manage assignments
          </Link>
        </div>
        {assignments.isLoading && <BlockLoader height={100} size={24} label="Loading who has this role…" />}
        {assignments.data && holders.length === 0 && <div className="card-empty">No one is assigned this role directly.</div>}
        {holders.map((h) => (
          <div className="list-row" key={h.ur.id}>
            <Avatar url={h.person?.photoUrl} initials={h.person?.initials ?? '?'} size={28} />
            <span className="txt">
              <b>{h.person?.name ?? 'Unknown employee'}</b>
              <span>{[h.person?.title, h.person?.department?.name].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="pill no-dot pill-muted">{SCOPES.find((s) => s.value === h.ur.scope)?.label ?? h.ur.scope}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
