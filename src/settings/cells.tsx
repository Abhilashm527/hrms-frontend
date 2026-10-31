import { useEffect, type ReactNode } from 'react';

/** A text or number input inside an editable table cell, with the API's message under it. */
export function Cell({ value, onChange, error, type = 'text', placeholder, mono, width }: { value: string; onChange: (v: string) => void; error?: string; type?: string; placeholder?: string; mono?: boolean; width?: number }) {
  return (
    <span className="cell">
      <input className={`input sm${mono ? ' mono' : ''}`} type={type} min={type === 'number' ? 0 : undefined} value={value} placeholder={placeholder} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} style={width ? { width } : undefined} />
      {error && <span className="field-err">{error}</span>}
    </span>
  );
}

export function SelectCell({ value, onChange, error, children, width }: { value: string; onChange: (v: string) => void; error?: string; children: ReactNode; width?: number }) {
  return (
    <span className="cell">
      <select className="input sm" value={value} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} style={width ? { width } : undefined}>
        {children}
      </select>
      {error && <span className="field-err">{error}</span>}
    </span>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

/** Warns before leaving the page with unsaved edits. */
export function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}
