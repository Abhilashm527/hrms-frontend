import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AuthLayout } from '../auth/AuthLayout';
import { authApi } from '../auth/api';
import { PasswordFields, checkPassword } from '../auth/PasswordFields';
import { useLinkToken } from '../auth/useLinkToken';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';

export function ResetPasswordPage() {
  const token = useLinkToken();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const info = useQuery({ queryKey: ['reset', token], queryFn: () => authApi.resetInfo(token), enabled: !!token, retry: false, gcTime: 0 });
  const reset = useMutation({ mutationFn: () => authApi.reset(token, pw), onError: (e) => setErr(e.message) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = checkPassword(pw, confirm, info.data?.policy);
    if (problem) return setErr(problem);
    setErr(null);
    reset.mutate();
  };

  if (!token || info.isError) {
    return (
      <AuthLayout>
        <div className="auth-head">
          <h1>Link expired</h1>
          <p>{info.error?.message ?? 'This reset link is not valid.'} Request a new one from the sign-in page.</p>
        </div>
        <Link to="/login">← Back to sign in</Link>
      </AuthLayout>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthLayout>
        <div className="auth-head" style={{ gap: 12 }}>
          <span className="icon-circle">{Icon.check}</span>
          <h1>Password updated</h1>
          <p>Sign in with your new password. You were signed out everywhere else for your security.</p>
        </div>
        <Link className="btn btn-primary" to="/login">
          Sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-head">
        <h1>Choose a new password</h1>
        <p>{info.data ? <>For <strong>{info.data.email}</strong>.</> : 'Checking your link…'}</p>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        {err && <Alert>{err}</Alert>}
        <PasswordFields policy={info.data?.policy} value={pw} onChange={setPw} confirm={confirm} onConfirm={setConfirm} invalid={!!err} />
        <button type="submit" className="btn btn-primary" disabled={reset.isPending || !info.data}>
          {reset.isPending ? 'Saving…' : 'Set password'}
        </button>
      </form>
      <Link to="/login" style={{ fontSize: 12.5 }}>
        ← Back to sign in
      </Link>
    </AuthLayout>
  );
}
