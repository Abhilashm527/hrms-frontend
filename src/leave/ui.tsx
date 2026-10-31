import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/icons';
import { Overlay } from '../components/Overlay';
import { TYPE_COLORS, type Person, type ReqStatus, type StepState } from './api';

// ------------------------------------------------------------------ formatting

const dShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dFull = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const tShort = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const parse = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d);

export const fmtDate = (d?: string | null) => (d ? dFull.format(parse(d)) : '—');
export const fmtShort = (d?: string | null) => (d ? dShort.format(parse(d)) : '—');
export const fmtTime = (d?: string | null) => (d ? tShort.format(parse(d)) : '');
export const range = (from: string, to: string) => (from === to ? fmtDate(from) : parse(from).getFullYear() === parse(to).getFullYear() ? `${fmtShort(from)} – ${fmtDate(to)}` : `${fmtDate(from)} – ${fmtDate(to)}`);
export const dd = (n: number, half = false) => (half ? '½ day' : `${n} ${n === 1 ? 'day' : 'days'}`);
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const inr = (n: number | string | null | undefined) => (n == null ? '—' : inrFmt.format(Number(n)));
export const num = (n: number | null | undefined) => (n == null ? '—' : String(n));
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ------------------------------------------------------------------ small pieces

export function TypeChip({ code, color, style }: { code: string; color?: number; style?: CSSProperties }) {
  const [fg, bg] = TYPE_COLORS[color ?? 9] ?? TYPE_COLORS[9];
  return (
    <span className="lv-type" style={{ color: fg, background: bg, ...style }}>
      {code}
    </span>
  );
}

const REQ_PILL: Record<ReqStatus, [string, string]> = {
  PENDING: ['pill-warn', 'pending'],
  APPROVED: ['pill-ok', 'approved'],
  REJECTED: ['pill-danger', 'rejected'],
  CANCELLED: ['pill-muted', 'cancelled'],
};
export function ReqBadge({ status }: { status: ReqStatus }) {
  const [cls, label] = REQ_PILL[status] ?? ['pill-muted', status.toLowerCase()];
  return <span className={`pill ${cls}`}>{label}</span>;
}

/** A status pill in the design's colours: healthy, pending, degraded, failed, running, paused, stopped. */
export function KindBadge({ kind, label }: { kind: string; label: string }) {
  return <span className={`pill lv-kind-${kind}`}>{label}</span>;
}

export function StepDots({ states }: { states: StepState[] }) {
  return (
    <span className="lv-dots">
      {states.map((s, i) => (
        <span key={i} className={`lv-dot ${s.toLowerCase()}`} />
      ))}
    </span>
  );
}

const DEPT_TONE = (c?: number) => (c == null ? { fg: 'var(--dc-n-fg)', bg: 'var(--dc-n-bg)' } : { fg: `var(--dc${c}-fg)`, bg: `var(--dc${c}-bg)` });

export function Who({ p, sub, size = 30 }: { p?: Person | null; sub?: ReactNode; size?: number }) {
  if (!p) return <span className="lv-who muted">—</span>;
  return (
    <span className="lv-who">
      <Avatar url={p.photoUrl} initials={p.initials} size={size} tone={DEPT_TONE(p.department?.color)} />
      <span className="lv-two">
        <b>{p.name}</b>
        <span>{sub ?? p.department?.name ?? p.code ?? ''}</span>
      </span>
    </span>
  );
}

/** The design's pill switch (white raised option on a grey track). */
export function Seg<T extends string>({ value, options, onChange, size }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; size?: 'sm' }) {
  return (
    <span className={`lv-seg${size === 'sm' ? ' sm' : ''}`} role="group">
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </span>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="lv-kpi">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

// ------------------------------------------------------------------ table and pager

export function Grid({ cols, head, children, minWidth, empty }: { cols: string; head: ReactNode[]; children: ReactNode; minWidth?: number; empty?: ReactNode }) {
  return (
    <div className="lv-tbl">
      <div style={{ minWidth }}>
        <div className="lv-head" style={{ gridTemplateColumns: cols }}>
          {head.map((h, i) => (
            <span key={i}>{h}</span>
          ))}
        </div>
        {children}
        {empty}
      </div>
    </div>
  );
}

export function Row({ cols, onClick, children, active, style }: { cols: string; onClick?: () => void; children: ReactNode; active?: boolean; style?: CSSProperties }) {
  const cls = `lv-row${onClick ? ' click' : ''}${active ? ' on' : ''}`;
  return onClick ? (
    <button type="button" className={cls} style={{ gridTemplateColumns: cols, ...style }} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div className={cls} style={{ gridTemplateColumns: cols, ...style }}>
      {children}
    </div>
  );
}

/** "Showing 1–10 of 42", rows per page and numbered pages with gaps, as on every list in the design. */
export function Pager({ page, size, total, onPage, onSize, sizes = [10, 20, 50], noun = 'results', extra }: { page: number; size: number; total: number; onPage: (p: number) => void; onSize?: (s: number) => void; sizes?: number[]; noun?: string; extra?: ReactNode }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(page, pages - 1);
  const n = p + 1;
  let seq: (number | '…')[] = [];
  if (pages <= 7) seq = Array.from({ length: pages }, (_, i) => i + 1);
  else {
    seq = [1];
    const a = Math.max(2, n - 1);
    const b = Math.min(pages - 1, n + 1);
    if (a > 2) seq.push('…');
    for (let i = a; i <= b; i++) seq.push(i);
    if (b < pages - 1) seq.push('…');
    seq.push(pages);
  }
  return (
    <div className="lv-pager">
      <span>{total ? `Showing ${p * size + 1}–${Math.min(total, (p + 1) * size)} of ${total} ${noun}` : `0 ${noun}`}</span>
      <span className="grow" />
      {extra}
      {onSize && (
        <select className="sel sm" value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Rows per page">
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
      )}
      <span className="dir-pages">
        <button type="button" className="dfx-icon-btn" disabled={p <= 0} onClick={() => onPage(p - 1)} title="Previous page">
          {Icon.chevL}
        </button>
        {seq.map((x, i) =>
          x === '…' ? (
            <span key={`g${i}`} className="gap">
              …
            </span>
          ) : (
            <button key={x} type="button" className="num" aria-current={x === n ? 'page' : undefined} onClick={() => onPage(x - 1)}>
              {x}
            </button>
          ),
        )}
        <button type="button" className="dfx-icon-btn" disabled={p >= pages - 1} onClick={() => onPage(p + 1)} title="Next page">
          {Icon.chevR}
        </button>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ modal

export function Modal({ title, sub, onClose, children, foot, width = 520 }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; foot: ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <Overlay>
      <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: width }}>
          <div className="lv-modal-head">
            <span>
              <b>{title}</b>
              {sub && <small>{sub}</small>}
            </span>
            <button type="button" className="dfx-icon-btn" onClick={onClose} title="Close">
              {Icon.close}
            </button>
          </div>
          <div className="lv-modal-body">{children}</div>
          <div className="modal-foot">{foot}</div>
        </div>
      </div>
    </Overlay>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: ReactNode; error?: string }) {
  return (
    <label className="lv-field">
      <span>{label}</span>
      {children}
      {error ? <small className="err">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );
}
