import { api, blob, del, get, post } from '../lib/http';

export type RunStatus = 'DRAFT' | 'REVIEWED' | 'APPROVED' | 'PAID';
export type Line = { key: string; label: string; amount: number };
export type RunRow = { id: string; period: string; label: string; status: RunStatus; payDate: string; employees: number; gross: number; net: number };
export type SlipRow = {
  id: string;
  employee: { id: string; name: string; code: string; title: string; department: string };
  gross: number;
  deductions: number;
  net: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  employerPf: number;
  employerEsi: number;
  paidDays: number;
  daysInMonth: number;
  lopDays: number;
  flags: string[];
  ptState: string | null;
};
export type Run = {
  id: string;
  period: string;
  label: string;
  status: RunStatus;
  payDate: string;
  paidAt: string | null;
  step: number;
  totals: Record<'gross' | 'deductions' | 'net' | 'pf' | 'esi' | 'pt' | 'tds' | 'employerPf' | 'employerEsi', number>;
  slips: SlipRow[];
  flagged: number;
  noSalary: { id: string; name: string }[];
  can: { edit: boolean; review: boolean; approve: boolean; disburse: boolean; reopen: boolean };
};
export type Slip = {
  id: string;
  runId: string;
  period: string;
  label: string;
  status: RunStatus;
  payDate: string;
  employee: { id: string; name: string; code: string; title: string; department: string; location: string };
  daysInMonth: number;
  paidDays: number;
  lopDays: number;
  extraLop: number;
  earnings: Line[];
  deductions: Line[];
  employer: Line[];
  adjustments: { label: string; amount: number; kind: 'EARNING' | 'DEDUCTION' }[];
  gross: number;
  totalDeductions: number;
  net: number;
  ptState: string | null;
  regime: 'NEW' | 'OLD';
  flags: string[];
  pan: string | null;
  uan: string | null;
  bank: string | null;
};
export type SalaryRow = {
  id: string;
  name: string;
  code: string;
  title: string | null;
  department: string | null;
  ctcAnnual: number | null;
  profileCtc: number | null;
  regime: 'NEW' | 'OLD';
  pfEnabled: boolean;
  effectiveFrom: string | null;
  ptState: string | null;
  hasPan: boolean;
  hasBank: boolean;
};
export type Statutory = { period: string; label: string; status: RunStatus; cards: { code: string; title: string; amount: number; lines: { k: string; v: number }[]; due: string; file: string }[] };
export type Settings = { basicPct: number; hraPctOfBasic: number; pfRate: number; pfWageCap: number; esiThreshold: number; esiEmployeeRate: number; esiEmployerRate: number; payDay: number; canEdit: boolean };
export type Annual = { fy: string; items: { id: string; name: string; code: string; pan: string | null; months: number; gross: number; net: number; tds: number; pf: number; pt: number }[] };
export type MyPay = {
  slips: { id: string; period: string; label: string; net: number; gross: number }[];
  tax: { fy: string; ctcAnnual: number; regime: 'NEW' | 'OLD'; newRegime: number; oldRegime: number; declared: boolean } | null;
  statements: { fyStart: number; label: string }[];
};

const P = '/payroll';
export const payApi = {
  runs: () => get<{ items: RunRow[]; suggested: string; canRun: boolean }>(`${P}/runs`),
  create: (month: string) => post<Run>(`${P}/runs`, { month }),
  run: (id: string) => get<Run>(`${P}/runs/${id}`),
  remove: (id: string) => del<void>(`${P}/runs/${id}`),
  recalc: (id: string) => post<Run>(`${P}/runs/${id}/recalculate`),
  advance: (id: string) => post<Run>(`${P}/runs/${id}/advance`),
  reopen: (id: string) => post<Run>(`${P}/runs/${id}/reopen`),
  statutory: (id: string) => get<Statutory>(`${P}/runs/${id}/statutory`),
  exportFile: (id: string, kind: string) => blob(`${P}/runs/${id}/export/${kind}`),
  slip: (id: string) => get<Slip>(`${P}/slips/${id}`),
  adjust: (id: string, b: { adjustments: Slip['adjustments']; extraLop: number }) => api<Slip>(`${P}/slips/${id}`, { method: 'PUT', body: b }),
  slipPdf: (id: string) => blob(`${P}/slips/${id}/pdf`),
  salaries: () => get<{ items: SalaryRow[]; canEdit: boolean }>(`${P}/salaries`),
  saveSalary: (id: string, b: { ctcAnnual: number; regime: string; pfEnabled: boolean; effectiveFrom?: string }) => api<{ ok: boolean }>(`${P}/salaries/${id}`, { method: 'PUT', body: b }),
  settings: () => get<Settings>(`${P}/settings`),
  saveSettings: (b: Partial<Settings>) => api<Settings>(`${P}/settings`, { method: 'PUT', body: b }),
  annual: (fy: number) => get<Annual>(`${P}/annual?fy=${fy}`),
  statement: (fy: number, employeeId?: string) => blob(`${P}/statement?fy=${fy}${employeeId ? `&employeeId=${employeeId}` : ''}`),
  mine: () => get<MyPay>(`${P}/me`),
};

const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const inr = (n: number | null | undefined) => (n == null ? '—' : `₹${inrFmt.format(Number(n))}`);
export const lakh = (n: number | null | undefined) => (n == null ? '—' : `₹${(Number(n) / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`);
export const fyNow = () => (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);

export async function save(b: Blob, name: string) {
  const url = URL.createObjectURL(b);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
