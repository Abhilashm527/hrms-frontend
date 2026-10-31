import { api, del, get, post } from '../lib/http';

type Ref = { id: string; name: string; color?: number };

export type DirectoryItem = {
  id: string;
  code: string;
  name: string;
  initials: string;
  photoUrl: string;
  title?: string;
  position?: Ref;
  department?: Ref;
  location?: Ref;
  manager?: Ref;
  doj?: string;
  email?: string;
  phone?: string;
  status: string;
  statusLabel: string;
  statusKind: string;
};
export type Directory = { items: DirectoryItem[]; page: number; size: number; total: number; totalAll: number; groups?: { key: string | null; label: string; count: number }[] };
/** One person for the split view's right-hand panel: their row, the fields the viewer may see, and their direct reports. */
export type DirectoryPreview = DirectoryItem & { fields: { key: string; label: string; value: unknown }[]; reports: DirectoryItem[] };
export type DirectoryFilters = {
  departments: { id: string; name: string; count?: number }[];
  locations: { id: string; name: string; count?: number }[];
  statuses: Record<string, number>;
};

/** How the viewer may use a field: EDIT saves straight away, REQUEST goes to HR for approval. */
export type Access = 'HIDDEN' | 'MASKED' | 'VIEW' | 'REQUEST' | 'EDIT';

export type ProfileField = {
  key: string;
  label: string;
  type: string;
  value: unknown;
  display: string | null;
  access: Access;
  masked: boolean;
  required: boolean;
  helpText?: string | null;
  options?: string[];
  source?: string | null;
  editVia?: 'JOB_CHANGE' | null;
  pending: { id: string; to: string; by: string; at: string; text: string; canApprove: boolean } | null;
};
export type ProfileSection = { key: string; label: string; tab: string; fields: ProfileField[] };

export type Money = number | string;
export type Profile = {
  id: string;
  code: string;
  name: string;
  initials: string;
  self: boolean;
  status: string;
  statusLabel: string;
  statusKind: string;
  title: string | null;
  titleDisplay: string | null;
  department: Ref | null;
  location: Ref | null;
  position: { id: string; name: string; grade: string | null } | null;
  photoUrl: string;
  hasCustomPhoto: boolean;
  joined: string | null;
  probationEnd: string | null;
  manager: { id: string; name: string; title: string } | null;
  reports: { id: string; name: string; title: string }[];
  tabs: { key: string; label: string }[];
  sections: ProfileSection[];
  hiddenSections: string[];
  viewerRoles: string[];
  leave?: { year: number; balances: { code: string; name: string; quota: number; used: number; available: number }[]; requests: unknown[]; canApply: boolean };
  compensation?: {
    access: { ctc: string; monthly: string; payslip: string };
    estimated: boolean;
    regime?: string;
    ptState?: string;
    masked?: boolean;
    ctcAnnual?: Money;
    earnings?: { key: string; label: string; amount: Money }[];
    deductions?: { key: string; label: string; amount: Money }[];
    netMonthly?: Money;
  };
  extraPanels?: Record<string, { title: string; sections: { name: string; showName: boolean; fields: { key: string; label: string; type: string; level: string; display: string | null; value: unknown }[] }[] }>;
  actions: Record<string, boolean>;
  version: number;
};

export type EmployeeDoc = {
  id: string;
  name: string;
  category: string;
  fileName: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | string;
  note: string | null;
  source: string | null;
};

export const DOC_CATEGORIES = ['Identity', 'Address', 'Education', 'Previous employment', 'Banking & statutory', 'Offer', 'Letters', 'Tax', 'Other'];

const E = '/employees';

export const employeesApi = {
  list: (q: URLSearchParams) => get<Directory>(`${E}?${q}`),
  filters: () => get<DirectoryFilters>(`${E}/filters`),
  preview: (id: string) => get<DirectoryPreview>(`${E}/${id}/preview`),
  profile: (id: string) => get<Profile>(`${E}/${id}/profile`),
  /** Saves profile fields; fields needing approval come back under `requested`. */
  saveFields: (id: string, values: Record<string, unknown>, version: number) =>
    api<{ applied: string[]; requested: { key: string; requestId: string }[]; rejected: { key: string; code: string }[]; version: number }>(`${E}/${id}/fields`, {
      method: 'PATCH',
      body: { values },
      headers: { 'If-Match': `"${version}"` },
    }),
  approveChange: (id: string, reqId: string) => post<unknown>(`${E}/${id}/change-requests/${reqId}/approve`),
  rejectChange: (id: string, reqId: string, reason: string) => post<unknown>(`${E}/${id}/change-requests/${reqId}/reject`, { reason }),
  uploadPhoto: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api<unknown>(`${E}/${id}/photo`, { method: 'PUT', body: fd });
  },
  removePhoto: (id: string) => del<void>(`${E}/${id}/photo`),
  idCardPdf: (id: string) => `${E}/${id}/id-card.pdf`,
  documents: (id: string) => get<EmployeeDoc[]>(`${E}/${id}/documents`),
  uploadDocument: (id: string, file: File, name: string, category: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (name) fd.append('name', name);
    fd.append('category', category);
    return api<EmployeeDoc>(`${E}/${id}/documents`, { method: 'POST', body: fd });
  },
  docFile: (id: string, docId: string) => `${E}/${id}/documents/${docId}/file`,
  verifyDocument: (id: string, docId: string) => post<void>(`${E}/${id}/documents/${docId}/verify`),
  rejectDocument: (id: string, docId: string, reason: string) => post<void>(`${E}/${id}/documents/${docId}/reject`, { reason }),
  deleteDocument: (id: string, docId: string) => del<void>(`${E}/${id}/documents/${docId}`),
  previousEmployment: (id: string) => get<Record<string, unknown>[]>(`${E}/${id}/previous-employment`),
};
