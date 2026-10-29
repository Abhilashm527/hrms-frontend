import { useCallback, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AuthLayout } from '../auth/AuthLayout';
import { authApi } from '../auth/api';
import { MfaSetup, RecoveryCodes } from '../auth/MfaSetup';
import { PasswordFields, checkPassword } from '../auth/PasswordFields';
import { useLinkToken } from '../auth/useLinkToken';
import { Alert } from '../components/Alert';
import * as session from '../lib/session';

type Step = { kind: 'password' } | { kind: 'enroll'; enrollToken: string } | { kind: 'codes'; body: session.SignedIn; at: number };

/** First sign-in from the invite email: set a password (unless the org uses Microsoft sign-in), then two-step setup if required. */
export function ActivatePage() {
  const token = useLinkToken();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const info = useQuery({ queryKey: ['activate', token], queryFn: () => authApi.activateInfo(token), enabled: !!token, retry: false, gcTime: 0 });

  const activate = useMutation({
    mutationFn: () => authApi.activate(token, info.data?.needsPassword ? pw : null),
    onSuccess: (r) => (r.status === 'OK' ? session.accept(r) : setStep({ kind: 'enroll', enrollToken: r.enrollToken })),
    onError: (e) => setErr(e.message),
  });

  const onExpired = useCallback((msg: string) => {
    setErr(`${msg} Your account is active — sign in to finish setting up two-step verification.`);
    setStep({ kind: 'password' });
  }, []);

  if (!token || info.isError) {
    return (
      <AuthLayout>
        <div className="auth-head">
          <h1>Link expired</h1>
          <p>{info.error?.message ?? 'This activation link is not valid.'}</p>
        </div>
        <Link to="/login">← Go to sign in</Link>
      </AuthLayout>
    );
  }

  if (step.kind === 'enroll') {
    return (
      <AuthLayout wide>
        <MfaSetup enrollToken={step.enrollToken} email={info.data?.email} onDone={(body, at) => (body.recoveryCodes?.length ? setStep({ kind: 'codes', body, at }) : session.accept(body, at))} onExpired={onExpired} />
      </AuthLayout>
    );
  }
  if (step.kind === 'codes') {
    return (
      <AuthLayout wide>
        <RecoveryCodes codes={step.body.recoveryCodes ?? []} onContinue={() => session.accept(step.body, step.at)} />
      </AuthLayout>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (info.data?.needsPassword) {
      const problem = checkPassword(pw, confirm, info.data.policy);
      if (problem) return setErr(problem);
    }
    setErr(null);
    activate.mutate();
  };

  return (
    <AuthLayout>
      <div className="auth-head">
        <h1>{info.data ? `Welcome, ${info.data.firstName}` : 'Activate your account'}</h1>
        <p>
          {info.data ? (
            <>
              Set up sign-in for <strong>{info.data.email}</strong>.{info.data.needsMfa ? ' Next you will set up two-step verification.' : ''}
            </>
          ) : (
            'Checking your link…'
          )}
        </p>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        {err && <Alert>{err}</Alert>}
        {info.data?.needsPassword && <PasswordFields policy={info.data.policy} value={pw} onChange={setPw} confirm={confirm} onConfirm={setConfirm} invalid={!!err} />}
        <button type="submit" className="btn btn-primary" disabled={activate.isPending || !info.data}>
          {activate.isPending ? 'Activating…' : 'Activate account'}
        </button>
      </form>
    </AuthLayout>
  );
}
