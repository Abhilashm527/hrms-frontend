import { api, blob, del, get, post } from '../lib/http';

export type AccessKey = 'ADMINS' | 'HR' | 'FINANCE' | 'IT' | 'EMPLOYEES';
export type DocFolder = {
  id: string;
  parentId: string | null;
  name: string;
  access: AccessKey | null;
  effectiveAccess: AccessKey;
  inheritedFrom: string | null;
  restricted: boolean;
  count: number;
  star: boolean;
  root: boolean;
};
export type Tree = {
  folders: DocFolder[];
  usedBytes: number;
  quotaBytes: number;
  canEdit: boolean;
  canSetAccess: boolean;
  accessOptions: { value: AccessKey; label: string }[];
  starredCount: number;
};
export type Item = {
  id: string;
  kind: 'FOLDER' | 'FILE';
  name: string;
  folderId: string | null;
  where: string;
  size: number | null;
  mime?: string;
  at: string;
  by: string | null;
  star: boolean;
  access: string;
};

const D = '/documents';
export const docsApi = {
  tree: () => get<Tree>(`${D}/tree`),
  items: (p: { folderId?: string; view?: 'starred' | 'recent'; q?: string }) =>
    get<{ items: Item[] }>(`${D}/items?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`),
  createFolder: (parentId: string, name: string) => post<{ id: string; name: string }>(`${D}/folders`, { parentId, name }),
  updateFolder: (id: string, body: { name?: string; access?: AccessKey | null; parentId?: string }) => api<{ id: string }>(`${D}/folders/${id}`, { method: 'PATCH', body }),
  updateFile: (id: string, body: { name?: string; folderId?: string }) => api<{ id: string }>(`${D}/files/${id}`, { method: 'PATCH', body }),
  /** One file per request, so each stays under the server's upload limit. */
  upload: (folderId: string, file: File) => {
    const fd = new FormData();
    fd.append('folderId', folderId);
    fd.append('files', file);
    return post<{ files: { id: string; name: string }[]; folder: string }>(`${D}/files`, fd);
  },
  move: (ids: string[], targetId: string) => post<{ moved: number }>(`${D}/move`, { ids, targetId }),
  remove: (ids: string[]) => post<{ deleted: number }>(`${D}/delete`, { ids }),
  star: (id: string, on: boolean) => (on ? api<void>(`${D}/star/${id}`, { method: 'PUT' }) : del<void>(`${D}/star/${id}`)),
  content: (id: string, inline = false) => blob(`${D}/files/${id}/content${inline ? '?inline=true' : ''}`),
};

export const kb = (n: number | null) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
export const ext = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();

/** File badge per type, as in the design: [label, text, background]. */
export function badge(name: string): [string, string, string] {
  const e = ext(name);
  if (e === 'pdf') return ['PDF', '#B91C1C', '#FEE2E2'];
  if (['doc', 'docx'].includes(e)) return ['DOC', '#1D4ED8', '#DBEAFE'];
  if (['xls', 'xlsx', 'csv'].includes(e)) return [e === 'csv' ? 'CSV' : 'XLS', '#15803D', '#DCFCE7'];
  if (['ppt', 'pptx'].includes(e)) return ['PPT', '#C2410C', '#FFEDD5'];
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return ['IMG', '#6D28D9', '#EDE9FE'];
  if (e === 'txt') return ['TXT', '#475569', '#F1F5F9'];
  return [e.toUpperCase().slice(0, 4) || 'FILE', '#475569', '#F1F5F9'];
}

export async function saveFile(id: string, name: string) {
  const b = await docsApi.content(id);
  const url = URL.createObjectURL(b);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
