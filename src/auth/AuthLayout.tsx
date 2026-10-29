import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Logo } from '../components/icons';
import { ThemeButton } from '../components/ThemeButton';
import { authApi } from './api';

/** The two-panel sign-in frame from the UX: brand panel on the left, the current step on the right. */
export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const cfg = useAuthConfig();
  const support = cfg.data?.supportEmail ?? 'it-support@ivoyant.com';
  useEffect(() => {
    document.title = 'Sign in · Ivoyant HRMS';
  }, []);
  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="auth-brand">
          <Logo size={26} />
          <b>ivoyant</b>
          <span className="dfx-ent-badge">HRMS</span>
        </div>
        <div className="auth-pitch">
          <span className="auth-eyebrow">People portal</span>
          <h2>People, leave, payroll and policies for Ivoyant Technologies.</h2>
          <p>Admins sign in to the admin console, everyone else to self-service. Sign-ins are logged and audited.</p>
        </div>
        <div className="auth-legal">
          <span>© {new Date().getFullYear()} Ivoyant Technologies Pvt Ltd</span>
          <a href="#">Privacy</a>
          <a href={`mailto:${support}`}>Help</a>
        </div>
        <Logo className="auth-mark" />
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <ThemeButton />
        </div>
        <div className="auth-center">
          <div className={`auth-card${wide ? ' wide' : ''}`}>{children}</div>
        </div>
        <div className="auth-foot">
          Trouble signing in? Contact <a href={`mailto:${support}`}>{support}</a>
        </div>
      </main>
    </div>
  );
}

/** Sign-in options rarely change; fetch once per visit. */
export function useAuthConfig() {
  return useQuery({ queryKey: ['auth', 'config'], queryFn: authApi.config, staleTime: Infinity, gcTime: Infinity });
}
