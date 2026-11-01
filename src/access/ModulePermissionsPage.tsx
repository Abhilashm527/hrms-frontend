import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { ACCESS_GROUPS, CONFIG_GROUPS, SettingsHead } from '../settings/SettingsLayout';
import { LEVELS, MODULES, SCOPES, accessApi, levelOf, useRoles, type NavMenu, type PageAccess, type RoleNav, type Scope } from './api';

/** One colour per role, in list order, for the chips at the top. */
const ROLE_COLORS = ['#2563EB', '#7C3AED', '#0F766E', '#B45309', '#DB2777', '#475569', '#15803D', '#DC2626'];
const PAGE_L: Record<PageAccess, string> = { hidden: 'Hidden', view: 'View', edit: 'Edit' };

/**
 * Module permissions, per role: which menus show in the sidebar, which tabs of other people's profiles open, and
 * whether each Settings / Configuration page is hidden, read-only or editable. What each module allows (view, edit,
 * approve) stays in Roles & permissions; fields stay in Field security.
 */
export function ModulePermissionsPage() {
  const roles = useRoles();
  const list = roles.data ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const role = list.find((r) => r.id === sel) ?? list.find((r) => r.key === 'employee') ?? list[0];

  return (
    <>
      <SettingsHead title="Module permissions" sub="Per role: which menus show, which tabs inside them, and which settings pages they can change." />
      <PermissionsNotice errors={[roles.error]} />
      {roles.isLoading && <BlockLoader page label="Loading roles…" />}
      {role && (
        <div className="ep-page">
          <div className="ep-roles" role="tablist">
            {list.map((r, i) => {
              const on = r.id === role.id;
              return (
                <button key={r.id} type="button" role="tab" aria-selected={on} className={`ep-role${on ? ' on' : ''}`} onClick={() => setSel(r.id)}>
                  <span className="ep-dot" style={{ background: ROLE_COLORS[i % ROLE_COLORS.length] }} />
                  {r.name}
                </button>
              );
            })}
          </div>
          <RoleView key={role.id} roleId={role.id} roleName={role.name} onEmployeeRole={() => setSel(list.find((r) => r.key === 'employee')?.id ?? null)} />
        </div>
      )}
    </>
  );
}

function RoleView({ roleId, roleName, onEmployeeRole }: { roleId: string; roleName: string; onEmployeeRole: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access', 'nav', 'role', roleId], queryFn: () => accessApi.roleNav(roleId) });
  const perms = useQuery({ queryKey: ['access', 'perms', roleId], queryFn: () => accessApi.permissions(roleId) });
  const [open, setOpen] = useState<Record<string, boolean>>({ employees: true });
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const done = (r: RoleNav) => {
    qc.setQueryData(['access', 'nav', 'role', roleId], r);
    qc.invalidateQueries({ queryKey: ['access', 'nav', 'me'] });
    qc.invalidateQueries({ queryKey: ['access', 'perms', roleId] });
    setErr(null);
  };
  const set = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: (b: { area: 'menu' | 'tab' | 'page'; key?: string; keys?: string[]; label?: string; value: string }) => accessApi.setNav(roleId, b),
    onSuccess: done,
    onError: (e) => setErr(errorText(e)),
  });
  // "Whose profiles they can open" is the scope of the role's Employees permission.
  const reach = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: async (scope: Scope) => {
      const rows = (perms.data ?? []).map((p) => ({ module: p.module, action: p.action, scope: p.module === 'employee' ? scope : p.scope }));
      return accessApi.setPermissions(roleId, rows);
    },
    onSuccess: (r) => (qc.setQueryData(['access', 'perms', roleId], r), qc.invalidateQueries({ queryKey: ['access', 'nav'] }), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });

  const levels = useMemo(() => {
    const m: Record<string, { level: number; scope: Scope }> = {};
    for (const p of perms.data ?? []) {
      const lv = levelOf(p.action);
      if (!m[p.module] || lv > m[p.module].level) m[p.module] = { level: lv, scope: p.scope };
    }
    return m;
  }, [perms.data]);

  if (q.isLoading) return <BlockLoader label="Loading menus…" height={240} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  const ro = !d.canEdit || set.isPending;
  const flip = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const toggleMenu = (m: NavMenu) => {
    const lv = m.module ? levels[m.module]?.level ?? 0 : 1;
    if (!m.on && m.module && lv === 0 && !['employees', 'org', 'documents'].includes(m.key)) setNote(`${m.label} needs at least View on ${MODULES.find((x) => x.key === m.module)?.label ?? m.module}. It was given View; change the level in Roles & permissions.`);
    set.mutate({ area: 'menu', key: m.key, value: m.on ? 'off' : 'on' });
  };

  const portals: { key: 'admin' | 'ess'; l: string; sub: string }[] = [
    { key: 'admin', l: 'Admin console', sub: 'Menus in the admin sidebar' },
    { key: 'ess', l: 'Self-service', sub: 'Menus in the employee portal' },
  ];

  return (
    <>
      <div className="ep-head">
        <span className="ep-title">What can {roleName} see?</span>
        <span className="ep-desc">Switch on a menu, then the tabs inside it, then pick what each settings page allows. Anything switched off is hidden, with everything inside it.</span>
      </div>
      <div className="ep-meta">
        <span className="ep-dot" style={{ background: 'var(--success-fg)' }} />
        <span>Changes save straight away and are recorded in the</span>
        <Link to="/settings/audit">Access audit log</Link>
      </div>
      {d.allAccess && <Alert kind="info">{roleName} always sees every menu, tab and page. Nothing here can be switched off.</Alert>}
      {!d.allAccess && !d.canEdit && <Alert kind="info">Only a super admin can change module permissions. You can see them here.</Alert>}
      {note && (
        <div className="ep-new" role="status">
          {note}{' '}
          <button type="button" className="ep-link" onClick={() => setNote(null)}>
            Dismiss
          </button>
        </div>
      )}
      {err && <Alert>{err}</Alert>}
      {portals.map((p) => (
        <div key={p.key} className="ep-card">
          <div className="ep-card-head">
            <b>{p.l}</b>
            <span>{p.sub}</span>
          </div>
          {p.key === 'admin' && d.role.key === 'employee' && (
            <div className="ep-note">Everyone holds the Employee role. Admin menus switched on here show for anyone who also signs in to the admin console.</div>
          )}
          {d.menus
            .filter((m) => m.portal === p.key)
            .map((m) => {
              const tree = m.on && !d.allAccess && (m.key === 'employees' || m.key === 'settings' || m.key === 'configuration');
              const isOpen = tree && !!open[m.key];
              const lv = m.module ? levels[m.module] : undefined;
              const viaE = m.viaEmployee;
              const sub = viaE
                ? 'On for everyone through the Employee role'
                : !m.on
                ? 'Off · hidden from the sidebar'
                : m.key === 'employees'
                  ? `${d.profileTabs.filter((t) => d.tabs[t.key]).length} of ${d.profileTabs.length} profile tabs on`
                  : m.key === 'settings' || m.key === 'configuration'
                    ? pageSummary(m.key === 'settings' ? ACCESS_GROUPS : CONFIG_GROUPS, d.pages)
                    : m.locked
                      ? 'Always on'
                      : m.sub;
              return (
                <div key={m.key}>
                  <div className="ep-row">
                    {m.locked || viaE ? (
                      <span className="ep-lock" title="Always on">
                        ✓
                      </span>
                    ) : (
                      <button type="button" role="switch" aria-checked={m.on} aria-label={m.label} className="switch" disabled={ro} onClick={() => toggleMenu(m)} />
                    )}
                    <span className="ep-txt">
                      <b style={{ color: m.on || viaE ? 'var(--fg-1)' : 'var(--fg-3)' }}>{m.label}</b>
                      <span>{sub}</span>
                    </span>
                    {viaE && (
                      <button type="button" className="ep-link" onClick={onEmployeeRole}>
                        Set on Employee role
                      </button>
                    )}
                    {m.on && lv && lv.level > 0 && !d.allAccess && (
                      <span className="pill no-dot pill-info" title="From Roles & permissions">
                        {LEVELS[lv.level].label} · {SCOPES.find((s) => s.value === lv.scope)?.label}
                      </span>
                    )}
                    {tree && (
                      <button type="button" className="ep-chev" aria-expanded={isOpen} aria-label={`Open ${m.label}`} onClick={() => flip(m.key)}>
                        {isOpen ? '▾' : '▸'}
                      </button>
                    )}
                  </div>
                  {isOpen && m.key === 'employees' && (
                    <>
                      <div className="ep-sub ep-row-in">
                        <span className="ep-txt">
                          <b>Whose profiles they can open</b>
                          <span>Also decides who they see in the people list</span>
                        </span>
                        <select
                          className="ep-pillsel"
                          value={levels.employee?.scope ?? ''}
                          disabled={ro || reach.isPending || !levels.employee}
                          onChange={(e) => reach.mutate(e.target.value as Scope)}
                          title={levels.employee ? undefined : 'Give the role Employees access in Roles & permissions first'}
                        >
                          {!levels.employee && <option value="">Only themselves</option>}
                          {SCOPES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.value === 'OWN' ? 'Only themselves' : s.value === 'ORGANIZATION' ? 'Everyone' : `Their ${s.label.toLowerCase()}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ep-sub ep-row-in ep-plain">
                        <span className="ep-txt">
                          <b>Overview tab</b>
                          <span>Always shown</span>
                        </span>
                      </div>
                      {d.profileTabs.map((t) => {
                        const on = d.tabs[t.key];
                        return (
                          <div key={t.key} className="ep-sub ep-row-in">
                            <button type="button" role="switch" aria-checked={on} aria-label={t.label} className="switch" disabled={ro} onClick={() => set.mutate({ area: 'tab', key: t.key, value: on ? 'off' : 'on' })} />
                            <span className="ep-txt">
                              <b style={{ color: on ? 'var(--fg-1)' : 'var(--fg-3)' }}>{t.label} tab</b>
                              <span>{on ? 'Shown on other people’s profiles' : 'Off · the tab is hidden'}</span>
                            </span>
                          </div>
                        );
                      })}
                      <div className="ep-foot">
                        Their own profile always shows every tab. What each field shows is set in <Link to="/settings/field-security">Field security</Link>; what they can do with
                        records is set in <Link to="/settings/roles">Roles & permissions</Link>.
                      </div>
                    </>
                  )}
                  {isOpen && (m.key === 'settings' || m.key === 'configuration') && (
                    <PagesTree groups={m.key === 'settings' ? ACCESS_GROUPS : CONFIG_GROUPS} pages={d.pages} ro={ro} onSet={(b) => set.mutate({ area: 'page', ...b })} />
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </>
  );
}

type Groups = typeof ACCESS_GROUPS;
const keyOf = (path: string) => path.replace(/^\//, '');
const pagesOf = (groups: Groups) => groups.flatMap((g) => g.items.filter((i) => i.path).map((i) => keyOf(i.path!)));

function pageSummary(groups: Groups, pages: Record<string, PageAccess>) {
  const all = pagesOf(groups);
  const v = all.filter((k) => pages[k] === 'view').length;
  const h = all.filter((k) => pages[k] === 'hidden').length;
  return `${all.length - v - h} edit · ${v} view · ${h} hidden of ${all.length} pages`;
}

function PagesTree({ groups, pages, ro, onSet }: { groups: Groups; pages: Record<string, PageAccess>; ro: boolean; onSet: (b: { key?: string; keys?: string[]; label?: string; value: PageAccess }) => void }) {
  const all = pagesOf(groups);
  return (
    <div className="ep-pages">
      <div className="ep-pages-head">
        <span>Per page: Hidden removes it from the menu, View opens it read-only, Edit allows changes.</span>
        {(['edit', 'view', 'hidden'] as const).map((v) => (
          <button key={v} type="button" className="ep-link" disabled={ro} onClick={() => onSet({ keys: all, value: v })}>
            All {v}
          </button>
        ))}
      </div>
      {groups.map((g) => {
        const items = g.items.filter((i) => i.path);
        if (!items.length) return null;
        return (
          <div key={g.label}>
            <div className="ep-sec">{g.label}</div>
            {items.map((i) => {
              const k = keyOf(i.path!);
              const cur = pages[k] ?? 'edit';
              return (
                <div key={k} className="ep-page-row">
                  <span style={{ color: cur === 'hidden' ? 'var(--fg-3)' : 'var(--fg-1)' }}>{i.label}</span>
                  <span className="seg" role="group" aria-label={i.label}>
                    {(['hidden', 'view', 'edit'] as const).map((v) => (
                      <button key={v} type="button" aria-pressed={cur === v} className={cur === v && v !== 'hidden' ? 'brand' : undefined} disabled={ro} onClick={() => cur !== v && onSet({ key: k, label: i.label, value: v })}>
                        {PAGE_L[v]}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
