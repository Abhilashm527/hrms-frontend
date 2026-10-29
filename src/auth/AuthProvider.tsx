import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import * as session from '../lib/session';
import { authApi, type Me } from './api';

type Status = 'booting' | 'signed-in' | 'signed-out';

type AuthValue = {
  status: Status;
  user: session.User | null;
  landing: session.Landing | null;
  me: Me | undefined;
  /** Why the user was signed out, when it wasn't their own doing (e.g. "You were signed out"). Cleared once shown. */
  notice: string | null;
  clearNotice: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(session.current());
  const [status, setStatus] = useState<Status>('booting');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const off = session.subscribe((s, reason) => {
      setState(s);
      setStatus(s ? 'signed-in' : 'signed-out');
      if (!s) {
        // Nothing cached for one user may be shown to the next.
        queryClient.clear();
        if (reason) setNotice(reason);
      }
    });
    // Restore the session from the refresh cookie (page load, new tab, back from Microsoft).
    if (session.current()) {
      setStatus('signed-in');
    } else if (session.maybeSignedIn() || location.pathname === '/signed-in') {
      session
        .refresh()
        .catch(() => undefined)
        .finally(() => setStatus(session.current() ? 'signed-in' : 'signed-out'));
    } else {
      setStatus('signed-out');
    }
    return () => {
      off();
    };
  }, []);

  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: authApi.me, enabled: status === 'signed-in', staleTime: 5 * 60_000 });

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // the local sign-out below still happens; the server session expires on its own
    }
    session.clear();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user: state?.user ?? null,
      landing: state?.landing ?? null,
      me: me.data,
      notice,
      clearNotice: () => setNotice(null),
      signOut,
    }),
    [status, state, me.data, notice, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
