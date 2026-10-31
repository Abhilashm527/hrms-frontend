import { api, del, get, post } from '../../lib/http';

export type Level = 'HIDDEN' | 'MASKED' | 'VIEW' | 'HR_APPROVES' | 'EDIT';
export type AccessCell = { roleId: string; roleKey: string; roleName: string; own: Level; others: Level; explicit: boolean };
export type Rule = { fieldKey: string; op: 'FILLED' | 'EMPTY' | 'EQUALS'; value?: string } | null;

export type Field = {
  id: string;
  sectionId: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue: unknown;
  helpText: string | null;
  options: string[];
  visibilityRule: Rule;
  sort: number;
  system: boolean;
  active: boolean;
  maskedDefault: boolean;
  source: string | null;
  hasData: boolean;
  version: number;
  access: AccessCell[];
};
export type Section = { id: string; key: string; name: string; description: string | null; sort: number; system: boolean; locked: boolean; active: boolean; showInPortal: boolean; fieldCount: number; version: number; fields: Field[] };
export type Area = { key: string; name: string; description: string; module: string; allowedTypes: string[]; owners: { roleId: string; name: string }[]; sections: Section[] };
export type AreaSummary = { key: string; name: string; description: string; sectionCount: number; fieldCount: number; owners: string[] };
export type Meta = { types: { value: string; label: string }[]; typesByArea: Record<string, string[]>; levels: { value: Level; label: string }[]; conditionOps: { value: string; label: string }[] };
export type Matrix = {
  side: 'OWN' | 'OTHERS';
  text: string;
  roles: { id: string; key: string; name: string }[];
  rows: { type: 'SECTION' | 'FIELD'; name?: string; fieldId?: string; label?: string; cells?: { roleId: string; level: Level; explicit: boolean }[] }[];
};

const C = '/config';
const ifMatch = (v: number) => ({ 'If-Match': `"${v}"` });

export const fieldsApi = {
  areas: () => get<AreaSummary[]>(`${C}/areas`),
  area: (key: string) => get<Area>(`${C}/areas/${key}`),
  meta: () => get<Meta>(`${C}/meta`),
  addSection: (key: string, name: string) => post<Section>(`${C}/areas/${key}/sections`, { name }),
  updateSection: (id: string, body: Record<string, unknown>, v: number) => api<Section>(`${C}/sections/${id}`, { method: 'PATCH', body, headers: ifMatch(v) }),
  deleteSection: (id: string, force = false) => del<void>(`${C}/sections/${id}?force=${force}`),
  restoreSection: (id: string) => post<void>(`${C}/sections/${id}/restore`),
  addField: (key: string, sectionId: string, type = 'TEXT') => post<Field>(`${C}/areas/${key}/fields`, { sectionId, label: 'New field', type }),
  duplicateField: (id: string) => post<Field>(`${C}/fields/${id}/duplicate`),
  /** Merge patch: send `null` to clear a value. */
  updateField: (id: string, body: Record<string, unknown>, v: number, force = false) =>
    api<Field>(`${C}/fields/${id}?force=${force}`, { method: 'PATCH', body, headers: { ...ifMatch(v), 'Content-Type': 'application/merge-patch+json' } }),
  deleteField: (id: string, force = false) => del<void>(`${C}/fields/${id}?force=${force}`),
  restoreField: (id: string) => post<Field>(`${C}/fields/${id}/restore`),
  usage: (id: string) => get<{ valueCount: number; pendingCount: number; usedInConditions: string[]; system: boolean }>(`${C}/fields/${id}/usage`),
  reorder: (key: string, sections: string[], fields: Record<string, string[]>) => post<Area>(`${C}/areas/${key}/reorder`, { sections, fields }),
  matrix: (key: string, side: 'OWN' | 'OTHERS') => get<Matrix>(`${C}/areas/${key}/access-matrix?side=${side}`),
  setCell: (key: string, side: 'OWN' | 'OTHERS', fieldId: string, roleId: string, level: Level | null) =>
    api<void>(`${C}/areas/${key}/access-matrix`, { method: 'PATCH', body: { side, cells: [{ fieldId, roleId, level }] } }),
};

/** The Configuration menu entries and the area each one edits, plus where that area's fields show up. */
export const AREAS: { key: string; slug: string; label: string; shownOn: { label: string; to?: string }[] }[] = [
  { key: 'employee_profile', slug: 'employee-profile', label: 'Employee profile', shownOn: [{ label: 'Employee profiles', to: '/employees' }, { label: 'My profile', to: '/me/profile' }, { label: 'New-hire portal (sections marked "show in portal")' }] },
  { key: 'onboarding', slug: 'onboarding', label: 'Onboarding · new hire form', shownOn: [{ label: 'Onboarding → New hire', to: '/onboarding?new=1' }] },
  { key: 'leave', slug: 'leave', label: 'Leave requests', shownOn: [{ label: 'Apply leave and the leave request (screen coming next)' }] },
  { key: 'attendance', slug: 'attendance', label: 'Attendance & timesheets', shownOn: [{ label: 'Regularisation requests (screen coming next)' }] },
  { key: 'requests', slug: 'requests', label: 'Requests', shownOn: [{ label: 'New request and the ticket (screen coming next)' }] },
  { key: 'assets', slug: 'assets', label: 'Assets', shownOn: [{ label: 'Hardware and software requests (screen coming next)' }] },
  { key: 'recruiting', slug: 'recruiting', label: 'Recruiting & candidates', shownOn: [{ label: 'Candidate details (screen coming next)' }] },
  { key: 'payroll', slug: 'payroll', label: 'Payroll', shownOn: [{ label: 'Employee profile → Payroll details', to: '/employees' }] },
  { key: 'performance', slug: 'performance', label: 'Performance', shownOn: [{ label: 'Employee profile → Performance details', to: '/employees' }] },
];

/** Colours from the API spec, by access level. */
export const LEVEL_STYLE: Record<Level, { fg: string; bg: string }> = {
  HIDDEN: { fg: 'var(--lv-hidden-fg)', bg: 'var(--lv-hidden-bg)' },
  MASKED: { fg: 'var(--lv-masked-fg)', bg: 'var(--lv-masked-bg)' },
  VIEW: { fg: 'var(--lv-view-fg)', bg: 'var(--lv-view-bg)' },
  HR_APPROVES: { fg: 'var(--lv-approve-fg)', bg: 'var(--lv-approve-bg)' },
  EDIT: { fg: 'var(--lv-edit-fg)', bg: 'var(--lv-edit-bg)' },
};
