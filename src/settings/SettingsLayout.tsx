import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';

type Item = { path?: string; label: string; icon: ReactNode };
type Group = { label: string; items: Item[] };

/** Configuration: the generic setup of the organization, as in the UX's Configuration page. Items without a path aren't built yet. */
export const CONFIG_GROUPS: Group[] = [
  {
    label: 'Fields & forms',
    items: [
      { path: '/configuration/fields/employee-profile', label: 'Employee profile', icon: Icon.user },
      { path: '/configuration/fields/onboarding', label: 'Onboarding · new hire form', icon: Icon.userPlus },
      { path: '/configuration/fields/leave', label: 'Leave requests', icon: Icon.cal },
      { path: '/configuration/fields/attendance', label: 'Attendance & timesheets', icon: Icon.cal },
      { path: '/configuration/fields/requests', label: 'Requests', icon: Icon.file },
      { path: '/configuration/fields/assets', label: 'Assets', icon: Icon.laptop },
      { path: '/configuration/fields/recruiting', label: 'Recruiting & candidates', icon: Icon.briefcase },
      { path: '/configuration/fields/payroll', label: 'Payroll', icon: Icon.wallet },
      { path: '/configuration/fields/performance', label: 'Performance', icon: Icon.chart },
    ],
  },
  {
    label: 'Leave & attendance',
    items: [
      { path: '/configuration/leave-policy', label: 'Leave policy', icon: Icon.cal },
      { path: '/configuration/approval-chain', label: 'Approval chain', icon: Icon.org },
      { path: '/configuration/holiday-types', label: 'Holiday types', icon: Icon.cal },
    ],
  },
  {
    label: 'Organisation',
    items: [
      { path: '/configuration/how-it-connects', label: 'How it connects', icon: Icon.dash },
      { path: '/configuration/setup', label: 'Setup checklist', icon: Icon.check },
      { path: '/configuration/organization', label: 'Organization', icon: Icon.org },
      { path: '/configuration/departments', label: 'Departments', icon: Icon.org },
      { path: '/configuration/positions', label: 'Positions', icon: Icon.briefcase },
      { path: '/configuration/titles', label: 'Titles', icon: Icon.file },
      { path: '/configuration/locations', label: 'Locations', icon: Icon.pin },
      { path: '/configuration/teams', label: 'Teams', icon: Icon.users },
      { path: '/configuration/projects', label: 'Projects', icon: Icon.dash },
      { path: '/configuration/employment-types', label: 'Employment types', icon: Icon.user },
      { path: '/configuration/reporting-lines', label: 'Reporting lines', icon: Icon.org },
      { path: '/configuration/relations', label: 'Dotted lines & mentors', icon: Icon.users },
    ],
  },
  { label: 'Employees', items: [{ path: '/configuration/employee-fields', label: 'Employee fields', icon: Icon.user }, { path: '/configuration/custom-fields', label: 'Custom fields', icon: Icon.file }] },
  { label: 'Integrations', items: [{ path: '/configuration/microsoft-teams', label: 'Microsoft Teams', icon: Icon.users }, { path: '/configuration/openfga', label: 'OpenFGA', icon: Icon.shield }] },
  {
    label: 'Modules',
    items: [
      { path: '/configuration/calendar-types', label: 'Calendar event types', icon: Icon.cal },
      { path: '/configuration/request-types', label: 'Request types', icon: Icon.file },
      { path: '/configuration/assets', label: 'Asset configuration', icon: Icon.laptop },
      { path: '/configuration/onboarding', label: 'Onboarding configuration', icon: Icon.userPlus },
    ],
  },
];

/** Settings & roles: who can do what. */
export const ACCESS_GROUPS: Group[] = [
  {
    label: 'Access',
    items: [
      { path: '/settings/roles', label: 'Roles & permissions', icon: Icon.shield },
      { label: 'Module permissions', icon: Icon.dash },
      { path: '/settings/assignments', label: 'Role assignments', icon: Icon.users },
      { path: '/settings/field-security', label: 'Field security', icon: Icon.shield },
      { path: '/settings/effective', label: 'Effective permissions', icon: Icon.check },
      { label: 'Access audit log', icon: Icon.file },
      { path: '/settings/area-owners', label: 'Area owners', icon: Icon.users },
    ],
  },
];

/** A page with its own sub-menu (Configuration, Settings & roles): searchable on wide screens, a dropdown on small ones. */
export function SectionLayout({ groups }: { groups: Group[] }) {
  const [q, setQ] = useState('');
  const match = (l: string) => l.toLowerCase().includes(q.trim().toLowerCase());
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="settings">
      <select className="input sm settings-select" value={pathname} onChange={(e) => nav(e.target.value)} aria-label="Page">
        {!groups.some((g) => g.items.some((i) => i.path === pathname)) && <option value={pathname}>Choose a page</option>}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((i) => (
              <option key={i.label} value={i.path ?? i.label} disabled={!i.path}>
                {i.label}
                {i.path ? '' : ' (coming next)'}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <aside className="settings-nav card">
        <label className="search-in" style={{ margin: 10, minWidth: 0 }}>
          {Icon.search}
          <input placeholder="find a setting…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {groups.map((g) => {
          const items = g.items.filter((i) => match(i.label));
          if (!items.length) return null;
          return (
            <div key={g.label} className="settings-group">
              <div className="dfx-nav-section">{g.label}</div>
              {items.map((i) =>
                i.path ? (
                  <NavLink key={i.label} to={i.path} className={({ isActive }) => `dfx-nav-item${isActive ? ' active' : ''}`}>
                    {i.icon}
                    <span>{i.label}</span>
                  </NavLink>
                ) : (
                  <span key={i.label} className="dfx-nav-item disabled" title="Coming next">
                    {i.icon}
                    <span>{i.label}</span>
                  </span>
                ),
              )}
            </div>
          );
        })}
      </aside>
      <section className="settings-main">
        <Outlet />
      </section>
    </div>
  );
}

/** Settings & roles has no built page yet. */
export function AccessComingNext() {
  return (
    <div className="card" style={{ padding: '32px 24px', gap: 8, alignItems: 'flex-start' }}>
      <span className="icon-circle">{Icon.shield}</span>
      <b style={{ fontSize: 16, color: 'var(--fg-1)' }}>Settings & roles</b>
      <span style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
        Roles, permissions, role assignments, field security and the access audit log live here. These screens are coming next. Departments, locations and employment types are under Configuration.
      </span>
    </div>
  );
}

export function SettingsHead({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--fg-1)' }}>{title}</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-2)' }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}
