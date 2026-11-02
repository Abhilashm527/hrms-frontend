import { useEffect, useState } from 'react';
import { catTone } from './api';

export const DOC_ICON = (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M9 13h6" />
    <path d="M9 17h4" />
  </svg>
);
export const CYCLES = [3, 6, 12, 24, 36];
export const APPLIES = ['All employees', 'Full-time employees', 'Managers', 'Contractors', 'Interns'];

export function CatChip({ c }: { c: { name: string; color: string } }) {
  const t = catTone(c.color);
  return (
    <span className="po-cat" style={{ color: t.fg, background: t.bg }}>
      <span style={{ background: c.color }} />
      {c.name}
    </span>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}

export function useToast() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    if (!t) return;
    const x = setTimeout(() => setT(null), 3200);
    return () => clearTimeout(x);
  }, [t]);
  return [t, setT] as const;
}

export const initials = (n: string | null | undefined) =>
  (n || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('') || '–';
