import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Splash } from '../components/Splash';

/** Only for signed-in users; others go to sign-in and come back here afterwards. */
export function RequireAuth() {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'booting') return <Splash />;
  if (status === 'signed-out') {
    const back = loc.pathname + loc.search;
    return <Navigate to={back === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(back)}`} replace />;
  }
  return <Outlet />;
}

/** Sign-in pages: a signed-in user goes straight on to where they were heading. */
export function GuestOnly() {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'booting') return <Splash />;
  if (status === 'signed-in') return <Navigate to={safeReturnTo(new URLSearchParams(loc.search).get('returnTo'))} replace />;
  return <Outlet />;
}

/** Only same-app paths, so a crafted link can't bounce the user to another site after sign-in. */
export function safeReturnTo(v: string | null | undefined): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}
