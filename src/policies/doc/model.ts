import { RT_NS, rtEsc } from './rt';

/** A section as stored: heading plus body (formatted HTML, or plain text in older policies). */
export type Sec = { heading: string; body: string };
export type Page = { size: 'A5' | 'A4' | 'A3' | 'Letter' | 'Legal'; margin: 'Narrow' | 'Normal' | 'Wide'; orient: 'Portrait' | 'Landscape'; logo: boolean; wm: boolean };
export const PAGE_DEFAULT: Page = { size: 'A4', margin: 'Normal', orient: 'Portrait', logo: true, wm: true };

/** Plain text from older policies: a blank line starts a paragraph, a single break stays a break. */
export const textToHtml = (t: string) =>
  (t || '')
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p data-n="2" style="${RT_NS.P}">${rtEsc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
export const bodyHtml = (b: string) => (/^\s*</.test(b || '') ? b : textToHtml(b));

/** The whole document: each section heading becomes a top-level heading (the toolbar's "H1"). */
export const buildDoc = (secs: Sec[]) =>
  secs.map((s) => `<h2 data-n="2" style="${RT_NS.H2}">${rtEsc(s.heading || '')}</h2>` + (bodyHtml(s.body) || `<p data-n="2" style="${RT_NS.P}"><br></p>`)).join('');

/** Back to sections: each top-level heading starts one; text before the first heading goes under "Introduction". */
export const parseDoc = (html: string): Sec[] => {
  const t = document.createElement('div');
  t.innerHTML = html || '';
  const secs: Sec[] = [];
  let cur: Sec | null = null;
  [...t.childNodes].forEach((n) => {
    if (n.nodeType === 1 && (n as Element).tagName === 'H2') {
      cur = { heading: (n.textContent || '').trim(), body: '' };
      secs.push(cur);
      return;
    }
    if (!cur) {
      cur = { heading: 'Introduction', body: '' };
      secs.push(cur);
    }
    cur.body += n.nodeType === 1 ? (n as Element).outerHTML : (n.textContent || '').trim() ? `<p>${rtEsc(n.textContent || '')}</p>` : '';
  });
  return secs.filter((s) => s.heading || sentences(s.body).length || /<img|<table/i.test(s.body)).map((s) => ({ heading: s.heading || 'Untitled section', body: s.body }));
};

export const plain = (h: string) =>
  (h || '')
    .replace(/<img[^>]*>/gi, ' [Image]. ')
    .replace(/<table[\s\S]*?<\/table>/gi, (m) => ' [Table] ' + m.replace(/<[^>]+>/g, ' ') + '. ')
    .replace(/<(br|hr)[^>]*>/gi, '. ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/(\.\s*){2,}/g, '. ');
export const sentences = (t: string) =>
  plain(/^\s*</.test(t || '') ? t : (t || '').replace(/\n+/g, '. '))
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => /[A-Za-z0-9\]₹]/.test(x));

export type Part = { t: string; k: 'same' | 'add' | 'del' };
const lcs = (a: string[], b: string[]): Part[] => {
  const n = a.length;
  const m = b.length;
  const T = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = a[i] === b[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
  const out: Part[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ t: a[i], k: 'same' });
      i++;
      j++;
    } else if (T[i + 1][j] >= T[i][j + 1]) out.push({ t: a[i++], k: 'del' });
    else out.push({ t: b[j++], k: 'add' });
  }
  while (i < n) out.push({ t: a[i++], k: 'del' });
  while (j < m) out.push({ t: b[j++], k: 'add' });
  return out;
};

export type SecDiff = { h: string; k: 'added' | 'removed' | 'edited' | 'same'; parts: Part[] };
export type DiffStats = { add: number; del: number; secAdd: number; secDel: number; secEd: number };
/** Sentence-level comparison of two versions, section by section. */
export const diffSecs = (oldS: Sec[], newS: Sec[]): { secs: SecDiff[]; st: DiffStats } => {
  const O = new Map(oldS.map((s) => [s.heading, s.body]));
  const N = new Set(newS.map((s) => s.heading));
  const out: SecDiff[] = [];
  newS.forEach((s) => {
    if (!O.has(s.heading)) out.push({ h: s.heading, k: 'added', parts: sentences(s.body).map((t) => ({ t, k: 'add' })) });
    else {
      const parts = lcs(sentences(O.get(s.heading)!), sentences(s.body));
      out.push({ h: s.heading, k: parts.some((p) => p.k !== 'same') ? 'edited' : 'same', parts });
    }
  });
  oldS.forEach((s, i) => {
    if (!N.has(s.heading)) out.splice(Math.min(i, out.length), 0, { h: s.heading, k: 'removed', parts: sentences(s.body).map((t) => ({ t, k: 'del' })) });
  });
  const st: DiffStats = { add: 0, del: 0, secAdd: 0, secDel: 0, secEd: 0 };
  out.forEach((x) => {
    x.parts.forEach((p) => {
      if (p.k === 'add') st.add++;
      if (p.k === 'del') st.del++;
    });
    if (x.k === 'added') st.secAdd++;
    if (x.k === 'removed') st.secDel++;
    if (x.k === 'edited') st.secEd++;
  });
  return { secs: out, st };
};
