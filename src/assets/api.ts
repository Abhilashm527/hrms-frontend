import { api, blob, del, get, post } from '../lib/http';

export type Mode = 'hardware' | 'software';
export type Color = [string, string];
export type Person = { id: string; code: string; name: string; initials: string; title: string | null; department: string | null; photoUrl?: string };
export type DateState = { from: string | null; until: string | null; state: 'NONE' | 'EXPIRED' | 'ENDING' | 'ACTIVE'; daysLeft?: number; pctUsed?: number };
export type Status = { id: string; name: string; systemKey: string | null; color: number; badge: string };

export type HwRow = {
  id: string;
  tag: string;
  model: string;
  serial: string;
  type: { id: string; name: string; color: Color };
  status: Status;
  holder: Person | null;
  since: string | null;
  warranty: DateState;
  actions: { assign: boolean; recover: boolean; repaired: boolean };
};
export type HwList = { items: HwRow[]; page: number; size: number; total: number; facets: { types: { id: string; name: string; n: number }[]; statuses: { id: string; name: string; n: number }[] } };
export type Kpi = { key: string; label: string; value: number | string; sub: string };
export type Activity = { who: string; initials: string; text: string; at: string };
export type Alert = { id: number; title: string; sub: string; severity: string; at: string };
export type HwDash = {
  kpis: Kpi[];
  byStatus: { label: string; color: number; n: number }[];
  byType: { label: string; n: number }[];
  deptAllocation: { department: string; n: number }[];
  stock: { id: string; tag: string; model: string; type: string; status: string; actions: HwRow['actions'] }[];
  alerts: Alert[];
  activity: Activity[];
};
export type HwAvail = {
  summary: { type: HwRow['type']; available: number; endingWarranty: number; openRequests: number }[];
  groups: { type: HwRow['type']; available: number; endingWarranty: number; openRequests: number; items: HwRow[] }[];
  inRepair: HwRow[];
};
export type KV = { k: string; v: unknown; key?: string };
export type HwDetail = Omit<HwRow, 'holder' | 'actions'> & {
  category: { id: string; name: string } | null;
  ownership: { id: string; name: string; fields: KV[] };
  location: { id: string; name: string } | null;
  basic: KV[];
  specs: KV[];
  files: { id: string; name: string; size: number; mime: string; uploadedAt?: string }[];
  holder: (Person & { since: string }) | null;
  insurance: DateState & { insurer: string | null; policyNo: string | null };
  returnDue: string | null;
  refreshDue: string | null;
  lost: boolean;
  retiredOn: string | null;
  retireReason: string | null;
  notes: string | null;
  admin: { createdAt: string; createdBy: string | null; updatedAt: string | null; updatedBy: string | null };
  purchaseCost?: number | null;
  vendor?: string | null;
  invoiceNo?: string | null;
  version: number;
  can: { edit: boolean; assign: boolean; recover: boolean; repair: boolean; repaired: boolean; retire: boolean };
  // the edit form reads these when present
  purchasedOn?: string | null;
};
export type TimelineItem = { kind: string; title: string; description: string | null; previous: string | null; value: string | null; note?: string | null; at: string; by: string | null; person: string | null };
export type Timeline = { items: TimelineItem[]; count: number; page: number };

export type LicState = { key: string; label: string; badge: string };
export type LicRow = {
  id: string;
  lid: string;
  name: string;
  vendor: string | null;
  owner: { id: string; code: string; name: string } | null;
  category: { id: string; name: string; color: Color };
  type: { id: string; name: string; billing: string; unit: string };
  seats: number | null;
  used: number;
  free: number | null;
  utilPct: number | null;
  annualCost: number;
  renewsOn: string | null;
  daysToRenew: number | null;
  state: LicState;
  actions: { assignSeat: boolean; addSeats: boolean };
};
export type LicList = { items: LicRow[]; page: number; size: number; total: number };
export type LicDetail = LicRow & {
  termStart: string | null;
  autoRenew: boolean;
  notes: string | null;
  status: { id: string; name: string } | null;
  specs: KV[];
  cost: { perSeat: number; billing: string; annual: number; monthly: number };
  renewal: { date: string | null; daysLeft: number | null; termStart: string | null; pctElapsed: number | null; autoRenew: boolean };
  admin: { createdAt: string; createdBy: string | null; updatedAt: string | null; updatedBy: string | null };
  version: number;
  can: { edit: boolean; assignSeat: boolean; addSeats: boolean; renew: boolean };
};
export type Seat = Person & { assignedOn: string };
export type SwDash = {
  kpis: Kpi[];
  byCategory: { label: string; n: number }[];
  byType: { label: string; n: number }[];
  byState: { label: string; n: number }[];
  usage: { month: string; label: string; total: number; used: number }[];
  underused: { annualSavings: number; top: { id: string; name: string; used: number; seats: number; saving: number }[] };
  alerts: Alert[];
  activity: Activity[];
};
export type SwAvail = {
  summary: { category: { id: string; name: string }; idle: number; freeSeats: number }[];
  groups: { category: { id: string; name: string }; freeSeats: number; idle: number; items: LicRow[] }[];
  fullyAllocated: LicRow[];
};

export type AReq = {
  id: string;
  requester: Person;
  kind: 'HARDWARE' | 'SOFTWARE';
  item: { typeId?: string; licenseId?: string; name: string };
  reason: string;
  source: string;
  status: 'PENDING' | 'APPROVED' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';
  step: number;
  date: string;
  dueOn: string | null;
  note: string | null;
  canDecide: boolean;
  fields: KV[];
};

export type Field = { id: string; key: string; label: string; type: string; required: boolean; options: string[] };
export type Config = {
  statuses: { id: string; name: string; color: number; assignable: boolean }[];
  categories: { id: string; name: string; icon: string }[];
  types: { id: string; name: string; categoryId?: string; icon?: string; maxAgeYears?: number; billing?: string; unit?: string }[];
  ownership?: { id: string; name: string; captureFields: string[]; returnRequired: boolean }[];
  idFormats: { id: string; ownershipId: string | null; licenseTypeId: string | null; fmt: string }[];
  alerts: { id: string; event: string; name: string; daysBefore: number }[];
};
export type Extract = { extractionId: string; fields: Record<string, unknown>; mapped: { group: string; key: string; value: string }[]; unmatched: string[] };
export type Mine = {
  hardware: { id: string; tag: string; model: string; serial: string; type: string; since: string; warrantyUntil: string | null }[];
  licences: { id: string; lid: string; name: string; since: string }[];
  requests: { id: string; kind: 'HARDWARE' | 'SOFTWARE'; status: AReq['status']; date: string; reason: string; item: string; note: string | null }[];
};

const A = '/assets';
const qs = (o: Record<string, string | number | boolean | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
};
const json = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => api<never>(path, { method, body: body ?? {}, headers });

export const assetApi = {
  config: (mode: Mode) => get<Config>(`${A}/config/${mode}`),
  fields: (mode: Mode, typeId: string) => get<Field[]>(`${A}/config/${mode}/types/${typeId}/fields`),

  hwDash: () => get<HwDash>(`${A}/hardware/dashboard`),
  hwList: (f: { q?: string; typeId?: string; statusId?: string; page: number; size: number }) => get<HwList>(`${A}/hardware?${qs(f)}`),
  hwAvail: () => get<HwAvail>(`${A}/hardware/available`),
  hw: (id: string) => get<HwDetail>(`${A}/hardware/${id}`),
  hwTimeline: (id: string, f: { q?: string; kind?: string; order?: string }) => get<Timeline>(`${A}/hardware/${id}/timeline?${qs(f)}`),
  hwTimelineCsv: (id: string) => blob(`${A}/hardware/${id}/timeline?format=csv`),
  hwCreate: (b: unknown) => json('POST', `${A}/hardware`, b) as Promise<HwDetail>,
  hwUpdate: (id: string, b: unknown, version: number) => json('PUT', `${A}/hardware/${id}`, b, { 'If-Match': `"${version}"` }) as Promise<HwDetail>,
  hwDelete: (id: string) => del<void>(`${A}/hardware/${id}`),
  hwAct: (id: string, action: 'assign' | 'recover' | 'repair' | 'repaired' | 'retire', b: unknown = {}) => json('POST', `${A}/hardware/${id}/${action}`, b) as Promise<HwDetail>,
  hwUpload: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api<unknown>(`${A}/hardware/${id}/files`, { method: 'POST', body: fd });
  },
  hwFile: (id: string, fileId: string) => blob(`${A}/hardware/${id}/files/${fileId}`),
  hwFileDelete: (id: string, fileId: string) => del<void>(`${A}/hardware/${id}/files/${fileId}`),

  swDash: (categoryId?: string) => get<SwDash>(`${A}/software/dashboard?${qs({ categoryId })}`),
  swList: (f: { q?: string; categoryId?: string; state?: string; page: number; size: number }) => get<LicList>(`${A}/software?${qs(f)}`),
  swAvail: () => get<SwAvail>(`${A}/software/available`),
  sw: (id: string) => get<LicDetail>(`${A}/software/${id}`),
  swSeats: (id: string, q?: string) => get<Seat[]>(`${A}/software/${id}/seats?${qs({ q })}`),
  swTimeline: (id: string, f: { q?: string; kind?: string }) => get<Timeline>(`${A}/software/${id}/timeline?${qs(f)}`),
  swTimelineCsv: (id: string) => blob(`${A}/software/${id}/timeline?format=csv`),
  swPreviewId: (typeId: string, name: string) => get<{ lid: string }>(`${A}/software/preview-id?${qs({ typeId, name })}`),
  swCandidates: (q?: string) => get<{ id: string; code: string; name: string; department: string | null; suggested: boolean }[]>(`${A}/software/seat-candidates?${qs({ q })}`),
  swCreate: (b: unknown) => json('POST', `${A}/software`, b) as Promise<LicDetail>,
  swUpdate: (id: string, b: unknown, version: number) => json('PUT', `${A}/software/${id}`, b, { 'If-Match': `"${version}"` }) as Promise<LicDetail>,
  swDelete: (id: string) => del<void>(`${A}/software/${id}`),
  swAssign: (id: string, employeeIds: string[]) => json('POST', `${A}/software/${id}/seats`, { employeeIds }) as Promise<Seat[]>,
  swRevoke: (id: string, employeeId: string) => del<Seat[]>(`${A}/software/${id}/seats/${employeeId}`),
  swAddSeats: (id: string, count: number) => json('POST', `${A}/software/${id}/seats/add`, { count }) as Promise<LicDetail>,
  swRenew: (id: string) => json('POST', `${A}/software/${id}/renew`) as Promise<LicDetail>,
  swAutoRenew: (id: string, autoRenew: boolean) => json('PATCH', `${A}/software/${id}/auto-renew`, { autoRenew }) as Promise<LicDetail>,

  requests: (kind?: string, status?: string) => get<{ items: AReq[]; pendingForMe: number }>(`${A}/requests?${qs({ kind, status })}`),
  approve: (id: string, b: { note?: string; fulfil?: { assetId?: string; licenseId?: string } }) => json('POST', `${A}/requests/${id}/approve`, b),
  reject: (id: string, note: string) => json('POST', `${A}/requests/${id}/reject`, { note }),

  extract: (kind: Mode, text: string) => post<Extract>(`${A}/extract`, { kind, text }),
  extractFile: (kind: Mode, file: File) => {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    return api<Extract>(`${A}/extract/file`, { method: 'POST', body: fd });
  },
  template: (kind: Mode) => blob(`${A}/${kind}/import/template`),
  importCsv: (kind: Mode, file: File, dryRun: boolean) => {
    const fd = new FormData();
    fd.append('file', file);
    return api<{ rows: number; valid: number; created?: number; errors: { row: number; field: string | null; code: string; message: string }[]; dryRun: boolean }>(
      `${A}/${kind}/import?dryRun=${dryRun}`,
      { method: 'POST', body: fd },
    );
  },

  mine: () => get<Mine>('/me/assets'),
  requestOptions: (kind: 'HARDWARE' | 'SOFTWARE') => get<{ items: { id: string; name: string }[]; fields: { key: string; label: string; type: string; required: boolean; options: string[]; helpText: string | null }[] }>(`/me/assets/request-options?kind=${kind}`),
  submitRequest: (b: unknown) => post<{ id: string; status: string }>('/me/assets/requests', b),
  cancelRequest: (id: string) => post<void>(`/me/assets/requests/${id}/cancel`),
  ofEmployee: (id: string) => get<Mine>(`/employees/${id}/assets`),
};

// ---- formatting

const inrF = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
/** Paise → "₹1,24,500". */
export const rupees = (paise?: number | null) => (paise == null ? '—' : `₹${inrF.format(Math.round(Number(paise) / 100))}`);
export const fmtD = (s?: string | null) => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const ago = (s: string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : fmtD(s);
};
/** Status colour slots used by configuration (0–5). */
export const SLOT: Color[] = [
  ['#15803D', '#DCFCE7'],
  ['#1D4ED8', '#DBEAFE'],
  ['#B45309', '#FEF3C7'],
  ['#B91C1C', '#FEE2E2'],
  ['#475569', '#F1F5F9'],
  ['#6D28D9', '#EDE9FE'],
];
export const BADGE: Record<string, Color> = {
  healthy: ['#15803D', '#DCFCE7'],
  degraded: ['#B45309', '#FEF3C7'],
  failed: ['#B91C1C', '#FEE2E2'],
  paused: ['#475569', '#F1F5F9'],
  info: ['#1D4ED8', '#DBEAFE'],
};
export const WARRANTY: Record<DateState['state'], Color> = {
  ACTIVE: ['#15803D', '#DCFCE7'],
  ENDING: ['#B45309', '#FEF3C7'],
  EXPIRED: ['#B91C1C', '#FEE2E2'],
  NONE: ['#64748B', 'transparent'],
};
export const saveBlob = (b: Blob, name: string) => {
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};
/** A value from a key/value row, readable. */
export const val = (v: unknown) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtD(v);
  return String(v);
};
