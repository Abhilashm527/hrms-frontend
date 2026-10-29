import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { safeReturnTo } from '../auth/guards';
import { Splash } from '../components/Splash';

/** Back from Microsoft: the API has set the refresh cookie; AuthProvider turns it into a session. */
export function SignedInPage() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'booting') return <Splash label="Signing you in…" />;
  if (status === 'signed-out') return <Navigate to="/login?error=sso" replace />;
  return <Navigate to={safeReturnTo(params.get('returnTo'))} replace />;
}
