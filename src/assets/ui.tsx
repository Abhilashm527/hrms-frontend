import type { ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { BADGE, type Color, type DateState, fmtD, type Kpi, SLOT, WARRANTY } from './api';

export const PALETTE = ['#1F4FE0', '#0F766E', '#B45309', '#7C3AED', '#BE185D', '#0369A1', '#4D7C0F', '#475569', '#B91C1C'];

export function Badge({ color, children }: { color: Color; children: ReactNode }) {
  return (
    <span className="as-badge" style={{ color: color[0], background: color[1] }}>
      <i style={{ background: color[0] }} />
      {children}
    </span>
  );
}
export const StatusBadge = ({ s }: { s: { name: string; color: number; badge?: string } }) => <Badge color={SLOT[s.color] ?? BADGE[s.badge ?? 'paused']}>{s.name}</Badge>;
export const StateBadge = ({ s }: { s: { label: string; badge: string } }) => <Badge color={BADGE[s.badge] ?? BADGE.paused}>{s.label.charAt(0).toUpperCase() + s.label.slice(1)}</Badge>;

export function TypeChip({ name, color }: { name: string; color?: Color }) {
  return (
    <span className="as-type" style={color ? { color: color[0], background: color[1] } : undefined}>
      {name}
    </span>
  );
}

export function Warranty({ w }: { w: DateState }) {
  if (w.state === 'NONE') return <span className="as-muted">—</span>;
  const c = WARRANTY[w.state];
  return (
    <span className="as-warranty" style={{ color: c[0] }}>
      {fmtD(w.until)}
      {w.state === 'EXPIRED' ? ' · expired' : w.state === 'ENDING' ? ` · ${w.daysLeft} d left` : ''}
    </span>
  );
}

export function Who({ p, sub, onClick }: { p: { name: string; initials: string; photoUrl?: string; title?: string | null; department?: string | null }; sub?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <Avatar url={p.photoUrl?.replace(/^\/api\/v1/, '')} initials={p.initials} size={26} />
      <span className="as-who-t">
        <b>{p.name}</b>
        {sub !== undefined ? <small>{sub}</small> : p.title || p.department ? <small>{[p.title, p.department].filter(Boolean).join(' · ')}</small> : null}
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className="as-who"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {inner}
    </button>
  ) : (
    <span className="as-who">{inner}</span>
  );
}

export function Kpis({ items, icons }: { items: Kpi[]; icons: ReactNode[] }) {
  return (
    <div className="as-kpis">
      {items.map((k, i) => (
        <div key={k.key} className="as-kpi">
          <span className="ic">{icons[i]}</span>
          <span>
            <small>{k.label}</small>
            <b>{k.value}</b>
            <em>{k.sub}</em>
          </span>
        </div>
      ))}
    </div>
  );
}

export function Card({ title, extra, children, className }: { title: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`as-card${className ? ' ' + className : ''}`}>
      <div className="as-card-h">
        <b>{title}</b>
        {extra}
      </div>
      <div className="as-card-b">{children}</div>
    </div>
  );
}

/** A ring chart with a legend. */
export function Donut({ data, centerLabel, legendTitle }: { data: { label: string; n: number; color?: string }[]; centerLabel: string; legendTitle: string }) {
  const total = data.reduce((a, d) => a + d.n, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="as-donut">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={`${centerLabel}: ${total}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--bg-3)" strokeWidth="16" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.n / total) * C;
            const el = (
              <circle
                key={d.label}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={d.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth="16"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
                strokeDashoffset={-off}
                transform="rotate(-90 70 70)"
              />
            );
            off += len;
            return el;
          })}
        <text x="70" y="66" textAnchor="middle" className="as-donut-v">
          {total}
        </text>
        <text x="70" y="84" textAnchor="middle" className="as-donut-l">
          {centerLabel}
        </text>
      </svg>
      <div className="as-legend">
        <small>{legendTitle}</small>
        {data.length === 0 && <span className="as-muted">Nothing yet</span>}
        {data.map((d, i) => (
          <span key={d.label}>
            <i style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} />
            <span>{d.label}</span>
            <b>{d.n}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Bars({ data }: { data: { label: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  if (!data.length) return <div className="as-empty sm">Nothing assigned yet</div>;
  return (
    <div className="as-bars">
      {data.map((d) => (
        <div key={d.label}>
          <span>{d.label}</span>
          <span className="track">
            <i style={{ width: `${(d.n / max) * 100}%` }} />
          </span>
          <b>{d.n}</b>
        </div>
      ))}
    </div>
  );
}

/** Seats bought vs used per month. */
export function Usage({ data }: { data: { label: string; total: number; used: number }[] }) {
  const W = 520;
  const H = 150;
  const max = Math.max(1, ...data.map((d) => d.total));
  const x = (i: number) => 36 + (i * (W - 52)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - 22 - (v / max) * (H - 40);
  const line = (k: 'total' | 'used') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div className="as-usage">
      <span className="as-usage-key">
        <i className="t" /> Total <i className="u" /> Used
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="License usage over the last 6 months">
        {ticks.map((t) => (
          <g key={t}>
            <line x1="36" x2={W - 16} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" />
            <text x="28" y={y(t) + 4} textAnchor="end" className="as-axis">
              {t}
            </text>
          </g>
        ))}
        <path d={line('total')} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="4 3" />
        <path d={`${line('used')} L${x(data.length - 1)},${H - 22} L${x(0)},${H - 22} Z`} fill="var(--brand-tint)" opacity="0.6" />
        <path d={line('used')} fill="none" stroke="var(--brand)" strokeWidth="2.2" />
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.used)} r="3" fill="var(--brand)" />
            <text x={x(i)} y={H - 6} textAnchor="middle" className="as-axis">
              {d.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function Field({ label, required, ai, children, hint, error }: { label: string; required?: boolean; ai?: boolean; children: ReactNode; hint?: ReactNode; error?: string }) {
  return (
    <label className="lv-field">
      <span>
        {label}
        {required && <em className="as-req"> *</em>}
        {ai && <em className="as-aitag">AI</em>}
      </span>
      {children}
      {error ? <small className="err">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );
}

export const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
