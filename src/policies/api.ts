import { api, blob, del, get, post } from '../lib/http';
import type { Page } from './doc/model';

export type Section = { heading: string; body: string };
export type Category = { id: string; name: string; color: string; count?: number };
export type Person = { id: string; name: string; initials: string } | null;
export type Status = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type Row = {
  id: string;
  name: string;
  category: Category;
  owner: Person;
  approver: Person;
  cycleMonths: number;
  ackRequired: boolean;
  archived: boolean;
  versionCount: number;
  version: string | null;
  effective: string | null;
  status: Status;
  draft: { inReview: boolean; approved: boolean; nextVersion: string } | null;
  updatedAt: string | null;
  nextReview: string | null;
  ack: { done: number; total: number } | null;
};
export type Changes = { added: number; removed: number; edited: number; sentencesAdded: number; sentencesRemoved: number; reordered: boolean; total: number; sections: { heading: string; change: 'ADDED' | 'EDITED' | 'REMOVED' }[] };
export type Version = { id: string; version: string; note: string | null; major: boolean; requiresAck: boolean; publishedAt: string; publishedBy: string | null; sections: Section[] };
export type Detail = Omit<Row, 'draft' | 'ack' | 'versionCount' | 'updatedAt'> & {
  ownerId: string | null;
  approverId: string | null;
  lastReviewedOn: string | null;
  createdAt: string;
  versions: Version[];
  draft: { sections: Section[]; note: string | null; inReview: boolean; approved: boolean; updatedAt: string; updatedBy: string | null; nextVersion: string; nextMajor: string; changes: Changes } | null;
  events: { type: string; text: string; version: string | null; at: string; by: string }[];
  acks: {
    version: string;
    total: number;
    done: number;
    departments: { name: string; total: number; done: number }[];
    pending: { id: string; name: string; department: string }[];
    recent: { id: string; name: string; department: string; at: string }[];
  } | null;
  canManage: boolean;
  canApprove: boolean;
  page: Page;
  header: string;
  footer: string;
  appliesTo: string;
};
export type Mine = { items: { id: string; name: string; category: { name: string; color: string }; version: string; effective: string; ackRequired: boolean; needsAck: boolean; acknowledgedAt: string | null }[]; pending: number };
export type Reading = { id: string; name: string; category: Category; owner: string | null; version: string; sections: Section[]; effective: string; note: string | null; ackRequired: boolean; acknowledgedAt: string | null; page: Page; header: string; footer: string; appliesTo: string };

/** A PDF or Word file read into sections (nothing saved yet). */
export type Imported = { title: string; pages: number; sections: Section[] };

const P = '/policies';
export const polApi = {
  list: () => get<{ items: Row[]; categories: Category[]; staff: number }>(P),
  newOptions: () => get<{ templates: { key: string; name: string; category: string }[]; people: { id: string; name: string; title: string | null }[]; me: string }>(`${P}/new-options`),
  create: (b: Record<string, unknown>) => post<{ id: string }>(P, b),
  detail: (id: string) => get<Detail>(`${P}/${id}`),
  update: (id: string, b: Record<string, unknown>) => api<{ id: string }>(`${P}/${id}`, { method: 'PATCH', body: b }),
  remove: (id: string) => del<void>(`${P}/${id}`),
  startDraft: (id: string) => post<{ id: string }>(`${P}/${id}/draft`),
  saveDraft: (id: string, sections: Section[], note: string) => api<{ id: string }>(`${P}/${id}/draft`, { method: 'PUT', body: { sections, note } }),
  discardDraft: (id: string) => del<void>(`${P}/${id}/draft`),
  submit: (id: string) => post<void>(`${P}/${id}/submit`),
  approve: (id: string) => post<void>(`${P}/${id}/approve`),
  publish: (id: string, b: { major: boolean; note: string; requireAck: boolean }) => post<{ version: string }>(`${P}/${id}/publish`, b),
  reviewed: (id: string) => post<void>(`${P}/${id}/reviewed`),
  archive: (id: string, on: boolean) => post<void>(`${P}/${id}/${on ? 'archive' : 'restore'}`),
  pdf: (id: string, version?: string) => blob(`${P}/${id}/pdf${version ? `?version=${encodeURIComponent(version)}` : ''}`),
  categories: () => get<Category[]>(`${P}/categories`),
  addCategory: (b: { name: string; color: string }) => post<{ id: string }>(`${P}/categories`, b),
  updateCategory: (id: string, b: { name?: string; color?: string }) => api<{ id: string }>(`${P}/categories/${id}`, { method: 'PATCH', body: b }),
  deleteCategory: (id: string) => del<void>(`${P}/categories/${id}`),
  mine: () => get<Mine>(`${P}/mine`),
  read: (id: string) => get<Reading>(`${P}/${id}/read`),
  acknowledge: (id: string) => post<{ version: string }>(`${P}/${id}/acknowledge`),
  remind: (id: string) => post<{ sent: number }>(`${P}/${id}/remind`),
  importFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return post<Imported>(`${P}/import`, fd);
  },
};

export async function downloadPdf(id: string, name: string, version?: string) {
  const b = await polApi.pdf(id, version);
  const url = URL.createObjectURL(b);
  Object.assign(document.createElement('a'), { href: url, download: `${name}${version && version !== 'draft' ? ` v${version}` : ''}.pdf` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmtD = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const daysTo = (d: string | null) => (d ? Math.round((+new Date(d + 'T00:00:00') - +new Date(new Date().toDateString())) / 864e5) : null);
export const dueTxt = (n: number | null) => (n == null ? '' : n < 0 ? `${-n} days overdue` : n === 0 ? 'due today' : `in ${n} days`);
/** Category chip colours from its hex: tinted background, readable text. */
export function catTone(hex: string): { fg: string; bg: string } {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lt = (k: number) => '#' + [r, g, b].map((c) => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0')).join('');
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const dk = (k: number) => '#' + [r, g, b].map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('');
  return { fg: lum > 0.55 ? dk(0.5) : lum > 0.4 ? dk(0.75) : hex, bg: lt(0.86) };
}
export const STATUS: Record<Status, [string, string]> = { DRAFT: ['Draft', 'pill-muted'], IN_REVIEW: ['In review', 'pill-warn'], PUBLISHED: ['Published', 'pill-ok'], ARCHIVED: ['Archived', 'pill-muted'] };
