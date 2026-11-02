import { api, blob, del, get, post } from '../lib/http';
import { save } from '../payroll/api';

export type Kind = 'month' | 'quarter' | 'fy' | 'range' | 'asof' | 'cycle';
export type Report = {
  key: string;
  cat: string;
  name: string;
  desc: string;
  freq: string;
  fmts: string[];
  restricted: boolean;
  kind: Kind;
  org: boolean;
  scope: boolean;
  stat: boolean;
  canUnmask: boolean;
  cols: string[];
  last: { at: string; by: string } | null;
};
export type Schedule = {
  id: string;
  key: string;
  name: string;
  cat: string;
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
  day: string;
  weekday: string;
  time: string;
  to: string;
  format: string;
  enabled: boolean;
  next: string;
  lastAt: string | null;
  last: 'DELIVERED' | 'FAILED' | null;
  error: string | null;
};
export type Export = { id: string; key: string; name: string; params: string; format: string; by: string; at: string; rows: number | null; status: 'Ready' | 'Expired' | 'Failed'; error: string | null };
export type Home = {
  cats: { key: string; label: string }[];
  reports: Report[];
  kpis: { icon: string; label: string; value: number; sub: string; bad: boolean }[];
  frequent: { key: string; count: number }[];
  schedules: Schedule[];
  recent: Export[];
  hcBars?: { label: string; n: number }[];
  leaveBars?: { label: string; pct: number }[];
  cycles: { id: string; name: string }[];
};
export type RunBody = {
  from?: string;
  to?: string;
  asof?: string;
  label?: string;
  dept?: string;
  loc?: string;
  scope?: string;
  cycle?: string;
  format: string;
  columns: number[];
  mask: boolean;
};

const R = '/reports';
export const rptApi = {
  home: () => get<Home>(R),
  export: (key: string, b: RunBody) => post<{ id: string; rows: number; name: string }>(`${R}/${key}/export`, b),
  history: () => get<Export[]>(`${R}/exports`),
  download: async (id: string, name: string) => save(await blob(`${R}/exports/${id}/file`), name),
  schedules: () => get<Schedule[]>(`${R}/schedules`),
  saveSchedule: (id: string | null, b: Record<string, unknown>) => (id ? api<{ id: string }>(`${R}/schedules/${id}`, { method: 'PUT', body: b }) : post<{ id: string }>(`${R}/schedules`, b)),
  enable: (id: string, enabled: boolean) => post<void>(`${R}/schedules/${id}/enabled`, { enabled }),
  removeSchedule: (id: string) => del<void>(`${R}/schedules/${id}`),
};

// ------------------------------------------------------------------ periods (Indian financial year: April to March)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fyLabel = (y: number) => `FY ${y}–${String(y + 1).slice(2)}`;
export type Period = { value: string; label: string; from: string; to: string };

export function periods(kind: Kind, now = new Date()): Period[] {
  const Y = now.getFullYear();
  const M = now.getMonth();
  const today = iso(now);
  if (kind === 'month')
    return [0, 1, 2, 3, 4, 5].map((k) => {
      const a = new Date(Y, M - k, 1);
      const b = new Date(Y, M - k + 1, 0);
      const l = `${MON[a.getMonth()]} ${a.getFullYear()}`;
      return { value: l, label: k ? l : `${l} (to date)`, from: iso(a), to: k ? iso(b) : today };
    });
  if (kind === 'quarter') {
    const qStart = new Date(Y, M - ((M - 3 + 12) % 3), 1);
    return [0, 1, 2, 3, 4].map((k) => {
      const a = new Date(qStart.getFullYear(), qStart.getMonth() - 3 * k, 1);
      const b = new Date(a.getFullYear(), a.getMonth() + 3, 0);
      const fy = a.getMonth() >= 3 ? a.getFullYear() : a.getFullYear() - 1;
      const q = Math.floor(((a.getMonth() - 3 + 12) % 12) / 3) + 1;
      const l = `Q${q} ${fyLabel(fy)}`;
      return { value: l, label: k ? l : `${l} (to date)`, from: iso(a), to: k ? iso(b) : today };
    });
  }
  if (kind === 'range') {
    const fy = M >= 3 ? Y : Y - 1;
    const qStart = new Date(Y, M - ((M - 3 + 12) % 3), 1);
    return [
      { value: 'This month', label: 'This month', from: iso(new Date(Y, M, 1)), to: today },
      { value: 'Last month', label: 'Last month', from: iso(new Date(Y, M - 1, 1)), to: iso(new Date(Y, M, 0)) },
      { value: 'This quarter', label: 'This quarter', from: iso(qStart), to: today },
      { value: 'FY to date', label: 'FY to date', from: `${fy}-04-01`, to: today },
      { value: 'Last 12 months', label: 'Last 12 months', from: iso(new Date(Y - 1, M, now.getDate() + 1)), to: today },
      { value: 'Custom range', label: 'Custom range', from: '', to: '' },
    ];
  }
  return [];
}

export const defaultPeriod = (kind: Kind) => (kind === 'range' ? 'Last month' : kind === 'month' || kind === 'quarter' ? periods(kind)[1].value : '');

const dt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const tm = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
export const when = (s: string) => `${dt.format(new Date(s))} · ${tm.format(new Date(s))}`;
export const dayLabel = (s: string) => dt.format(new Date(s));
export const fullDay = (s: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s));
export const wdShort = (s: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(new Date(s));

const WDL: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
export const WEEKDAYS = Object.keys(WDL);
export const weekdayLabel = (k: string) => WDL[k] ?? k;
export const ord = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
export const runsLabel = (s: { freq: string; day: string; weekday: string; time: string }) =>
  (s.freq === 'DAILY'
    ? 'Every day'
    : s.freq === 'WEEKLY'
      ? `Every ${weekdayLabel(s.weekday)}`
      : `${s.day === 'Last day' ? 'Last day' : ord(Number(s.day))}${s.freq === 'QUARTERLY' ? ' of Jan, Apr, Jul, Oct' : ' of every month'}`) + ` · ${s.time}`;
