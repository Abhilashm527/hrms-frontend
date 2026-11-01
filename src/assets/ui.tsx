import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/icons';
import { assetApi, BADGE, type Color, type DateState, fmtD, type Kpi, statusColor, WARRANTY } from './api';

const svg = (d: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
/** Icons the design uses on the assets screens that the shared set doesn't have. */
export const AI = {
  monitor: svg(<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>),
  apps: svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  rupee: svg(<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10" />),
  clock: svg(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  target: svg(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>, 14),
  upload: svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>, 14),
  building: svg(<><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></>, 14),
  edit: svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>, 14),
  headset: svg(<><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /></>),
  router: svg(<><rect x="2" y="14" width="20" height="8" rx="2" /><path d="M6.01 18H6M10.01 18H10M15 10v4M17.84 7.17a4 4 0 0 0-5.66 0M20.66 4.34a8 8 0 0 0-11.31 0" /></>),
  chair: svg(<><path d="M6 19v2M18 19v2M5 11h14v4H5zM7 11V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6" /></>),
  box: svg(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>),
};
export const typeIcon = (name: string, big = false): ReactNode => {
  const n = name.toLowerCase();
  const i = /laptop|notebook/.test(n) ? Icon.laptop : /monitor|desktop|screen|display/.test(n) ? AI.monitor : /phone|mobile/.test(n) ? Icon.phone : /head/.test(n) ? AI.headset : /router|network|switch/.test(n) ? AI.router : /chair|desk/.test(n) ? AI.chair : AI.box;
  return big ? <span className="as-ic-big">{i}</span> : i;
};

/** The design's colour sets: blues for charts, a stable tint per type / category / person. */
export const BLUES = ['#1D4ED8', '#3B82F6', '#60A5FA', '#93C5FD', '#1E40AF', '#2563EB', '#BFDBFE', '#172554'];
const TINTS: Color[] = [
  ['#0E7490', '#CFFAFE'],
  ['#1D4ED8', '#DBEAFE'],
  ['#6D28D9', '#EDE9FE'],
  ['#BE185D', '#FCE7F3'],
  ['#B45309', '#FEF3C7'],
  ['#15803D', '#DCFCE7'],
  ['#475569', '#F1F5F9'],
];
export const tintOf = (key: string): Color => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
};

export function Badge({ color, children }: { color: Color; children: ReactNode }) {
  return (
    <span className="as-badge" style={{ color: color[0], background: color[1] }}>
      <i style={{ background: color[0] }} />
      {children}
    </span>
  );
}
/** Custom status colours from Asset configuration, by status id and by name. */
export function useStatusHex(): (idOrName: string) => string | null {
  const hw = useQuery({ queryKey: ['assets', 'config', 'hardware'], queryFn: () => assetApi.config('hardware'), staleTime: 60_000 });
  const sw = useQuery({ queryKey: ['assets', 'config', 'software'], queryFn: () => assetApi.config('software'), staleTime: 60_000 });
  const all = [...(hw.data?.statuses ?? []), ...(sw.data?.statuses ?? [])];
  return (k) => all.find((x) => x.id === k || x.name === k)?.colorHex ?? null;
}
export function StatusBadge({ s }: { s: { id?: string; name: string; color: number; badge?: string } }) {
  const hexOf = useStatusHex();
  return <Badge color={statusColor(s.color, hexOf(s.id ?? s.name)) ?? BADGE[s.badge ?? 'paused']}>{s.name}</Badge>;
}
export const StateBadge = ({ s }: { s: { label: string; badge: string } }) => <Badge color={BADGE[s.badge] ?? BADGE.paused}>{s.label.charAt(0).toUpperCase() + s.label.slice(1)}</Badge>;

/** The design's dfx-type-chip, tinted per type. */
export function TypeChip({ name, color }: { name: string; color?: Color }) {
  const c = color ?? tintOf(name);
  return (
    <span className="dfx-type-chip as-type" style={{ color: c[0], background: c[1], borderColor: 'transparent' }}>
      {name}
    </span>
  );
}
/** Category pill (rounded, bold) as in the licence table and detail header. */
export function CatPill({ name, color }: { name: string; color?: Color }) {
  const c = color ?? tintOf(name);
  return (
    <span className="as-cat" style={{ color: c[0], background: c[1] }}>
      {name}
    </span>
  );
}

export function Warranty({ w }: { w: DateState }) {
  if (w.state === 'NONE') return <span className="as-muted">—</span>;
  const c = WARRANTY[w.state];
  return (
    <span className="as-warranty" style={{ color: w.state === 'ACTIVE' ? 'var(--fg-2)' : c[0] }}>
      {fmtD(w.until)}
    </span>
  );
}

/** Round initials in the person's tint (activity, tables). */
export function Initials({ name, initials, size = 28 }: { name: string; initials: string; size?: number }) {
  const c = tintOf(name);
  return (
    <span className="as-ini" style={{ width: size, height: size, background: c[1], color: c[0], fontSize: size <= 24 ? 9.5 : 10.5 }}>
      {initials}
    </span>
  );
}

export function Who({ p, sub, onClick }: { p: { name: string; initials: string; photoUrl?: string; title?: string | null; department?: string | null }; sub?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <Avatar url={p.photoUrl} initials={p.initials} size={26} tone={{ fg: tintOf(p.name)[0], bg: tintOf(p.name)[1] }} />
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

const TONE: Record<string, string> = { muted: 'var(--fg-3)', success: 'var(--success)', warning: 'var(--warning)' };
export function Kpis({ items, icons }: { items: (Kpi & { tone?: string })[]; icons: Record<string, ReactNode> }) {
  return (
    <div className="as-kpis">
      {items.map((k) => (
        <div key={k.key} className="as-kpi">
          <span className="ic">{icons[k.key] ?? AI.box}</span>
          <span>
            <small>{k.label}</small>
            <b>{k.value}</b>
            <em style={{ color: TONE[k.tone ?? 'muted'] }}>{k.sub}</em>
          </span>
        </div>
      ))}
    </div>
  );
}

export function Card({ title, extra, children, flush }: { title: ReactNode; extra?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <div className="as-card">
      <div className="as-card-h">
        <span>{title}</span>
        {extra}
      </div>
      <div className={flush ? 'as-card-flush' : 'as-card-b'}>{children}</div>
    </div>
  );
}

/** The design's ring: a conic gradient with the total in the middle, legend on the right. */
export function Donut({ data, centerLabel, centerValue, legendTitle }: { data: { label: string; n: number; v?: ReactNode; color?: string }[]; centerLabel: string; centerValue: ReactNode; legendTitle: ReactNode }) {
  const total = data.reduce((a, d) => a + d.n, 0);
  let at = 0;
  const stops = data
    .map((d, i) => {
      const from = at;
      at += total ? (d.n / total) * 360 : 0;
      return `${d.color ?? BLUES[i % BLUES.length]} ${from}deg ${at}deg`;
    })
    .join(', ');
  return (
    <div className="as-donut">
      <div className="ring" style={{ background: total ? `conic-gradient(${stops})` : 'var(--bg-3)' }}>
        <div>
          <small>{centerLabel}</small>
          <b>{centerValue}</b>
        </div>
      </div>
      <div className="as-legend">
        <b>{legendTitle}</b>
        {data.length === 0 && <span className="as-muted">Nothing yet</span>}
        {data.map((d, i) => (
          <span key={d.label}>
            <i style={{ background: d.color ?? BLUES[i % BLUES.length] }} />
            <span>{d.label}</span>
            <em>{d.v ?? d.n}</em>
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
      {data.map((d, i) => (
        <div key={d.label}>
          <span>{d.label}</span>
          <span className="track">
            <i style={{ width: `${(d.n / max) * 100}%`, background: BLUES[i % 4] }} />
          </span>
          <b>{d.n}</b>
        </div>
      ))}
    </div>
  );
}

/** License usage over six months: total seats (purple) and used (blue) as areas, months with used/total below. */
export function Usage({ data }: { data: { label: string; total: number; used: number }[] }) {
  const max = Math.max(4, ...data.map((d) => d.total));
  const top = Math.ceil(max / 4) * 4;
  const ticks = [top, (top * 3) / 4, top / 2, top / 4, 0];
  const n = Math.max(1, data.length - 1);
  const pts = (k: 'total' | 'used') => data.map((d, i) => `${(i / n) * 100},${100 - (d[k] / top) * 100}`);
  const area = (k: 'total' | 'used') => `0,100 ${pts(k).join(' ')} 100,100`;
  return (
    <div className="as-usage">
      <div className="y">
        {ticks.map((t) => (
          <span key={t}>{Math.round(t)}</span>
        ))}
      </div>
      <div className="plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label="License usage over the last 6 months">
          <polygon points={area('total')} fill="#8B5CF6" opacity="0.18" />
          <polyline points={pts('total').join(' ')} fill="none" stroke="#8B5CF6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <polygon points={area('used')} fill="#3B82F6" opacity="0.22" />
          <polyline points={pts('used').join(' ')} fill="none" stroke="#3B82F6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <span />
      <div className="x" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {data.map((d) => (
          <span key={d.label}>
            <span>{d.label}</span>
            <span>
              {d.used}/{d.total}
            </span>
          </span>
        ))}
      </div>
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
