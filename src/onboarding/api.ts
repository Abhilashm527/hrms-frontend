import { api, del, get, patch, post } from '../lib/http';

export type HireStatus = 'DRAFT' | 'INVITED' | 'IN_PROGRESS' | 'REVIEW_PENDING' | 'ACTION_NEEDED' | 'READY_TO_JOIN' | 'JOINED';
export type Stage = 'PROFILE' | 'M365' | 'INVITE' | 'DETAILS_DOCS' | 'HR_VERIFICATION' | 'DAY_1';
export type Ref = { id: string; name: string };
export type DocCounts = { required: number; verified: number; submitted: number; missing: number; rejected: number; total: number };

export type HireRow = {
  id: string;
  name: string;
  first: string;
  last: string;
  title: string;
  employmentType: Ref;
  department: Ref;
  location: Ref;
  doj: string;
  daysToJoin: number;
  status: HireStatus;
  stages: boolean[];
  nextStage: Stage | null;
  docs: DocCounts;
  m365: 'NONE' | 'RUNNING' | 'ACTIVE' | 'FAILED' | string;
  invitedAt: string | null;
  reminders: number;
};

export type Counts = {
  inPipeline: number;
  drafts: number;
  attention: number;
  joining30: number;
  joiningWeek: number;
  joiningWeekNotReady: number;
  byStatus: Record<HireStatus, number>;
  docsToReview: number;
};

export type HireList = { items: HireRow[]; page: number; size: number; total: number; counts: Counts };

export type M365View = {
  state: 'NONE' | 'RUNNING' | 'ACTIVE' | 'FAILED';
  upn?: string;
  license?: string;
  groups?: string[];
  step?: number;
  steps: { label: string; done: boolean; current: boolean }[];
  createdAt?: string;
  error?: string | null;
  smsTo?: string | null;
  simulated?: boolean;
};

export type Invite = { to: string; sentAt: string; lastSentAt: string; reminders: number; lastReminderAt: string | null; dueDate: string | null; expiresAt: string | null; remindEveryDays: number | null };

export type HireDetail = HireRow & {
  job: {
    employmentType: Ref;
    department: Ref;
    location: Ref;
    reportsTo: Ref;
    doj: string;
    probationMonths: number | null;
    contractEnd: string | null;
    ctcLakh: number | null;
    personalEmail: string;
    phone: string | null;
    gender: string | null;
    dob: string | null;
  };
  version: number;
  m365: M365View;
  invite: Invite | null;
  stagesDetail: { label: string; sub: string }[];
  employeeId: string | null;
  cancelledAt: string | null;
  permissions: { canEdit: boolean; canJoin: boolean; canCancel: boolean; canViewCtc: boolean };
};

export type DocStatus = 'MISSING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
export type HireDoc = {
  id: string;
  key: string;
  name: string;
  hint: string | null;
  group: string | null;
  required: boolean;
  status: DocStatus;
  note: string | null;
  file: { name: string; sizeBytes: number; uploadedAt: string; scan: string | null } | null;
};

export type FormField = { key: string; label: string; type: string; required: boolean; options: string[] };
export type FormStep = { key: string; name: string; kind: 'FIELDS' | 'M365' | 'DOCS_INVITE' | string; locked: boolean; fields: FormField[] };
export type DocTemplate = { id: string; key: string; name: string; hint: string | null; group: string | null; employmentTypeId: string | null; required: boolean };
export type HireForm = {
  steps: FormStep[];
  m365Rule: { upnFormat: string; licenseSku: string; groups: string[]; forceReset: boolean } | null;
  licenses: string[];
  domain: string;
  documents: DocTemplate[];
  invite: { id: string; name: string; subject: string; dueDaysBefore: number } | null;
};

export type Option = { id: string; name: string; code?: string; path?: string };
export type EmploymentTypeOption = Option & { fixedTerm: boolean; probationMonths: number };
export type TitleOption = { id: string; name: string; positionName?: string };
export type Person = { id: string; name: string; title?: string; code?: string };

export type Task = { id: string; name: string; phase: string; owner: string; done: boolean; doneAt: string | null; assignee: Ref | null };
export type HireEvent = { id: number; kind: string; title: string; description: string; at: string; by: string };

export type NewHireBody = {
  values: Record<string, unknown>;
  extra?: Record<string, unknown>;
  documents?: { key: string; required: boolean }[];
  m365?: { upnUser: string; license: string; groups: string[]; forceReset: boolean; sendSms: boolean; provisionNow: boolean };
  inviteTemplateId?: string;
};

const H = '/onboarding/hires';

export const onboardingApi = {
  list: (q: URLSearchParams) => get<HireList>(`${H}?${q}`),
  get: (id: string) => get<HireDetail>(`${H}/${id}`),
  form: (employmentTypeId?: string) => get<HireForm>(`/onboarding/hire-form${employmentTypeId ? `?employmentTypeId=${employmentTypeId}` : ''}`),
  upnSuggest: (first: string, last: string, employmentTypeId?: string) =>
    get<{ user: string; available: boolean; suggestion: string }>(`/onboarding/upn-suggest?${new URLSearchParams({ first, last, ...(employmentTypeId ? { employmentTypeId } : {}) })}`),
  upnCheck: (user: string, hireId?: string) => get<{ upn: string; available: boolean; suggestion: string | null }>(`/onboarding/upn-check?${new URLSearchParams({ user, ...(hireId ? { hireId } : {}) })}`),
  invitePreview: (body: NewHireBody) => post<{ to: string | null; cc: string | null; subject: string; html: string; dueDate: string | null }>('/onboarding/invite-preview', body),
  create: (body: NewHireBody, invite: boolean) => post<HireDetail>(`${H}?invite=${invite}`, body),
  update: (id: string, values: Record<string, unknown>, version: number) => api<HireDetail>(`${H}/${id}`, { method: 'PATCH', body: { values }, headers: { 'If-Match': `"${version}"` } }),
  invite: (id: string) => post<{ sentTo: string; link: string }>(`${H}/${id}/invite`),
  resend: (id: string) => post<{ sentTo: string; link: string }>(`${H}/${id}/invite/resend`),
  remind: (id: string) => post<unknown>(`${H}/${id}/remind`, {}),
  cancel: (id: string, reason: string) => post<void>(`${H}/${id}/cancel`, { reason }),
  join: (id: string, force = false, reason?: string) => post<{ employeeId: string; hireId: string }>(`${H}/${id}/join?${new URLSearchParams({ force: String(force), ...(reason ? { reason } : {}) })}`),
  documents: (id: string) => get<HireDoc[]>(`${H}/${id}/documents`),
  requestDocument: (id: string, key: string, required: boolean) => post<unknown>(`${H}/${id}/documents`, { key, required }),
  verify: (id: string, docId: string) => post<void>(`${H}/${id}/documents/${docId}/verify`),
  reject: (id: string, docId: string, reason: string) => post<void>(`${H}/${id}/documents/${docId}/reject`, { reason }),
  unverify: (id: string, docId: string, reason: string) => post<void>(`${H}/${id}/documents/${docId}/unverify`, { reason }),
  verifyAll: (id: string) => post<unknown>(`${H}/${id}/documents/verify-all`),
  removeDocument: (id: string, docId: string) => del<void>(`${H}/${id}/documents/${docId}`),
  docFile: (id: string, docId: string) => `${H}/${id}/documents/${docId}/file`,
  m365: (id: string) => get<M365View>(`${H}/${id}/m365`),
  createM365: (id: string, body: NonNullable<NewHireBody['m365']>) => post<M365View>(`${H}/${id}/m365`, body),
  retryM365: (id: string) => post<M365View>(`${H}/${id}/m365/retry`),
  resetM365Password: (id: string) => post<unknown>(`${H}/${id}/m365/reset-password`),
  tasks: (id: string) => get<Task[]>(`${H}/${id}/tasks`),
  setTask: (id: string, taskId: string, done: boolean) => patch<unknown>(`${H}/${id}/tasks/${taskId}`, { done }),
  events: (id: string) => get<{ items: HireEvent[]; next: number | null }>(`${H}/${id}/events`),
  details: (id: string) => get<{ name: string; fields: { key: string; label: string; value: string | null }[] }[]>(`${H}/${id}/details`),
};

export const lookupApi = {
  departments: () => get<Option[]>('/departments/options'),
  locations: () => get<Option[]>('/locations/options'),
  employmentTypes: () => get<EmploymentTypeOption[]>('/employment-types/options'),
  titles: (departmentId?: string) => get<TitleOption[]>(`/titles/options${departmentId ? `?departmentId=${departmentId}` : ''}`),
  people: (q: string) => get<{ items: Person[] }>(`/employees?${new URLSearchParams({ q, size: '20' })}`),
};

// ---- new-hire portal (signed in by the invite token, not an account) ----

export type PortalField = { key: string; label: string; type: string; required: boolean; options: string[]; help: string | null; value: string | null };
export type PortalView = {
  hire: { first: string; title: string; doj: string; location: string; manager: string | null; upn: string | null; dueDate: string | null };
  sections: { name: string; fields: PortalField[] }[];
  documents: HireDoc[];
  progress: { pct: number; detailsFilled: number; detailsRequired: number; docsDone: number; docsRequired: number };
  state: 'NOT_SUBMITTED' | 'SUBMITTED' | 'ALL_VERIFIED';
  submittedAt: string | null;
};

const P = '/portal/onboarding';
const portalOpts = (token: string) => ({ auth: false as const, headers: { 'X-Onboarding-Token': token } });

export const portalApi = {
  view: (token: string) => get<PortalView>(P, portalOpts(token)),
  save: (token: string, values: Record<string, string | null>) => patch<PortalView>(`${P}/details`, values, portalOpts(token)),
  upload: (token: string, docId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api<PortalView>(`${P}/documents/${docId}`, { ...portalOpts(token), method: 'POST', body: fd });
  },
  submit: (token: string) => post<PortalView>(`${P}/submit`, {}, portalOpts(token)),
};
