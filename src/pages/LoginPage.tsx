import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AuthLayout, useAuthConfig } from '../auth/AuthLayout';
import { useAuth } from '../auth/AuthProvider';
import { authApi, type LoginResult } from '../auth/api';
import { CodeInput, MfaSetup, RecoveryCodes } from '../auth/MfaSetup';
import { safeReturnTo } from '../auth/guards';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { ApiError } from '../lib/http';
import * as session from '../lib/session';

type Step =
  | { kind: 'cred' }
  | { kind: 'mfa'; challengeId: string }
  | { kind: 'enroll'; enrollToken: string }
  | { kind: 'codes'; body: session.SignedIn; at: number }
  | { kind: 'forgot' }
  | { kind: 'sent' };

const REMEMBER_KEY = 'hrms-last-email';

function lastEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LoginPage() {
  const [params] = useSearchParams();
  const cfg = useAuthConfig();
  const { notice, clearNotice } = useAuth();
  const [step, setStep] = useState<Step>({ kind: 'cred' });
  const [email, setEmail] = useState(lastEmail);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [err, setErr] = useState<string | null>(params.get('error') ? ssoError(params.get('error')!) : null);
  const [bad, setBad] = useState<'email' | 'pw' | 'code' | null>(null);
  const returnTo = safeReturnTo(params.get('returnTo'));
  const domain = cfg.data?.domains[0] ?? 'ivoyant.com';

  // A "you were signed out" message is shown once, on the sign-in step.
  useEffect(() => {
    if (notice) {
      setErr(notice);
      clearNotice();
    }
  }, [notice, clearNotice]);

  const back = useCallback((msg?: string) => {
    setStep({ kind: 'cred' });
    setCode('');
    setPassword('');
    setUseRecovery(false);
    setBad(null);
    setErr(msg ?? null);
  }, []);

  const finish = (body: session.SignedIn, at = Date.now()) => {
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? body.user.email : '');
    } catch {
      // not remembered; nothing else depends on it
    }
    // Signing in flips the auth state; GuestOnly then sends the user on to returnTo.
    session.accept(body, at);
  };

  const login = useMutation({
    mutationFn: () => authApi.login(email.trim(), password, remember),
    onSuccess: (r: LoginResult) => {
      setErr(null);
      setBad(null);
      setPassword('');
      if (r.status === 'OK') finish(r);
      else if (r.status === 'MFA_REQUIRED') setStep({ kind: 'mfa', challengeId: r.challengeId });
      else setStep({ kind: 'enroll', enrollToken: r.enrollToken });
    },
    onError: (e) => {
      setPassword('');
      if (e instanceof ApiError) {
        if (e.code === 'INVALID_CREDENTIALS') {
          const left = Number(e.extra.attemptsLeft);
          setBad('pw');
          return setErr(`Incorrect email or password${left > 0 ? ` · ${left} attempt${left === 1 ? '' : 's'} left` : ''}`);
        }
        if (e.code === 'EMAIL_DOMAIN') setBad('email');
      }
      setErr(e.message);
    },
  });

  const verify = useMutation({
    mutationFn: ({ challengeId, c }: { challengeId: string; c: string }) => authApi.verifyMfa(challengeId, c),
    onSuccess: (body) => finish(body),
    onError: (e) => {
      setCode('');
      if (e instanceof ApiError && e.code === 'CHALLENGE_EXPIRED') return back(e.message);
      setBad('code');
      const left = e instanceof ApiError ? Number(e.extra.attemptsLeft) : NaN;
      setErr(left > 0 ? `${e.message} ${left} attempt${left === 1 ? '' : 's'} left.` : e.message);
    },
  });

  const forgot = useMutation({
    mutationFn: () => authApi.forgot(email.trim()),
    onSuccess: () => setStep({ kind: 'sent' }),
    onError: (e) => setErr(e.message),
  });

  const submitCred = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setBad('email');
      return setErr(`Enter your @${domain} work email`);
    }
    if (!password) {
      setBad('pw');
      return setErr('Enter your password');
    }
    login.mutate();
  };

  const submitCode = (c = code) => {
    if (step.kind !== 'mfa' || verify.isPending) return;
    if (!useRecovery && !/^\d{6}$/.test(c)) {
      setBad('code');
      return setErr('Enter the 6-digit code from your app.');
    }
    if (useRecovery && c.trim().length < 6) {
      setBad('code');
      return setErr('Enter one of your recovery codes.');
    }
    setErr(null);
    verify.mutate({ challengeId: step.challengeId, c: c.trim() });
  };

  const onExpired = useCallback((msg: string) => back(msg), [back]);

  if (step.kind === 'enroll') {
    return (
      <AuthLayout wide>
        <MfaSetup enrollToken={step.enrollToken} email={email} onDone={(body, at) => (body.recoveryCodes?.length ? setStep({ kind: 'codes', body, at }) : finish(body, at))} onExpired={onExpired} />
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => back()}>
          ← Back to sign in
        </button>
      </AuthLayout>
    );
  }

  if (step.kind === 'codes') {
    return (
      <AuthLayout wide>
        <RecoveryCodes codes={step.body.recoveryCodes ?? []} onContinue={() => finish(step.body, step.at)} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {step.kind === 'cred' && (
        <>
          <div className="auth-head">
            <h1>Sign in</h1>
            <p>Use your Ivoyant work account.</p>
          </div>
          {cfg.data?.ssoEnabled && (
            <>
              <a className="btn btn-secondary" href={authApi.ssoStartUrl(email.trim(), remember, returnTo)}>
                <span className="ms-logo" aria-hidden="true">
                  <i style={{ background: '#F25022' }} />
                  <i style={{ background: '#7FBA00' }} />
                  <i style={{ background: '#00A4EF' }} />
                  <i style={{ background: '#FFB900' }} />
                </span>
                Continue with Microsoft
              </a>
              <div className="auth-or">or with email</div>
            </>
          )}
          {cfg.data && !cfg.data.passwordEnabled && <Alert kind="info">Password sign-in is turned off for this organization. Only IT break-glass accounts can use it.</Alert>}
          <form className="auth-form" onSubmit={submitCred} noValidate>
            {err && <Alert>{err}</Alert>}
            <label className="field">
              <span className="field-label">Work email</span>
              <input
                className="input"
                type="email"
                name="email"
                autoComplete="username"
                autoFocus={!email}
                placeholder={`name@${domain}`}
                value={email}
                aria-invalid={bad === 'email'}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">
                Password
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setErr(null);
                    setStep({ kind: 'forgot' });
                  }}
                >
                  Forgot password?
                </button>
              </span>
              <span className="input-wrap">
                <input
                  className="input"
                  type={show ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  autoFocus={!!email}
                  placeholder="Enter password"
                  value={password}
                  aria-invalid={bad === 'pw'}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="show-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Keep me signed in on this device
            </label>
            <button type="submit" className="btn btn-primary" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </>
      )}

      {step.kind === 'mfa' && (
        <>
          <div className="auth-head">
            <span className="icon-circle">{Icon.shield}</span>
            <h1>Two-step verification</h1>
            <p>
              {useRecovery ? 'Enter one of the recovery codes you saved when you set up two-step verification for ' : 'Enter the 6-digit code from your authenticator app for '}
              <strong>{email}</strong>.
            </p>
          </div>
          <form
            className="auth-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submitCode();
            }}
          >
            {err && <Alert>{err}</Alert>}
            <CodeInput
              key={useRecovery ? 'r' : 'c'}
              value={code}
              onChange={setCode}
              onComplete={(v) => submitCode(v)}
              label={useRecovery ? 'Recovery code' : 'Verification code'}
              invalid={bad === 'code'}
              allowRecovery={useRecovery}
            />
            <button type="submit" className="btn btn-primary" disabled={verify.isPending}>
              {verify.isPending ? 'Verifying…' : 'Verify'}
            </button>
          </form>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <button type="button" className="link-btn" onClick={() => back()}>
              ← Back to sign in
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setUseRecovery((r) => !r);
                setCode('');
                setErr(null);
                setBad(null);
              }}
            >
              {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
            </button>
          </div>
        </>
      )}

      {step.kind === 'forgot' && (
        <>
          <div className="auth-head">
            <h1>Reset password</h1>
            <p>We'll email a reset link to your work address. The link expires in 30 minutes.</p>
          </div>
          <form
            className="auth-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
                setBad('email');
                return setErr(`Enter your @${domain} work email`);
              }
              setErr(null);
              forgot.mutate();
            }}
          >
            {err && <Alert>{err}</Alert>}
            <label className="field">
              <span className="field-label">Work email</span>
              <input className="input" type="email" autoComplete="username" placeholder={`name@${domain}`} value={email} aria-invalid={bad === 'email'} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <button type="submit" className="btn btn-primary" disabled={forgot.isPending}>
              {forgot.isPending ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => back()}>
            ← Back to sign in
          </button>
        </>
      )}

      {step.kind === 'sent' && (
        <>
          <div className="auth-head" style={{ gap: 12 }}>
            <span className="icon-circle">{Icon.mail}</span>
            <h1>Check your email</h1>
            <p>
              If <strong>{email}</strong> has an account, a reset link is on its way.
            </p>
          </div>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => back()}>
            ← Back to sign in
          </button>
        </>
      )}
    </AuthLayout>
  );
}

function ssoError(code: string): string {
  switch (code) {
    case 'access_denied':
      return 'Microsoft sign-in was cancelled.';
    case 'NO_ACCOUNT':
    case 'not_found':
      return "There's no HRMS account for that Microsoft user. Contact IT.";
    case 'ACCOUNT_DISABLED':
      return 'Your account is disabled. Contact IT.';
    default:
      return 'Microsoft sign-in did not complete. Try again.';
  }
}
