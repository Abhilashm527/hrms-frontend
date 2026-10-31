import type { Item, LayerKey } from './api';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const parseD = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addD = (s: string, n: number) => {
  const d = parseD(s);
  d.setDate(d.getDate() + n);
  return isoD(d);
};
export const fmtD = (s: string) => parseD(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const dayLabel = (s: string) => `${DAY[parseD(s).getDay()]}, ${fmtD(s)}`;
export const toM = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const timeL = (e: Pick<Item, 'start' | 'end'>) => (e.start ? e.start + (e.end ? `–${e.end}` : '') : 'All day');
export const durL = (a?: string | null, b?: string | null) => {
  if (!a || !b) return '';
  const m = toM(b) - toM(a);
  if (m <= 0) return '';
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
};
export const AUTO: Record<string, string> = { HOLIDAY: 'From the holiday calendar', BIRTHDAY: 'From employee profile', ANNIVERSARY: 'From joining date', LEAVE: 'From leave requests' };
export const LAYER_COLOR: Record<LayerKey, string> = { COMPANY: '#1F4FE0', MY: '#0F766E', TEAM: '#7C3AED', DEPT: '#B45309', LOC: '#0369A1', HR: '#BE123C', REC: '#4D7C0F', FIN: '#475569' };
