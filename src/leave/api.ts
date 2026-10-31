import { api, del, get, post } from '../lib/http';

export type Person = {
  id: string;
  code?: string;
  name: string;
  first?: string;
  initials: string;
  title?: string | null;
  department?: { id: string; name: string; color: number };
  location?: { id: string; name: string };
  photoUrl?: string;
  status?: string;
  joined?: string;
  exitDate?: string | null;
};
export type TypeRef = { id: string; code: string; name: string; short: string; color: number };
export type Balance = TypeRef & { quota: number; opening: number; credited: number; used: number; pending: number; available: number; paid: boolean; active: boolean };
export type StepState = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
export type ReqStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type ReqRow = {
  id: string;
  no: string;
  employee: Person;
  type: TypeRef | null;
  from: string;
  to: string;
  half: boolean;
  days: number;
  status: ReqStatus;
  appliedAt: string;
  reason?: string;
  progress?: { done: number; total: number; states: StepState[] };
  waitingOn?: Person;
  waitingRole?: string;
  decidedAt?: string;
  decidedBy?: Person | null;
  decisionNote?: string | null;
  approvedBy?: Person[];
};
export type ReqList = {
  items: ReqRow[];
  total: number;
  page: number;
  size: number;
  counts: { pending: number; approved: number; rejected: number; mine: number };
  types: TypeRef[];
  canApplyForOthers: boolean;
  canManage: boolean;
};
export type ReqDetail = ReqRow & {
  reason: string;
  hasDocument: boolean;
  decisionNote: string | null;
  fields: { key: string; k: string; v: unknown }[];
  steps: { sort: number; role: string; person?: Person; state: StepState; actedAt: string | null; note: string | null; delegated: boolean }[];
  events: { at: string; actor?: Person; kind: string; text: string | null }[];
  overlap: string[];
  balances: Balance[];
  past: ReqRow[];
  can: { decide: boolean; cancel: boolean; note: boolean; remind: boolean };
};
export type ApplyType = { code: string; name: string; short: string; color: number; halfDay: boolean; noticeDays: number; docAfterDays: number; maxConsecutive: number; countAs: string; available: number; quota: number | null };
export type CheckResult = { days: number; errors: { field: string; code: string; message: string }[]; approvers: { sort: number; approver: string; employeeId: string; name: string }[]; autoApprove: boolean };

export type BalanceBoard = { year: number; types: TypeRef[]; items: (Person & { cells: (Balance | { code: string; eligible: false })[] })[]; page: number; size: number; total: number };
export type Ledger = {
  person: Person;
  year: number;
  closed: boolean;
  rate: number;
  rows: (TypeRef & { opening: number; credited: number; used: number; adjusted: number; encashed: number; lapsed: number; closing: number; carried: number; pending: number; available: number })[];
  overview: { year: number; used: number; encashed: number; lapsed: number; el: number | null; closed: boolean }[];
  transactions: { code: string; color: number; kind: string; label: string; days: number; note: string | null; at: string; refId: string | null }[];
  canManage: boolean;
};
export type Encashment = {
  id: string;
  no: string;
  employee?: Person;
  type: TypeRef | null;
  year: number;
  kind: 'ON_REQUEST' | 'EXIT' | 'YEAR_END';
  days: number;
  rate: number;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
  createdAt: string;
  decidedAt: string | null;
  paidAt: string | null;
  note: string | null;
};
export type EncList = { items: Encashment[]; pending: { count: number; amount: number }; paidThisYear: number; liability: number; canManage: boolean };
export type EncOptions = { people: Person[]; types: (TypeRef & { encashMax: number })[]; rate?: number; limits?: { code: string; available: number; max: number }[] };
export type YearEnd = {
  year: number;
  years: number[];
  type: { code: string; name: string; carry: string; carryMax: number; encashable: boolean; encashMax: number } | null;
  types: TypeRef[];
  encashableTypes: string[];
  closed: { closedAt: string; closedBy: string; encashed: boolean; closedByPerson?: Person } | null;
  people: number;
  summary: { closing: number; carry: number; encash: number; lapse: number; encashAmount: number };
  items: (Person & { closing: number; carry: number; encash: number; lapse: number; encashAmount: number })[];
  total: number;
  page: number;
  size: number;
  canManage: boolean;
  canClose: boolean;
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  from: string | null;
  to: string | null;
  deadline: string | null;
  departments: string[];
  locations: string[];
  who: 'ALL' | 'LAPSE' | 'BALANCE';
  balType: string | null;
  balMin: number | null;
  email: boolean;
  sendAt: string;
  repeat: 'NONE' | 'WEEKLY';
  status: 'SCHEDULED' | 'SENT' | 'CANCELLED';
  lastSentAt: string | null;
  sentCount: number;
  recipients: number;
  createdAt: string;
  audience: string;
};
export type NoticePreview = { count: number; names: string[]; samples: { name: string; title: string; body: string }[] };
export type AttRow = {
  id: string;
  code: string;
  name: string;
  initials: string;
  photoUrl: string;
  department?: { id: string; name: string; color: number };
  location?: { id: string; name: string };
  status: 'present' | 'late' | 'wfh' | 'leave' | 'absent' | 'off' | 'upcoming';
  label: string;
  kind: string;
  in: string | null;
  out: string | null;
  hours: string | null;
  source: string | null;
  wfh: boolean;
  note: string | null;
};
export type AttBoard = { day: string; today: string; total: number; headcount: number; counts: Record<string, number>; items: AttRow[]; page: number; size: number; canEdit: boolean };
export type HolidayYear = {
  calendar: { id: string; name: string; national: boolean };
  calendars: { id: string; name: string; national: boolean }[];
  year: number;
  types: { id: string; name: string; fg: string; bg: string; dayOff: boolean }[];
  holidays: { id: string; date: string; name: string; typeId: string; inherited: boolean }[];
  closed: { closedAt: string; closedBy: string | null } | null;
  canEdit: boolean;
};

const L = '/leave';
const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) {
    if (v == null || v === '' || v === 'all') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.set(k, String(v));
  }
  return p.toString();
};

export const leaveApi = {
  requests: (o: Record<string, unknown>) => get<ReqList>(`${L}/requests?${qs(o)}`),
  request: (id: string) => get<ReqDetail>(`${L}/requests/${id}`),
  applyOptions: (employeeId?: string) => get<{ person: Person; types: ApplyType[] }>(`${L}/apply-options?${qs({ employeeId })}`),
  check: (b: Record<string, unknown>) => post<CheckResult>(`${L}/apply/check`, b),
  apply: (b: Record<string, unknown>) => post<ReqDetail>(`${L}/requests`, b),
  approve: (id: string, note?: string) => post<ReqDetail>(`${L}/requests/${id}/approve`, { note }),
  reject: (id: string, note: string) => post<ReqDetail>(`${L}/requests/${id}/reject`, { note }),
  cancel: (id: string, note?: string) => post<ReqDetail>(`${L}/requests/${id}/cancel`, { note }),
  note: (id: string, text: string) => post<ReqDetail>(`${L}/requests/${id}/notes`, { text }),
  remind: (id: string) => post<ReqDetail>(`${L}/requests/${id}/remind`),
  balances: (o: Record<string, unknown>) => get<BalanceBoard>(`${L}/balances?${qs(o)}`),
  ledgerPeople: (q: string, exited: boolean) => get<Person[]>(`${L}/ledger/people?${qs({ q, exited })}`),
  ledger: (id: string, year: number) => get<Ledger>(`${L}/ledger/${id}?year=${year}`),
  adjust: (id: string, b: Record<string, unknown>) => post<Ledger>(`${L}/ledger/${id}/adjust`, b),
  encashments: (status: string) => get<EncList>(`${L}/encashments?${qs({ status })}`),
  encashOptions: (employeeId?: string, kind?: string) => get<EncOptions>(`${L}/encashments/options?${qs({ employeeId, kind })}`),
  createEncashment: (b: Record<string, unknown>) => post<Encashment>(`${L}/encashments`, b),
  decideEncashment: (id: string, action: 'approve' | 'reject' | 'paid', note?: string) => post<Encashment>(`${L}/encashments/${id}/${action}`, { note }),
  yearEnd: (year: number, type: string, page: number) => get<YearEnd>(`${L}/year-end/${year}?${qs({ type, page })}`),
  closeYear: (year: number, encash: boolean) => post<YearEnd>(`${L}/year-end/${year}/close`, { encash }),
  reopenYear: (year: number) => del<YearEnd>(`${L}/year-end/${year}/close`),
  notices: () => get<{ items: Notice[]; canManage: boolean }>(`${L}/notices`),
  previewNotice: (b: Record<string, unknown>) => post<NoticePreview>(`${L}/notices/preview`, b),
  saveNotice: (id: string | null, b: Record<string, unknown>) => (id ? api<Notice>(`${L}/notices/${id}`, { method: 'PUT', body: b }) : post<Notice>(`${L}/notices`, b)),
  cancelNotice: (id: string) => post<Notice>(`${L}/notices/${id}/cancel`),
  sendNotice: (id: string) => post<Notice>(`${L}/notices/${id}/send`),
  attendance: (o: Record<string, unknown>) => get<AttBoard>(`/attendance/board?${qs(o)}`),
  attendanceHolidays: (year: number) => get<{ date: string; name: string; dayOff: boolean }[]>(`/attendance/holidays?year=${year}`),
  correctAttendance: (id: string, day: string, b: Record<string, unknown>) => api<{ ok: boolean }>(`/attendance/${id}/${day}`, { method: 'PUT', body: b }),
  calendars: () => get<{ id: string; name: string; state: string | null }[]>(`/holiday-calendars`),
  holidayYear: (cal: string, year: number) => get<HolidayYear>(`/holiday-calendars/${cal}/year/${year}`),
  addHoliday: (cal: string, b: Record<string, unknown>) => post<HolidayYear>(`/holiday-calendars/${cal}/holidays`, b),
  updateHoliday: (cal: string, id: string, b: Record<string, unknown>) =>
    api<HolidayYear>(`/holiday-calendars/${cal}/holidays/${id}`, { method: 'PATCH', body: b }),
  deleteHoliday: (cal: string, id: string) => del<HolidayYear>(`/holiday-calendars/${cal}/holidays/${id}`),
  closeHolidayYear: (cal: string, year: number) => post<HolidayYear>(`/holiday-calendars/${cal}/year/${year}/close`),
  reopenHolidayYear: (cal: string, year: number) => del<HolidayYear>(`/holiday-calendars/${cal}/year/${year}/close`),
};

/** Leave-type colours by the type's colour index (Leave policy). */
export const TYPE_COLORS: [string, string][] = [
  ['#1D4ED8', '#DBEAFE'],
  ['#BE123C', '#FFE4E6'],
  ['#047857', '#D1FAE5'],
  ['#B45309', '#FEF3C7'],
  ['#BE185D', '#FCE7F3'],
  ['#6D28D9', '#EDE9FE'],
  ['#0F766E', '#CCFBF1'],
  ['#C2410C', '#FFEDD5'],
  ['#0E7490', '#CFFAFE'],
  ['#475569', '#F1F5F9'],
];

export const STEP_ROLE: Record<string, string> = { REPORTING_MANAGER: 'Reporting manager', SKIP_LEVEL_MANAGER: 'Skip-level manager', DEPARTMENT_HEAD: 'Department head', HR: 'HR' };
