import { useState } from 'react';
import type { PasswordPolicy } from './api';

/** New password + confirm, with the org's rule shown and checked before sending (the API checks again). */
export function PasswordFields({ policy, value, onChange, confirm, onConfirm, invalid }: { policy?: PasswordPolicy; value: string; onChange: (v: string) => void; confirm: string; onConfirm: (v: string) => void; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <label className="field">
        <span className="field-label">New password</span>
        <span className="input-wrap">
          <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={value} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} autoFocus />
          <button type="button" className="show-btn" onClick={() => setShow((s) => !s)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
        {policy?.hint && <span className="field-hint">{policy.hint}</span>}
      </label>
      <label className="field">
        <span className="field-label">Confirm password</span>
        <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} aria-invalid={invalid} onChange={(e) => onConfirm(e.target.value)} />
      </label>
    </>
  );
}

export function checkPassword(pw: string, confirm: string, policy?: PasswordPolicy): string | null {
  const min = policy?.minLength ?? 8;
  if (pw.length < min) return `Use at least ${min} characters.`;
  if (policy?.complex && !(/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw))) return 'Use upper and lower case letters, a digit and a symbol.';
  if (pw !== confirm) return "The passwords don't match.";
  return null;
}
