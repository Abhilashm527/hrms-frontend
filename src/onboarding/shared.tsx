import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/icons';
import { Overlay } from '../components/Overlay';
import { lookupApi, type HireStatus, type Person, type Stage } from './api';

export const STATUS: Record<HireStatus, { label: string; pill: string }> = {
  DRAFT: { label: 'Draft', pill: 'pill-muted' },
  INVITED: { label: 'Invited', pill: 'pill-info' },
  IN_PROGRESS: { label: 'In progress', pill: 'pill-info' },
  REVIEW_PENDING: { label: 'Review pending', pill: 'pill-warn' },
  ACTION_NEEDED: { label: 'Action needed', pill: 'pill-danger' },
  READY_TO_JOIN: { label: 'Ready to join', pill: 'pill-ok' },
  JOINED: { label: 'Joined', pill: 'pill-ok' },
};

export const STAGE_LABEL: Record<Stage, string> = {
  PROFILE: 'Profile',
  M365: 'Microsoft 365',
  INVITE: 'Invite',
  DETAILS_DOCS: 'Details & docs',
  HR_VERIFICATION: 'HR verification',
  DAY_1: 'Day 1',
};

export function StatusPill({ status }: { status: HireStatus }) {
  const s = STATUS[status] ?? { label: status, pill: 'pill-muted' };
  return <span className={`pill ${s.pill}`}>{s.label}</span>;
}

export const initials = (first?: string, last?: string) => ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '?';

export function joinWhen(daysToJoin: number, joined: boolean): string {
  if (joined) return daysToJoin === 0 ? 'joined today' : `joined ${Math.abs(daysToJoin)} day${Math.abs(daysToJoin) === 1 ? '' : 's'} ago`;
  if (daysToJoin === 0) return 'today';
  if (daysToJoin < 0) return `${-daysToJoin} day${daysToJoin === -1 ? '' : 's'} late`;
  return `in ${daysToJoin} day${daysToJoin === 1 ? '' : 's'}`;
}

/** Side panel over the page. Escape or a click outside closes it (unless `busy`). */
export function Drawer({ title, sub, wide, width, onClose, actions, foot, children, busy }: { title: ReactNode; sub?: ReactNode; wide?: boolean; width?: number; onClose: () => void; actions?: ReactNode; foot?: ReactNode; children: ReactNode; busy?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  return (
    <Overlay>
    <div className="drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className={`drawer${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          {actions}
          <button type="button" className="dfx-icon-btn" onClick={onClose} title="Close" disabled={busy}>
            {Icon.close}
          </button>
        </div>
        {children}
        {foot && <div className="drawer-foot">{foot}</div>}
      </div>
    </div>
    </Overlay>
  );
}

// ---- lookups: rarely change, so cached for 10 minutes ----

// A refused lookup isn't asked again by every screen that mounts; "Sync permissions" refetches them explicitly.
const LONG = { staleTime: 10 * 60_000, retryOnMount: false, refetchOnWindowFocus: false };
export const useDepartments = () => useQuery({ queryKey: ['lookup', 'departments'], queryFn: lookupApi.departments, ...LONG });
export const useLocations = () => useQuery({ queryKey: ['lookup', 'locations'], queryFn: lookupApi.locations, ...LONG });
export const useEmploymentTypes = () => useQuery({ queryKey: ['lookup', 'employment-types'], queryFn: lookupApi.employmentTypes, ...LONG });
export const useTitles = (departmentId?: string) => useQuery({ queryKey: ['lookup', 'titles', departmentId ?? ''], queryFn: () => lookupApi.titles(departmentId), ...LONG });

/** Type-ahead over the employee directory, for "Reports to". */
export function PersonPicker({ value, onChange, invalid }: { value: Person | null; onChange: (p: Person | null) => void; invalid?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, []);
  const people = useQuery({ queryKey: ['lookup', 'people', debounced], queryFn: () => lookupApi.people(debounced), enabled: open, staleTime: 60_000 });

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input
        className="input sm"
        placeholder="Search people…"
        aria-invalid={invalid}
        value={open ? q : (value?.name ?? '')}
        onFocus={() => {
          setOpen(true);
          setQ('');
        }}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <div className="menu" style={{ left: 0, right: 0, width: 'auto', top: 'calc(100% + 4px)', maxHeight: 260, overflow: 'auto' }}>
          {people.isLoading && <div className="card-empty">Searching…</div>}
          {people.data?.items.length === 0 && <div className="card-empty">No one found</div>}
          {people.data?.items.map((p) => (
            <button
              key={p.id}
              type="button"
              className="menu-item"
              style={{ width: '100%', boxSizing: 'border-box', height: 'auto', padding: '7px 10px' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <span>{p.name}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{[p.title, p.code].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One configurable form field, rendered by its type (TEXT, NUMBER, DATE, SELECT, TEXTAREA, PHONE, EMAIL, BOOLEAN, CURRENCY). */
export function ConfigInput({ type, value, onChange, options, invalid, disabled }: { type: string; value: string; onChange: (v: string) => void; options?: string[]; invalid?: boolean; disabled?: boolean }) {
  const t = type.toUpperCase();
  if (t === 'SELECT' || (options && options.length > 0 && t !== 'BOOLEAN')) {
    return (
      <select className="input sm" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} disabled={disabled}>
        <option value="">Select</option>
        {options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (t === 'BOOLEAN') {
    return (
      <button type="button" className="switch" role="switch" aria-checked={value === 'true'} onClick={() => onChange(value === 'true' ? 'false' : 'true')} disabled={disabled} />
    );
  }
  if (t === 'TEXTAREA') {
    return <textarea className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} disabled={disabled} />;
  }
  const html = t === 'DATE' ? 'date' : t === 'NUMBER' || t === 'CURRENCY' ? 'number' : t === 'EMAIL' ? 'email' : t === 'PHONE' ? 'tel' : 'text';
  return <input className="input sm" type={html} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} disabled={disabled} />;
}

export function FieldShell({ label, required, error, children, wide }: { label: string; required?: boolean; error?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? ' span-all' : ''}`}>
      <span className="field-label" style={{ justifyContent: 'flex-start' }}>
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {error && <span className="field-err">{error}</span>}
    </label>
  );
}

export function fmtBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
