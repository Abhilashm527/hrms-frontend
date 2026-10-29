import { get, post, del } from '../lib/http';
import type { Landing, SignedIn, User } from '../lib/session';

export type AuthConfig = { ssoEnabled: boolean; passwordEnabled: boolean; domains: string[]; supportEmail: string; pwPolicy: string };
export type PasswordPolicy = { mode: string; minLength: number; complex: boolean; hint: string };

export type MfaRequired = { status: 'MFA_REQUIRED'; challengeId: string; methods: string[]; expiresIn: number };
export type EnrollRequired = { status: 'MFA_ENROLL_REQUIRED'; enrollToken: string };
export type LoginResult = SignedIn | MfaRequired | EnrollRequired;

export type Enrolment = { secret: string; otpauthUrl: string; qrSvg: string };

export type Me = {
  user: User;
  landing: Landing;
  consoleAccess: boolean;
  amr: string[];
  session: { id: string; remember: boolean; expiresAt: string; amr: string[] } | null;
  security: { hasPassword: boolean; mfaEnrolled: boolean; passwordLoginAllowed: boolean };
};

export type SessionRow = { id: string; device: string; place: string | null; lastActiveAt: string; createdAt: string; method: 'SSO' | 'PASSWORD'; current: boolean };

const open = { auth: false } as const;

export const authApi = {
  config: () => get<AuthConfig>('/auth/config', open),
  policy: () => get<PasswordPolicy>('/auth/password/policy', open),
  login: (email: string, password: string, remember: boolean) => post<LoginResult>('/auth/login', { email, password, remember }, open),
  verifyMfa: (challengeId: string, code: string) => post<SignedIn>('/auth/mfa/verify', { challengeId, code }, open),
  enrollStart: (enrollToken: string) => post<Enrolment>('/auth/mfa/enroll/start', { enrollToken }, open),
  enrollConfirm: (enrollToken: string, code: string) => post<SignedIn>('/auth/mfa/enroll/confirm', { enrollToken, code }, open),
  forgot: (email: string) => post<{ message: string }>('/auth/password/forgot', { email }, open),
  resetInfo: (token: string) => get<{ email: string; policy: PasswordPolicy }>(`/auth/password/reset/${encodeURIComponent(token)}`, open),
  reset: (token: string, newPassword: string) => post<void>('/auth/password/reset', { token, newPassword }, open),
  activateInfo: (token: string) =>
    get<{ name: string; firstName: string; email: string; needsPassword: boolean; needsMfa: boolean; policy: PasswordPolicy }>(`/auth/activate/${encodeURIComponent(token)}`, open),
  activate: (token: string, password: string | null) => post<SignedIn | EnrollRequired>('/auth/activate', { token, password }, open),
  logout: () => post<void>('/auth/logout', {}, open),
  me: () => get<Me>('/auth/me'),
  sessions: () => get<SessionRow[]>('/me/sessions'),
  endSession: (id: string) => del<void>(`/me/sessions/${id}`),
  endOtherSessions: () => del<{ signedOut: number }>('/me/sessions?others=true'),
  ssoStartUrl: (loginHint: string, remember: boolean, returnTo: string) =>
    `/api/v1/auth/sso/microsoft/start?${new URLSearchParams({ loginHint, remember: String(remember), returnTo })}`,
};
