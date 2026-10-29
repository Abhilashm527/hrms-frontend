const dtf = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dtfTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export const date = (v: string | Date) => dtf.format(new Date(v));
export const dateTime = (v: string | Date) => dtfTime.format(new Date(v));

export function ago(v: string | Date): string {
  const s = (new Date(v).getTime() - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'just now';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const longDate = (d = new Date()) => new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
