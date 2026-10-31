import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { errorText } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { SettingsHead } from '../settings/SettingsLayout';
import { MatrixView } from '../settings/fields/FieldsFormsPage';
import { fieldsApi } from '../settings/fields/api';
import { LEVELS, MODULES, SCOPES, accessApi, levelOf, useAssignments, useRoles, type Scope } from './api';
import { BlockLoader } from '../components/Splash';

/** Field security: the employee profile's access matrix (others' records), the same rules Fields & forms edits. */
export function FieldSecurityPage() {
  const meta = useQuery({ queryKey: ['config', 'meta'], queryFn: fieldsApi.meta, staleTime: 60 * 60_000 });
  return (
    <>
      <SettingsHead title="Field security" sub="Hide or mask sensitive fields for each role." />
      <Alert kind="info">
        Hidden removes the field, Masked shows only the last characters, View shows it, Edit · approval sends changes to HR, Edit allows changes. People with several roles get the most open setting. The same rules are in{' '}
        <Link to="/configuration/fields/employee-profile">Configuration → Employee profile</Link>, field by field.
      </Alert>
      <PermissionsNotice errors={[meta.error]} />
      {meta.data && <MatrixView areaKey="employee_profile" meta={meta.data} />}
    </>
  );
}

/** Everything one person can do, worked out from the roles assigned to them and each role's module access. */
export function EffectivePage() {
  const a = useAssignments();
  const roles = useRoles();
  const [who, setWho] = useState('');
  const row = a.data?.find((x) => x.user.id === who) ?? a.data?.[0];
  const roleIds = useMemo(() => [...new Set(row?.roles.map((r) => r.roleId) ?? [])], [row]);
  const perms = useQueries({ queries: roleIds.map((id) => ({ queryKey: ['access', 'perms', id], queryFn: () => accessApi.permissions(id), staleTime: 60_000 })) });
  const loading = perms.some((p) => p.isLoading);

  const table = useMemo(() => {
    const out = MODULES.map((m) => ({ ...m, level: 0, scope: null as Scope | null, by: [] as string[] }));
    roleIds.forEach((rid, i) => {
      const name = roles.data?.find((r) => r.id === rid)?.name ?? 'Role';
      for (const p of perms[i]?.data ?? []) {
        const m = out.find((x) => x.key === p.module);
        if (!m) continue;
        const lv = levelOf(p.action);
        if (lv > m.level) m.level = lv;
        if (lv > 0) {
          if (!m.by.includes(name)) m.by.push(name);
          // The widest scope wins when two roles give the same module.
          if (!m.scope || SCOPES.findIndex((s) => s.value === p.scope) > SCOPES.findIndex((s) => s.value === m.scope)) m.scope = p.scope;
        }
      }
    });
    return out;
  }, [perms, roleIds, roles.data]);

  return (
    <>
      <SettingsHead title="Effective permissions" sub="Everything one person can see and do, and which role grants it." />
      <PermissionsNotice errors={[a.error, roles.error]} />
      {a.isLoading && <BlockLoader page label="Working out everyone's permissions…" />}
      {a.data && (
        <>
          <select className="input sm" style={{ maxWidth: 420 }} value={row?.user.id ?? ''} onChange={(e) => setWho(e.target.value)} aria-label="Person">
            {a.data.map((x) => (
              <option key={x.user.id} value={x.user.id}>
                {x.person ? `${x.person.name}${x.person.title ? ` · ${x.person.title}` : ''}` : x.user.id}
              </option>
            ))}
          </select>
          {row && (
            <div className="card profile-head" style={{ padding: 14 }}>
              <Avatar url={row.person?.photoUrl} initials={row.person?.initials ?? '?'} size={44} />
              <span className="txt" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <b style={{ fontSize: 15, color: 'var(--fg-1)' }}>{row.person?.name}</b>
                <span className="field-hint">{[row.person?.title, row.person?.department?.name].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="chips">
                {row.roles.length === 0 && <span className="field-hint">No assigned roles</span>}
                {row.roles.map((r) => (
                  <span key={r.id} className="pill no-dot pill-brand">
                    {r.roleName} · {SCOPES.find((s) => s.value === r.scope)?.label}
                  </span>
                ))}
              </span>
            </div>
          )}
          <div className="card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Access</th>
                  <th>Scope</th>
                  <th>Granted by</th>
                </tr>
              </thead>
              <tbody>
                {table.map((m) => (
                  <tr key={m.key} style={{ cursor: 'default', opacity: m.level ? 1 : 0.55 }}>
                    <td>{m.label}</td>
                    <td>{loading ? '…' : <span className={`pill no-dot ${m.level >= 3 ? 'pill-ok' : m.level ? 'pill-info' : 'pill-muted'}`}>{LEVELS[m.level].label}</span>}</td>
                    <td>{m.scope ? SCOPES.find((s) => s.value === m.scope)?.label : '—'}</td>
                    <td className="muted" style={{ whiteSpace: 'normal' }}>
                      {m.by.join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="field-hint">Field-level rules (hidden or masked fields) come on top of this; see Field security.</span>
        </>
      )}
    </>
  );
}

/** Which roles may configure each area under Configuration → Fields & forms. Only a super admin can change it. */
export function AreaOwnersPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access', 'area-owners'], queryFn: accessApi.areaOwners });
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    meta: { busy: 'Saving area owners…' },
    mutationFn: ({ area, roleIds }: { area: string; roleIds: string[] }) => accessApi.setAreaOwners(area, roleIds),
    onSuccess: (r) => (qc.setQueryData(['access', 'area-owners'], r), qc.invalidateQueries({ queryKey: ['config'] })),
    onError: (e) => setErr(errorText(e)),
  });
  return (
    <>
      <SettingsHead title="Area owners" sub="Which roles can configure each area in Configuration." />
      <PermissionsNotice errors={[q.error]} />
      {err && <Alert>{err}</Alert>}
      {q.data && !q.data.canEdit && <Alert kind="info">Only a super admin can change area owners.</Alert>}
      {q.isLoading && <BlockLoader page label="Loading area owners…" />}
      {q.data && (
        <div className="card">
          <div className="field-hint" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            Roles that can open and change each area in Configuration. Super admin can always change everything.
          </div>
          {q.data.areas.map((ar) => (
            <div className="set-row" key={ar.key}>
              <span className="txt">
                <b>{ar.name}</b>
              </span>
              <span className="chips" style={{ justifyContent: 'flex-end' }}>
                <span className="chip" aria-pressed="true" style={{ cursor: 'default' }}>
                  ✓ Super admin
                </span>
                {q.data.roles
                  .filter((r) => r.key !== 'super_admin')
                  .map((r) => {
                    const on = ar.roleIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="chip"
                        aria-pressed={on}
                        disabled={!q.data.canEdit || save.isPending}
                        onClick={() => save.mutate({ area: ar.key, roleIds: on ? ar.roleIds.filter((x) => x !== r.id) : [...ar.roleIds, r.id] })}
                      >
                        {on && '✓ '}
                        {r.name}
                      </button>
                    );
                  })}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
