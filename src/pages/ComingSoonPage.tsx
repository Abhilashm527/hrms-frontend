import { Link, useLocation } from 'react-router-dom';
import { ADMIN_NAV, ESS_NAV, allItems } from '../app/nav';
import { Icon } from '../components/icons';

/** Menu entries whose screens aren't built yet. */
export function ComingSoonPage() {
  const { pathname } = useLocation();
  const item = allItems([...ADMIN_NAV, ...ESS_NAV]).find((i) => i.path === pathname);
  return (
    <div className="card" style={{ padding: '40px 24px', alignItems: 'center', gap: 10, textAlign: 'center', maxWidth: 520, margin: '40px auto' }}>
      <span className="icon-circle" style={{ background: 'var(--bg-3)', color: 'var(--fg-2)' }}>
        {item?.icon ?? Icon.dash}
      </span>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-1)' }}>{item?.label ?? 'Page not found'}</span>
      <span style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>{item ? 'This screen is coming next.' : "This page doesn't exist."}</span>
      <Link className="btn btn-secondary btn-sm" to="/">
        Go to dashboard
      </Link>
    </div>
  );
}
