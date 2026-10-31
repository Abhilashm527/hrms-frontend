import { api, blob, get, post } from '../lib/http';

export type Kind = 'LETTER' | 'REIMBURSEMENT' | 'HELPDESK';
export type Queue = Kind | 'DECLARATION';
export type Status = 'PENDING' | 'OPEN' | 'ISSUED' | 'PAID' | 'RESOLVED' | 'REJECTED' | 'WITHDRAWN';
export type Emp = { id: string; name: string; first: string; initials: string; code: string; title: string | null; department: string | null };

export type Req = {
  id: string;
  ref: string;
  kind: Kind;
  type: { id: string; name: string };
  title: string;
  subject: string | null;
  note: string;
  amount: number | null;
  expenseDate: string | null;
  receipt: string | null;
  letter: string | null;
  stage: 'MANAGER' | 'FINANCE' | 'HR' | 'TEAM' | 'DONE';
  stageLabel: string;
  status: Status;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  employee: Emp;
  manager: string | null;
  mine: boolean;
  canAct: boolean;
  canWithdraw: boolean;
  action: 'ISSUE' | 'RESOLVE' | 'PAY' | 'APPROVE' | null;
  events?: { at: string; action: string; note: string | null; by: string }[];
};

export type Decl = {
  id: string | null;
  fy: string;
  regime: 'NEW' | 'OLD';
  sec80c: number;
  sec80d: number;
  rentMonthly: number;
  nps: number;
  homeLoan: number;
  status: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
  submittedAt?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
  decisionNote?: string | null;
  employee?: Emp;
  limits?: { key: string; label: string; max: number }[];
};

export type Inbox = { items: (Req | Decl)[]; counts: Record<Queue, number>; hr: boolean; finance: boolean; canVerifyTax: boolean };
export type Mine = { items: Req[]; open: Record<Kind, number> };
export type TypeOpt = { id: string; name: string; category: string; active: boolean };

export type Change = {
  id: string;
  area: string;
  areaName: string;
  recordId: string;
  recordLabel: string;
  fieldKey: string;
  fieldLabel: string;
  oldValue: unknown;
  newValue: unknown;
  requestedBy: string;
  requestedAt: string;
  status: string;
  note: string | null;
};

const R = '/requests';
export const reqApi = {
  mine: (kind?: Kind) => get<Mine>(`${R}/mine${kind ? `?kind=${kind}` : ''}`),
  types: (category: Kind) => get<TypeOpt[]>(`/request-types/options?category=${category}`),
  submit: (fd: FormData) => api<Req>(R, { method: 'POST', body: fd }),
  inbox: (queue: Queue, closed = false) => get<Inbox>(`${R}/inbox?queue=${queue}&closed=${closed}`),
  detail: (id: string) => get<Req>(`${R}/${id}`),
  withdraw: (id: string) => post<Req>(`${R}/${id}/withdraw`),
  approve: (id: string, note?: string) => post<Req>(`${R}/${id}/approve`, { note }),
  reject: (id: string, note?: string) => post<Req>(`${R}/${id}/reject`, { note }),
  resolve: (id: string, note?: string) => post<Req>(`${R}/${id}/resolve`, { note }),
  issue: (id: string, fd: FormData) => api<Req>(`${R}/${id}/issue`, { method: 'POST', body: fd }),
  preview: (id: string) => blob(`${R}/${id}/letter-preview`),
  file: (id: string, which: 'receipt' | 'letter') => blob(`${R}/${id}/files/${which}`),
  tax: () => get<Decl>(`${R}/tax-declaration`),
  saveTax: (b: Partial<Decl> & { submit: boolean }) => api<Decl>(`${R}/tax-declaration`, { method: 'PUT', body: b }),
  verifyTax: (id: string, note?: string) => post<Decl>(`${R}/tax-declarations/${id}/verify`, { note }),
  rejectTax: (id: string, note?: string) => post<Decl>(`${R}/tax-declarations/${id}/reject`, { note }),
  changes: (status = 'PENDING') => get<Change[]>(`/forms/change-requests?status=${status}&area=employee_profile`),
  approveChange: (id: string) => post<void>(`/forms/change-requests/${id}/approve`),
  rejectChange: (id: string, note?: string) => post<void>(`/forms/change-requests/${id}/reject`, { note }),
};

const inrF = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export const inr = (n?: number | null) => (n == null ? '' : `₹${inrF.format(Number(n))}`);
export const STATUS: Record<string, [string, string]> = {
  PENDING: ['Pending', 'amber'],
  OPEN: ['Open', 'blue'],
  ISSUED: ['Issued', 'green'],
  PAID: ['Approved for payout', 'green'],
  RESOLVED: ['Resolved', 'green'],
  REJECTED: ['Rejected', 'red'],
  WITHDRAWN: ['Withdrawn', 'grey'],
  DRAFT: ['Draft', 'grey'],
  SUBMITTED: ['Submitted', 'blue'],
  VERIFIED: ['Verified', 'green'],
  APPROVED: ['Approved', 'green'],
  CANCELLED: ['Withdrawn', 'grey'],
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
export const openBlob = (b: Blob) => {
  const u = URL.createObjectURL(b);
  window.open(u, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(u), 60_000);
};
export const show = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
