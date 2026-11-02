/**
 * The rich-text engine behind the policy document editor (ported from the design prototype). One editor is "live" at a time;
 * the toolbar acts on it through {@link RT}. Formatting uses the browser's editing commands, and everything pasted or saved is
 * cleaned by {@link rtSanitize} to a small set of document tags.
 */

type Emit = () => void;
export const RT: { el: HTMLElement | null; range: Range | null; img: HTMLImageElement | null; emit: Emit | null; subs: Set<() => void> } = {
  el: null,
  range: null,
  img: null,
  emit: null,
  subs: new Set(),
};
export const rtNotify = () => RT.subs.forEach((fn) => fn());
export const rtLive = () => !!(RT.el && RT.el.isConnected);
const saveRange = () => {
  const s = window.getSelection();
  if (s && s.rangeCount) RT.range = s.getRangeAt(0).cloneRange();
};
export const rtRestore = () => {
  if (!rtLive()) return false;
  RT.el!.focus();
  if (RT.range) {
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(RT.range);
  }
  return true;
};
export const rtDone = () => {
  RT.emit?.();
  rtNotify();
};
export const rtExec = (cmd: string, val?: string) => {
  if (!rtRestore()) return;
  try {
    document.execCommand('styleWithCSS', false, String(cmd === 'foreColor' || cmd === 'hiliteColor' || cmd === 'fontName'));
  } catch {
    /* not supported */
  }
  document.execCommand(cmd, false, val);
  saveRange();
  rtDone();
};

export const rtEsc = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------------ images

const imgUrl = (file: File) =>
  new Promise<string>((res) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1400 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k);
        c.height = Math.round(im.height * k);
        c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86));
      };
      im.onerror = () => res(String(fr.result));
      im.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
export const rtInsertImg = async (file: File) => {
  if (!file || !/^image\//.test(file.type)) return;
  const url = await imgUrl(file);
  rtExec('insertHTML', `<img src="${url}" alt="" style="display:block;max-width:100%;width:60%;height:auto;border-radius:6px;margin:8px 0">`);
};

// ------------------------------------------------------------------ block styles

export const RT_NS: Record<string, string> = {
  H2: 'margin:18px 0 8px;font-size:20px;font-weight:600;line-height:1.3;color:#111827',
  H3: 'margin:14px 0 6px;font-size:16.5px;font-weight:600;line-height:1.35;color:#111827',
  H4: 'margin:12px 0 4px;font-size:14.5px;font-weight:600;color:#111827',
  P: 'margin:0 0 8px',
  UL: 'margin:0 0 8px;padding-left:26px',
  OL: 'margin:0 0 8px;padding-left:26px',
  BLOCKQUOTE: 'margin:0 0 8px;padding:2px 0 2px 14px;border-left:3px solid #D1D5DB;color:#4B5563',
};
export const rtNorm = (el: HTMLElement) =>
  el.querySelectorAll<HTMLElement>('h2,h3,h4,p,ul,ol,blockquote').forEach((n) => {
    if (n.getAttribute('data-n') !== '2') {
      const ta = n.style.textAlign;
      n.setAttribute('style', RT_NS[n.tagName] + (ta ? ';text-align:' + ta : ''));
      n.setAttribute('data-n', '2');
    }
  });

export const rtCode = () => {
  if (!rtRestore()) return;
  const t = window.getSelection()!.toString();
  if (!t) return;
  rtExec('insertHTML', `<code style="font-family:ui-monospace,monospace;font-size:0.88em;background:#F3F4F6;color:#111827;border:1px solid #E5E7EB;padding:1px 6px;border-radius:4px">${rtEsc(t)}</code>&nbsp;`);
};

/** Turns the selection (or the block it's in) into a heading or paragraph, splitting the block when only part is selected. */
export const rtHeading = (tag: string) => {
  if (!rtRestore()) return;
  const s = window.getSelection()!;
  if (!s.rangeCount) return;
  const rg = s.getRangeAt(0);
  const blk = (n: Node | null): HTMLElement | null => {
    while (n && n !== RT.el) {
      if (n.nodeType === 1 && /^(P|DIV|H2|H3|H4|BLOCKQUOTE)$/.test((n as Element).tagName)) return n as HTMLElement;
      n = n.parentNode;
    }
    return null;
  };
  const b1 = blk(rg.startContainer);
  const b2 = blk(rg.endContainer);
  if (rg.collapsed || !b1 || b1 !== b2) return rtExec('formatBlock', tag);
  const cut = (sc: Node, so: number, ec: Node, eo: number) => {
    const x = document.createRange();
    x.setStart(sc, so);
    x.setEnd(ec, eo);
    return x.cloneContents();
  };
  const fB = cut(b1, 0, rg.startContainer, rg.startOffset);
  const fS = rg.cloneContents();
  const fA = cut(rg.endContainer, rg.endOffset, b1, b1.childNodes.length);
  const has = (fr: DocumentFragment) => {
    const d = document.createElement('div');
    d.appendChild(fr.cloneNode(true));
    return !!(d.textContent!.trim() || d.querySelector('img,table'));
  };
  const clone = (t: string, fr: DocumentFragment, keep: boolean) => {
    const e = document.createElement(t);
    if (keep) [...b1.attributes].forEach((a) => e.setAttribute(a.name, a.value));
    e.appendChild(fr);
    return e;
  };
  const bt = b1.tagName.toLowerCase();
  const parts: HTMLElement[] = [];
  if (has(fB)) parts.push(clone(bt, fB, true));
  const hEl = clone(tag, fS, tag === bt);
  if (b1.style.textAlign) hEl.style.textAlign = b1.style.textAlign;
  parts.push(hEl);
  if (has(fA)) parts.push(clone(bt, fA, true));
  b1.replaceWith(...parts);
  const nr = document.createRange();
  nr.selectNodeContents(hEl);
  s.removeAllRanges();
  s.addRange(nr);
  RT.range = nr.cloneRange();
  rtDone();
};

// ------------------------------------------------------------------ tables

const RT_TD = 'border:1px solid #CBD5E1;padding:6px 8px;min-width:60px;vertical-align:top';
const RT_TH = RT_TD + ';background:#F1F5F9;text-align:left;font-weight:600';
export const rtTable = (rows: number, cols: number) =>
  '<table style="border-collapse:collapse;width:100%;margin:8px 0"><tbody>' +
  Array.from({ length: rows }, (_, i) => '<tr>' + Array.from({ length: cols }, () => (i === 0 ? `<th style="${RT_TH}">Heading</th>` : `<td style="${RT_TD}">&nbsp;</td>`)).join('') + '</tr>').join('') +
  '</tbody></table><p><br></p>';

type Cell = HTMLTableCellElement;
type Grid = Cell[][];
const cellOf = (n: Node | null): Cell | null => {
  while (n && n !== RT.el) {
    if (n.nodeType === 1 && /^(TD|TH)$/.test((n as Element).tagName)) return n as Cell;
    n = n.parentNode;
  }
  return null;
};
const grid = (tb: HTMLTableElement): Grid => {
  const M: Grid = [];
  [...tb.rows].forEach((tr, r) => {
    let c = 0;
    [...tr.cells].forEach((td) => {
      while (M[r] && M[r][c]) c++;
      const rs = td.rowSpan || 1;
      const cs = td.colSpan || 1;
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) (M[r + i] = M[r + i] || [])[c + j] = td;
      c += cs;
    });
  });
  return M;
};
const pos = (M: Grid, td: Cell) => {
  for (let r = 0; r < M.length; r++) for (let c = 0; c < (M[r] || []).length; c++) if (M[r][c] === td) return { r, c, rs: td.rowSpan || 1, cs: td.colSpan || 1 };
  return { r: 0, c: 0, rs: 1, cs: 1 };
};
const colsOf = (M: Grid) => Math.max(0, ...M.map((row) => (row || []).length));
const newCell = (hdr: boolean) => {
  const e = document.createElement(hdr ? 'th' : 'td');
  e.setAttribute('style', hdr ? RT_TH : RT_TD);
  e.innerHTML = '<br>';
  return e;
};
const insertAt = (tr: HTMLTableRowElement, M: Grid, r: number, c: number, cell: HTMLElement) => {
  const next = [...tr.cells].find((x) => {
    const p = pos(M, x);
    return p.r === r && p.c >= c;
  });
  tr.insertBefore(cell, next || null);
};
const focusCell = (td: Element | undefined) => {
  if (!td) return;
  const rg = document.createRange();
  rg.selectNodeContents(td);
  rg.collapse(true);
  const s = window.getSelection()!;
  s.removeAllRanges();
  s.addRange(rg);
  RT.range = rg.cloneRange();
};
export const rtT = {
  ctx() {
    const rg = RT.range;
    if (!rtLive() || !rg) return null;
    const a = cellOf(rg.startContainer);
    const b = cellOf(rg.endContainer) || a;
    if (!a) return null;
    const tb = a.closest('table');
    if (!tb || !RT.el!.contains(tb) || (b && b.closest('table') !== tb)) return null;
    return { tb, a, b: b! };
  },
  rowAt(before: boolean) {
    const x = this.ctx();
    if (!x) return;
    const M = grid(x.tb);
    const p = pos(M, x.a);
    const R = before ? p.r : p.r + p.rs;
    const seen = new Set<Cell>();
    const tr = document.createElement('tr');
    for (let c = 0; c < colsOf(M); c++) {
      const up = R > 0 ? M[R - 1]?.[c] : null;
      const dn = M[R]?.[c];
      if (up && up === dn) {
        if (!seen.has(up)) {
          up.rowSpan = (up.rowSpan || 1) + 1;
          seen.add(up);
        }
        continue;
      }
      tr.appendChild(newCell(false));
    }
    const ref = x.tb.rows[R];
    (ref ? ref.parentNode! : x.tb.tBodies[0] || x.tb).insertBefore(tr, ref || null);
    focusCell(tr.cells[0]);
    rtDone();
  },
  colAt(before: boolean) {
    const x = this.ctx();
    if (!x) return;
    const M = grid(x.tb);
    const p = pos(M, x.a);
    const C = before ? p.c : p.c + p.cs;
    const seen = new Set<Cell>();
    [...x.tb.rows].forEach((tr, r) => {
      const lf = C > 0 ? M[r]?.[C - 1] : null;
      const rt = M[r]?.[C];
      if (lf && lf === rt) {
        if (!seen.has(lf)) {
          lf.colSpan = (lf.colSpan || 1) + 1;
          seen.add(lf);
        }
        return;
      }
      const ref = rt || lf;
      insertAt(tr, M, r, C, newCell(!!ref && ref.tagName === 'TH'));
    });
    rtDone();
  },
  delRow() {
    const x = this.ctx();
    if (!x) return;
    const M = grid(x.tb);
    const r = pos(M, x.a).r;
    const tr = x.tb.rows[r];
    const nxt = x.tb.rows[r + 1];
    const seen = new Set<Cell>();
    (M[r] || []).forEach((td) => {
      if (!td || seen.has(td)) return;
      seen.add(td);
      const q = pos(M, td);
      if (q.r < r) td.rowSpan = q.rs - 1;
      else if (q.rs > 1 && nxt) {
        td.rowSpan = q.rs - 1;
        insertAt(nxt, M, r + 1, q.c, td);
      }
    });
    tr.remove();
    if (!x.tb.rows.length) x.tb.remove();
    rtDone();
  },
  delCol() {
    const x = this.ctx();
    if (!x) return;
    const M = grid(x.tb);
    const c = pos(M, x.a).c;
    const seen = new Set<Cell>();
    M.forEach((row) => {
      const td = row?.[c];
      if (!td || seen.has(td)) return;
      seen.add(td);
      if ((td.colSpan || 1) > 1) td.colSpan -= 1;
      else td.remove();
    });
    [...x.tb.rows].forEach((tr) => !tr.cells.length && tr.remove());
    if (!x.tb.rows.length || !x.tb.querySelector('td,th')) x.tb.remove();
    rtDone();
  },
  merge(dir?: 'right' | 'down') {
    const x = this.ctx();
    if (!x) return;
    const M = grid(x.tb);
    const pa = pos(M, x.a);
    let pb = pos(M, x.b);
    if (dir === 'right') {
      const nb = M[pa.r]?.[pa.c + pa.cs];
      if (!nb) return;
      pb = pos(M, nb);
    }
    if (dir === 'down') {
      const nb = M[pa.r + pa.rs]?.[pa.c];
      if (!nb) return;
      pb = pos(M, nb);
    }
    let r0 = Math.min(pa.r, pb.r);
    let c0 = Math.min(pa.c, pb.c);
    let r1 = Math.max(pa.r + pa.rs, pb.r + pb.rs) - 1;
    let c1 = Math.max(pa.c + pa.cs, pb.c + pb.cs) - 1;
    let grow = true;
    while (grow) {
      grow = false;
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const td = M[r]?.[c];
          if (!td) continue;
          const q = pos(M, td);
          if (q.r < r0 || q.c < c0 || q.r + q.rs - 1 > r1 || q.c + q.cs - 1 > c1) {
            r0 = Math.min(r0, q.r);
            c0 = Math.min(c0, q.c);
            r1 = Math.max(r1, q.r + q.rs - 1);
            c1 = Math.max(c1, q.c + q.cs - 1);
            grow = true;
          }
        }
    }
    const tl = M[r0][c0];
    if (r0 === r1 && c0 === c1) return;
    const seen = new Set<Cell>([tl]);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const td = M[r]?.[c];
        if (!td || seen.has(td)) continue;
        seen.add(td);
        if (td.textContent!.trim() || td.querySelector('img')) {
          if (!tl.textContent!.trim() && !tl.querySelector('img')) tl.innerHTML = '';
          else tl.appendChild(document.createElement('br'));
          while (td.firstChild) tl.appendChild(td.firstChild);
        }
        td.remove();
      }
    tl.rowSpan = r1 - r0 + 1;
    tl.colSpan = c1 - c0 + 1;
    focusCell(tl);
    rtDone();
  },
  split() {
    const x = this.ctx();
    if (!x) return;
    const td = x.a;
    const p = pos(grid(x.tb), td);
    if (p.rs === 1 && p.cs === 1) return;
    td.rowSpan = 1;
    td.colSpan = 1;
    for (let i = 0; i < p.rs; i++) {
      const tr = x.tb.rows[p.r + i];
      if (!tr) continue;
      for (let j = 0; j < p.cs; j++) {
        if (i === 0 && j === 0) continue;
        insertAt(tr, grid(x.tb), p.r + i, p.c + j, newCell(td.tagName === 'TH'));
      }
    }
    rtDone();
  },
  header() {
    const x = this.ctx();
    if (!x) return;
    const tr = x.tb.rows[0];
    if (!tr) return;
    const toTh = [...tr.cells].some((c) => c.tagName !== 'TH');
    [...tr.cells].forEach((c) => {
      const n = document.createElement(toTh ? 'th' : 'td');
      [...c.attributes].forEach((a) => n.setAttribute(a.name, a.value));
      n.setAttribute('style', toTh ? RT_TH : RT_TD);
      while (c.firstChild) n.appendChild(c.firstChild);
      c.replaceWith(n);
    });
    rtDone();
  },
  fill(col: string) {
    const x = this.ctx();
    if (!x) return;
    const M = grid(x.tb);
    const pa = pos(M, x.a);
    const pb = pos(M, x.b);
    const seen = new Set<Cell>();
    for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r + pa.rs, pb.r + pb.rs) - 1; r++)
      for (let c = Math.min(pa.c, pb.c); c <= Math.max(pa.c + pa.cs, pb.c + pb.cs) - 1; c++) {
        const td = M[r]?.[c];
        if (td && !seen.has(td)) {
          seen.add(td);
          td.style.background = col === 'transparent' ? '' : col;
        }
      }
    rtDone();
  },
  del() {
    const x = this.ctx();
    if (!x) return;
    x.tb.remove();
    RT.range = null;
    rtDone();
  },
  tab(back: boolean) {
    const x = this.ctx();
    if (!x) return false;
    const cells = [...x.tb.querySelectorAll('td,th')];
    const nx = cells[cells.indexOf(x.a) + (back ? -1 : 1)];
    if (nx) {
      focusCell(nx);
      rtNotify();
      return true;
    }
    if (!back) {
      this.rowAt(false);
      return true;
    }
    return false;
  },
};

// ------------------------------------------------------------------ cleaning

const KEEP = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'BR', 'IMG', 'BLOCKQUOTE', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'CODE', 'PRE', 'SPAN', 'HR']);
const MAP: Record<string, string> = { H1: 'H2', H2: 'H3', H3: 'H4', H5: 'H4', H6: 'H4', STRIKE: 'S', DEL: 'S', INS: 'U' };
export const RT_BL = /^(P|H2|H3|H4|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|LI|TR|TD|TH)$/;
export const RT_TOPOK = /^(P|H2|H3|H4|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|IMG)$/;

/** Cleans pasted HTML (Word, Google Docs, web pages) down to document tags with simple styles. */
export const rtSanitize = (html: string, mapHeadings = true) => {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const unwrap = (c: Element) => c.replaceWith(...c.childNodes);
  const walk = (n: Node) => {
    [...n.childNodes].forEach((c0) => {
      let c = c0 as HTMLElement;
      if (c.nodeType === 8) return c.remove();
      if (c.nodeType !== 1) return;
      let t = c.tagName.toUpperCase();
      if (/^(STYLE|SCRIPT|META|LINK|TITLE|XML|HEAD|NOSCRIPT|TEMPLATE|IFRAME|OBJECT|EMBED|SVG|FORM|INPUT|BUTTON)$/.test(t)) return c.remove();
      walk(c);
      if (t.includes(':')) return unwrap(c);
      if (mapHeadings && MAP[t]) {
        const e = d.createElement(MAP[t]);
        [...c.attributes].forEach((a) => e.setAttribute(a.name, a.value));
        while (c.firstChild) e.appendChild(c.firstChild);
        c.replaceWith(e);
        c = e;
        t = e.tagName;
      }
      const st = c.style;
      if (t === 'B' && /normal|400/.test(st.fontWeight || '')) return unwrap(c);
      if (t === 'DIV' && ![...c.children].some((x) => RT_BL.test(x.tagName))) {
        const e = d.createElement('P');
        e.setAttribute('style', c.getAttribute('style') || '');
        while (c.firstChild) e.appendChild(c.firstChild);
        c.replaceWith(e);
        c = e;
        t = 'P';
      }
      if (!KEEP.has(t)) return unwrap(c);
      if (/^(SPAN|A|B|STRONG|I|EM|U|S|SUB|SUP|CODE)$/.test(t) && [...c.children].some((x) => RT_BL.test(x.tagName))) return unwrap(c);
      const keep: Record<string, string> = {};
      if (t === 'A' && c.getAttribute('href')) keep.href = c.getAttribute('href')!;
      if (t === 'IMG') keep.src = c.getAttribute('src') || '';
      if (t === 'TD' || t === 'TH') {
        const td = c as HTMLTableCellElement;
        if (td.colSpan > 1) keep.colspan = String(td.colSpan);
        if (td.rowSpan > 1) keep.rowspan = String(td.rowSpan);
      }
      if (t === 'OL' && c.getAttribute('start')) keep.start = c.getAttribute('start')!;
      const css: string[] = [];
      const col = st.color;
      const bg = st.backgroundColor;
      const dec = st.textDecorationLine || st.textDecoration || '';
      const sz = st.fontSize || '';
      const ta = st.textAlign;
      const ff = st.fontFamily;
      if (col && !/^(windowtext|black|rgb\(0, 0, 0\)|#000(000)?|inherit|initial)$/i.test(col)) css.push('color:' + col);
      if (t === 'SPAN') {
        if (bg && !/transparent|rgba\(0, 0, 0, 0\)|^white$|#fff(fff)?|rgb\(255, 255, 255\)/i.test(bg)) css.push('background-color:' + bg);
        if (/bold|[6-9]00/.test(st.fontWeight || '')) css.push('font-weight:700');
        if (st.fontStyle === 'italic') css.push('font-style:italic');
        if (/underline|line-through/.test(dec)) css.push('text-decoration:' + (dec.includes('underline') ? 'underline' : 'line-through'));
        if (/^\d+(\.\d+)?(pt|px)$/.test(sz)) {
          const v = Math.round(parseFloat(sz) * (sz.endsWith('px') ? 0.75 : 1) * 2) / 2;
          if (v >= 7 && v <= 72) css.push('font-size:' + v + 'pt');
        }
        if (ff && !/inherit/.test(ff) && ff.length < 80 && !/[<>;]/.test(ff)) css.push('font-family:' + ff);
      }
      if (ta && /center|right|justify/.test(ta) && t !== 'SPAN') css.push('text-align:' + ta);
      const tdBg = (t === 'TD' || t === 'TH') && st.background && /^(#[0-9a-f]{3,6}|rgb\([\d, ]+\))$/i.test(st.backgroundColor || '') ? ';background:' + st.backgroundColor : '';
      const imgW = t === 'IMG' && /^\d+%$/.test(st.width || '') ? ';width:' + st.width : '';
      [...c.attributes].forEach((a) => c.removeAttribute(a.name));
      Object.entries(keep).forEach(([k, v]) => c.setAttribute(k, v));
      if (t === 'TABLE') c.setAttribute('style', 'border-collapse:collapse;width:100%;margin:8px 0');
      else if (t === 'TD') c.setAttribute('style', RT_TD + tdBg + (css.length ? ';' + css.join(';') : ''));
      else if (t === 'TH') c.setAttribute('style', RT_TH + tdBg);
      else if (t === 'IMG') {
        if (!/^(data:image\/(png|jpe?g|gif|webp);base64,|https:)/.test(keep.src)) return c.remove();
        c.setAttribute('style', 'display:block;max-width:100%;height:auto;border-radius:6px;margin:8px 0' + imgW);
      } else if (t === 'A') {
        if (!/^(https?:|mailto:|#)/i.test(keep.href || '')) return unwrap(c);
        c.setAttribute('target', '_blank');
        c.setAttribute('rel', 'noopener noreferrer');
      } else if (css.length) c.setAttribute('style', css.join(';'));
      if (t === 'SPAN' && !c.getAttribute('style')) unwrap(c);
    });
  };
  walk(d.body);
  const out = d.createElement('div');
  let run: HTMLElement | null = null;
  let blank = 0;
  [...d.body.childNodes].forEach((n) => {
    if (n.nodeType === 1 && RT_TOPOK.test((n as Element).tagName)) {
      run = null;
      const e = n as HTMLElement;
      if (e.tagName === 'P' && !e.textContent!.trim() && !e.querySelector('img')) {
        if (blank++) return;
        e.innerHTML = '<br>';
      } else blank = 0;
      out.appendChild(e);
      return;
    }
    if (n.nodeType === 3 && !n.textContent!.trim() && !run) return;
    if (n.nodeType === 1 && (n as Element).tagName === 'BR' && !run) return;
    if (!run) {
      run = d.createElement('p');
      out.appendChild(run);
      blank = 0;
    }
    run.appendChild(n);
  });
  return out.innerHTML;
};

/** Safe HTML for showing stored policy text (the server cleans it too). */
export const rtSafe = (html: string) => rtSanitize(html || '', false);

const needsFix = (html: string) => {
  if (!html) return false;
  const t = document.createElement('div');
  t.innerHTML = html;
  return [...t.children].some((c) => !RT_TOPOK.test(c.tagName) || c.querySelector('div,section,article,h1,h5,h6')) || [...t.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
};
export const rtFixDoc = (html: string) => (needsFix(html) ? rtSanitize(html, false) : html);

// ------------------------------------------------------------------ fonts and sizes

export const RT_COLORS = ['#000000', '#434343', '#666666', '#999999', '#CCCCCC', '#FFFFFF', '#1F4FE0', '#0E7490', '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0', '#B45309', '#15803D', '#6D28D9', '#DB2777', '#475569', '#111827'];
export const RT_FONTS: [string, string][] = [
  ['Default', 'inherit'],
  ['Arial', 'Arial, Helvetica, sans-serif'],
  ['Calibri', 'Calibri, Carlito, sans-serif'],
  ['Georgia', 'Georgia, serif'],
  ['Times New Roman', "'Times New Roman', Times, serif"],
  ['Verdana', 'Verdana, Geneva, sans-serif'],
  ['Trebuchet MS', "'Trebuchet MS', sans-serif"],
  ['Garamond', "Garamond, 'EB Garamond', serif"],
  ['Courier New', "'Courier New', Courier, monospace"],
];
export const RT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
export const rtSize = (pt: number) => {
  if (!rtRestore() || !pt) return;
  try {
    document.execCommand('styleWithCSS', false, 'true');
  } catch {
    /* not supported */
  }
  document.execCommand('fontSize', false, '7');
  RT.el!.querySelectorAll<HTMLElement>('span[style*="xxx-large"], font[size="7"]').forEach((n) => {
    if (n.tagName === 'FONT') {
      const s = document.createElement('span');
      s.style.fontSize = pt + 'pt';
      while (n.firstChild) s.appendChild(n.firstChild);
      n.replaceWith(s);
    } else n.style.fontSize = pt + 'pt';
  });
  saveRange();
  rtDone();
};
export const rtCur = () => {
  const rg = RT.range;
  if (!rtLive() || !rg) return null;
  let n: Node | null = rg.startContainer;
  if (n.nodeType === 3) n = n.parentElement;
  if (!n || !RT.el!.contains(n)) n = RT.el;
  const cs = getComputedStyle(n as Element);
  const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const hit = RT_FONTS.find((x) => x[0] !== 'Default' && x[1].split(',')[0].replace(/["']/g, '').trim() === fam);
  return { pt: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2, fam: hit ? hit[0] : 'Default' };
};

/** Strips the temporary page-break spacing the paged view adds before saving. */
export const rtClean = (el: HTMLElement) => {
  if (!el.querySelector('[data-pgpush]')) return el.innerHTML;
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll<HTMLElement>('[data-pgpush]').forEach((n) => {
    const o = n.getAttribute('data-pgm');
    if (o) n.style.marginTop = o;
    else n.style.removeProperty('margin-top');
    n.removeAttribute('data-pgpush');
    n.removeAttribute('data-pgm');
    if (!n.getAttribute('style')) n.removeAttribute('style');
  });
  return c.innerHTML;
};
