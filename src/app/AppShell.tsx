import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Icon, Logo } from '../components/icons';
import { ThemeButton } from '../components/ThemeButton';
import { useTheme, type ThemeMode } from '../lib/theme';
import { AccountModal } from './AccountModal';
import { ADMIN_NAV, ESS_NAV, allItems } from './nav';

const SB_KEY = 'ivy-hrms-sb';

export function AppShell() {
  const { user, me, landing, signOut } = useAuth();
  const admin = (me?.consoleAccess ?? landing === 'ADMIN') === true;
  const groups = admin ? ADMIN_NAV : ESS_NAV;
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SB_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);

  useEffect(() => {
    const item = allItems(groups).find((i) => i.path === loc.pathname);
    document.title = `${item?.label ?? 'iHRMS'} · Ivoyant HRMS`;
  }, [loc.pathname, groups]);

  const toggleSb = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SB_KEY, c ? '0' : '1');
      } catch {
        // preference not kept
      }
      return !c;
    });
  };

  const ini = user?.initials || '?';

  return (
    <div className="dfx-shell">
      <header className="dfx-ghead">
        <div className="dfx-ghead-side">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Logo size={22} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>ivoyant</span>
            <span className="dfx-ent-badge">HRMS</span>
          </div>
        </div>
        <div className="dfx-ghead-center">
          <button className="dfx-ghead-search" type="button" title="Search is coming soon">
            {Icon.search}
            <span className="dfx-ghead-search-ph">search people, requests…</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
        <div className="dfx-ghead-side dfx-ghead-side-r">
          <ThemeButton />
          {admin && (
            <NavLink to="/settings" className="dfx-icon-btn" title="Settings & roles">
              {Icon.settings}
            </NavLink>
          )}
          <button className="dfx-icon-btn" type="button" title="Notifications">
            {Icon.bell}
          </button>
          <span className="dfx-ghead-sep" />
          <div style={{ position: 'relative' }}>
            <button type="button" className="dfx-ghead-avatar-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} title="Account">
              <span className="dfx-avatar">{ini}</span>
            </button>
            {menu && (
              <>
                <div className="menu-scrim" onClick={() => setMenu(false)} />
                <div className="menu" role="menu">
                  <div className="menu-head">
                    <span className="dfx-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
                      {ini}
                    </span>
                    <span className="who">
                      <b>{user?.name}</b>
                      <span>{user?.email}</span>
                      <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{admin ? 'Admin console' : 'Self-service'}</span>
                    </span>
                  </div>
                  <div className="menu-sec">
                    <ThemeRow />
                    <button
                      type="button"
                      className="menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        setAccount(true);
                      }}
                    >
                      {Icon.user}
                      <span style={{ flex: 1 }}>My account</span>
                    </button>
                  </div>
                  <div className="menu-sec">
                    <button type="button" className="menu-item danger" role="menuitem" onClick={() => void signOut()}>
                      {Icon.signOut}
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className={`dfx-app${collapsed ? ' sb-collapsed' : ''}`}>
        <aside className={`dfx-sidebar${collapsed ? ' collapsed' : ''}`}>
          <button className="dfx-sb-toggle" type="button" onClick={toggleSb} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? Icon.chevR : Icon.chevL}
          </button>
          <div className="dfx-picker">
            <span className="dfx-picker-icon" style={{ background: 'transparent', border: 'none' }}>
              <Logo size={20} />
            </span>
            <span className="dfx-picker-text">
              <span className="dfx-picker-name">Ivoyant Technologies</span>
              <span className="dfx-picker-sub">
                Pvt Ltd · <span className="env">{fiscalYear()}</span>
              </span>
            </span>
          </div>
          <nav className="dfx-nav" aria-label="Main">
            {groups.map((g) => (
              <div className="dfx-nav-group" key={g.label}>
                <div className="dfx-nav-section">{g.label}</div>
                {g.items.map((it) => (
                  <NavLink key={it.path} to={it.path} end={it.path === '/'} className={({ isActive }) => `dfx-nav-item${isActive ? ' active' : ''}`} title={it.label}>
                    {it.icon}
                    <span style={{ flex: 1 }}>{it.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="dfx-sidebar-foot">
            <div className="dfx-user" onClick={() => setAccount(true)} title="My account" style={{ cursor: 'pointer' }}>
              <span className="dfx-avatar">{ini}</span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-1)' }}>{user?.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.code ?? user?.email}</span>
              </span>
              <button
                className="dfx-icon-btn"
                type="button"
                title="Sign out"
                onClick={(e) => {
                  e.stopPropagation();
                  void signOut();
                }}
              >
                {Icon.signOut}
              </button>
            </div>
          </div>
        </aside>

        <main className="dfx-main" style={{ position: 'relative' }}>
          <div className="bg-mark" aria-hidden="true">
            <Logo />
          </div>
          <div className="dfx-content page">
            <Outlet />
          </div>
        </main>
      </div>
      {account && <AccountModal onClose={() => setAccount(false)} />}
    </div>
  );
}

function ThemeRow() {
  const { mode, set } = useTheme();
  const opts: [ThemeMode, string][] = [
    ['auto', 'Auto'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px' }}>
      <span style={{ display: 'flex', flexDirection: 'column', flex: 1, lineHeight: 1.3 }}>
        <span style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>Theme</span>
        <span style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{mode === 'auto' ? 'Dark 7 pm – 7 am' : mode === 'light' ? 'Always light' : 'Always dark'}</span>
      </span>
      <span className="seg">
        {opts.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => set(k)}>
            {l}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Indian financial year, April to March. */
function fiscalYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `FY ${y}–${String(y + 1).slice(2)}`;
}
