import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { ApiError } from '../lib/http';
import type { SignedIn } from '../lib/session';
import { authApi } from './api';

/**
 * Two-step setup: scan the QR code (or type the key) into an authenticator app, then enter a code to prove it works.
 * The API signs the user in on success and returns one-time recovery codes, which the caller shows next.
 */
export function MfaSetup({ enrollToken, email, onDone, onExpired }: { enrollToken: string; email?: string; onDone: (body: SignedIn, at: number) => void; onExpired: (msg: string) => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // One secret per enrol token: never refetch, or the QR code would change under the user.
  const start = useQuery({ queryKey: ['mfa-enroll', enrollToken], queryFn: () => authApi.enrollStart(enrollToken), staleTime: Infinity, gcTime: 0, retry: false, refetchOnWindowFocus: false });

  useEffect(() => {
    if (start.error instanceof ApiError && start.error.status === 410) onExpired(start.error.message);
  }, [start.error, onExpired]);

  const confirm = useMutation({
    meta: { busy: 'Checking your code…' },
    mutationFn: (c: string) => authApi.enrollConfirm(enrollToken, c),
    onSuccess: (body) => onDone(body, Date.now()),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 410) return onExpired(e.message);
      setErr(e.message);
      setCode('');
    },
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code from your app.');
    setErr(null);
    confirm.mutate(code);
  };

  const copy = async () => {
    if (!start.data) return;
    await navigator.clipboard.writeText(start.data.secret.replace(/\s/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="auth-head">
        <span className="steps">
          <b>Step 1 of 2</b> · Set up two-step verification
        </span>
        <h1>Set up your authenticator</h1>
        <p>
          Two-step verification is required for {email ? <strong>{email}</strong> : 'your account'}. Use Microsoft Authenticator, Google Authenticator or any TOTP app.
        </p>
      </div>
      {start.isError && !(start.error instanceof ApiError && start.error.status === 410) && <Alert>{start.error.message}</Alert>}
      <div className="qr-row">
        <div className="qr" aria-label="QR code for your authenticator app">
          {start.data ? <span dangerouslySetInnerHTML={{ __html: start.data.qrSvg }} style={{ width: '100%', height: '100%' }} /> : <BlockLoader height={0} size={28} label="Preparing your QR code…" />}
        </div>
        <div className="qr-side">
          <ol>
            <li>Open your authenticator app.</li>
            <li>Add an account and scan this code.</li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <span className="field-hint">Can't scan? Enter this key instead:</span>
          <div className="secret">
            <span>{start.data?.secret ?? '•••• •••• •••• ••••'}</span>
            <button type="button" className="dfx-icon-btn" onClick={copy} disabled={!start.data} title={copied ? 'Copied' : 'Copy key'} aria-label="Copy key">
              {copied ? Icon.check : Icon.copy}
            </button>
          </div>
        </div>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        {err && <Alert>{err}</Alert>}
        <CodeInput
          value={code}
          onChange={setCode}
          onComplete={(v) => {
            setErr(null);
            if (!confirm.isPending) confirm.mutate(v);
          }}
          label="Code from your app" invalid={!!err} />
        <button type="submit" className="btn btn-primary" disabled={confirm.isPending || !start.data}>
          {confirm.isPending ? 'Verifying…' : 'Verify and continue'}
        </button>
      </form>
    </>
  );
}

/** Shown once after setup. The codes can't be shown again, so the user has to confirm they kept them. */
export function RecoveryCodes({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  const download = () => {
    const url = URL.createObjectURL(new Blob([`Ivoyant HRMS recovery codes\nEach code works once.\n\n${text}\n`], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'ivoyant-hrms-recovery-codes.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="auth-head">
        <span className="steps">
          <b>Step 2 of 2</b> · Save your recovery codes
        </span>
        <h1>Save your recovery codes</h1>
        <p>If you lose your phone, sign in with one of these instead of a code. Each works once. Keep them somewhere safe — they won't be shown again.</p>
      </div>
      <div className="codes" aria-label="Recovery codes">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {Icon.copy} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
          {Icon.download} Download
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I've saved these codes
      </label>
      <button type="button" className="btn btn-primary" disabled={!saved} onClick={onContinue}>
        Continue to HRMS
      </button>
    </>
  );
}

/** A 6-digit code box that keeps only digits and calls onComplete when the sixth one is typed or pasted. */
export function CodeInput({ value, onChange, onComplete, label, invalid, allowRecovery }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; label: string; invalid?: boolean; allowRecovery?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        ref={ref}
        className={allowRecovery ? 'input' : 'input input-code'}
        inputMode={allowRecovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        placeholder={allowRecovery ? 'xxxx-xxxx' : '000000'}
        maxLength={allowRecovery ? 32 : 6}
        value={value}
        aria-invalid={invalid}
        onChange={(e) => {
          const v = allowRecovery ? e.target.value.trim() : e.target.value.replace(/\D/g, '').slice(0, 6);
          onChange(v);
          if (!allowRecovery && v.length === 6) onComplete(v);
        }}
      />
    </label>
  );
}
