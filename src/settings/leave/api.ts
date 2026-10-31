import { api, del, get, post } from '../../lib/http';

export type Accrual = 'yearly' | 'monthly' | 'quarterly' | 'event' | 'earned';
export type LeaveType = {
  id: string;
  code: string;
  name: string;
  shortLabel: string;
  colorIndex: number;
  active: boolean;
  system: boolean;
  accrual: Accrual;
  quota: number | null;
  carry: 'none' | 'upto' | 'all';
  carryMax: number;
  expiryDays: number;
  encashable: boolean;
  encashMax: number;
  countAs: 'working' | 'calendar';
  paid: boolean;
  gender: 'all' | 'female' | 'male';
  halfDay: boolean;
  noticeDays: number;
  maxConsecutive: number;
  docAfterDays: number;
  minServiceDays: number;
  inUse: boolean;
  version: number;
};
export type ChainStep = { approver: string; label?: string; condition: 'ALWAYS' | 'OVER_DAYS'; minDays: number | null };
export type Chain = { version: number; steps: ChainStep[] };
export type Resolved = { sort: number; approver: string; employeeId: string; name: string; delegatedFrom: string | null };
export type HolidayType = { id: string; name: string; fg: string; bg: string; dayOff: boolean; sort: number; used: number };

const ifMatch = (v: number) => ({ 'If-Match': `"${v}"` });

export const leaveConfigApi = {
  types: () => get<LeaveType[]>('/leave/types'),
  createType: (b: Partial<LeaveType>) => post<LeaveType>('/leave/types', b),
  updateType: (id: string, b: Partial<LeaveType>, v: number, force = false) => api<LeaveType>(`/leave/types/${id}?force=${force}`, { method: 'PUT', body: b, headers: ifMatch(v) }),
  setQuota: (id: string, quota: number) => api<LeaveType>(`/leave/types/${id}/quota`, { method: 'PATCH', body: { quota } }),
  deleteType: (id: string) => del<void>(`/leave/types/${id}`),
  chain: () => get<Chain>('/leave/approval-chain'),
  saveChain: (steps: ChainStep[], v: number) => api<Chain>('/leave/approval-chain', { method: 'PUT', body: { steps }, headers: ifMatch(v) }),
  previewChain: (employeeId: string, days: number, steps: ChainStep[]) => post<Resolved[]>('/leave/approval-chain/preview', { employeeId, days, steps }),
  holidayTypes: () => get<HolidayType[]>('/holidays/types'),
  createHolidayType: (b: Partial<HolidayType>) => post<HolidayType>('/holidays/types', b),
  updateHolidayType: (id: string, b: Partial<HolidayType>) =>
    api<{ type: HolidayType; affectedPending: { requestId: string; employee: string; dates: string }[] }>(`/holidays/types/${id}`, { method: 'PATCH', body: b }),
  deleteHolidayType: (id: string, moveTo?: string) => del<void>(`/holidays/types/${id}${moveTo ? `?moveTo=${moveTo}` : ''}`),
};

export const APPROVERS: [string, string][] = [
  ['REPORTING_MANAGER', 'Reporting manager'],
  ['SKIP_LEVEL_MANAGER', 'Skip-level manager'],
  ['DEPARTMENT_HEAD', 'Department head'],
  ['HR', 'HR'],
];

/** Holiday-type colours from the design: [text, background]. */
export const HOL_PAL: [string, string][] = [
  ['#1D4ED8', '#DBEAFE'],
  ['#0F766E', '#CCFBF1'],
  ['#B45309', '#FEF3C7'],
  ['#6D28D9', '#EDE9FE'],
  ['#BE185D', '#FCE7F3'],
  ['#15803D', '#DCFCE7'],
  ['#0369A1', '#E0F2FE'],
  ['#B91C1C', '#FEE2E2'],
  ['#475569', '#F1F5F9'],
];
