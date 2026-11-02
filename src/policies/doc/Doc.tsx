import { Component, createRef, type CSSProperties, type ReactNode } from 'react';
import { RT, RT_BL, RT_COLORS, RT_FONTS, RT_SIZES, RT_TOPOK, rtClean, rtCode, rtCur, rtEsc, rtExec, rtFixDoc, rtHeading, rtInsertImg, rtLive, rtNorm, rtNotify, rtSafe, rtSanitize, rtSize, rtT, rtTable } from './rt';
import type { Page } from './model';

// ================================================================== editable area

type EdProps = { value: string; onChange?: (h: string) => void; variant: 'page' | 'hf'; placeholder?: string; minH?: number; elRef?: (el: HTMLDivElement | null) => void };

export class RichEditor extends Component<EdProps, { empty: boolean }> {
  ref = createRef<HTMLDivElement>();
  last = '';
  state = { empty: !this.props.value };
  componentDidMount() {
    this.last = this.props.value || '';
    const el = this.ref.current!;
    const fixed = this.props.variant === 'page' ? rtFixDoc(this.last) : this.last;
    el.innerHTML = fixed;
    if (this.props.variant === 'page') rtNorm(el);
    if (fixed !== this.last) setTimeout(() => this.emit(), 0);
    this.props.elRef?.(el);
  }
  componentDidUpdate() {
    const el = this.ref.current;
    const v = this.props.value || '';
    if (el && v !== this.last && document.activeElement !== el) {
      el.innerHTML = this.props.variant === 'page' ? rtFixDoc(v) : v;
      if (this.props.variant === 'page') rtNorm(el);
      this.last = v;
      if (this.state.empty !== !v) this.setState({ empty: !v });
    }
  }
  componentWillUnmount() {
    if (RT.el === this.ref.current) {
      RT.el = null;
      RT.img = null;
      rtNotify();
    }
    this.props.elRef?.(null);
  }
  emit = () => {
    const el = this.ref.current;
    if (!el) return;
    if (this.props.variant === 'page') rtNorm(el);
    let h = rtClean(el);
    if (h === '<br>') h = '';
    this.last = h;
    const empty = !el.textContent!.trim() && !el.querySelector('img,table,hr');
    if (empty !== this.state.empty) this.setState({ empty });
    this.props.onChange?.(h);
  };
  bind = () => {
    RT.el = this.ref.current;
    RT.emit = this.emit;
  };
  files = (list: FileList | null, e: { preventDefault: () => void }) => {
    const fs = [...(list || [])].filter((x) => /^image\//.test(x.type));
    if (!fs.length || this.props.variant === 'hf') return false;
    e.preventDefault();
    this.bind();
    fs.forEach(rtInsertImg);
    return true;
  };
  paste = (e: React.ClipboardEvent) => {
    const cd = e.clipboardData;
    if (!cd || this.files(cd.files, e)) return;
    e.preventDefault();
    this.bind();
    const sel = window.getSelection();
    if (sel && sel.rangeCount) RT.range = sel.getRangeAt(0).cloneRange();
    const html = cd.getData('text/html');
    const txt = cd.getData('text/plain') || '';
    if (this.props.variant === 'hf') {
      document.execCommand('insertText', false, txt.replace(/\s+/g, ' ').trim());
      return;
    }
    const clean = html
      ? rtSanitize(html)
      : txt
          .split(/\r?\n/)
          .map((l) => (l.trim() ? `<p>${rtEsc(l)}</p>` : ''))
          .join('');
    if (clean) document.execCommand('insertHTML', false, clean);
    this.emit();
    rtNotify();
  };
  render() {
    const V = this.props.variant;
    const ph: CSSProperties =
      V === 'page' ? { position: 'absolute', left: 0, top: 0, fontSize: 14.5, lineHeight: 1.55, color: '#9CA3AF', pointerEvents: 'none' } : { position: 'absolute', left: 5, top: 3, fontSize: 11.5, lineHeight: 1.5, color: '#9CA3AF', pointerEvents: 'none' };
    return (
      <div style={{ position: 'relative' }}>
        {this.state.empty && <span style={ph}>{this.props.placeholder || (V === 'page' ? 'Write the policy… paste or drop images here' : '')}</span>}
        <div
          ref={this.ref}
          className={V === 'page' ? 'rt-doc rt-edit' : 'rt-hf rt-edit'}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          role="textbox"
          aria-multiline={V === 'page'}
          aria-label={V === 'page' ? 'Policy text' : this.props.placeholder}
          onInput={this.emit}
          onFocus={() => {
            this.bind();
            try {
              document.execCommand('defaultParagraphSeparator', false, 'p');
            } catch {
              /* not supported */
            }
            rtNotify();
          }}
          onClick={(e) => {
            this.bind();
            RT.img = (e.target as HTMLElement).tagName === 'IMG' ? (e.target as HTMLImageElement) : null;
            rtNotify();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              const s = window.getSelection();
              if (s && s.rangeCount) RT.range = s.getRangeAt(0).cloneRange();
              this.bind();
              if (rtT.tab(e.shiftKey)) e.preventDefault();
            }
          }}
          onPaste={this.paste}
          onDrop={(e) => {
            if ([...e.dataTransfer.files].some((x) => /^image\//.test(x.type))) {
              const d = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
              const rg = d.caretRangeFromPoint?.(e.clientX, e.clientY);
              if (rg) RT.range = rg;
              this.files(e.dataTransfer.files, e);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          style={V === 'page' ? { minHeight: this.props.minH || 600 } : undefined}
        />
      </div>
    );
  }
}

// ================================================================== paged view

const PAGE_M = { Narrow: 48, Normal: 96, Wide: 144 } as const;
const PAGE_SIZES = { A5: [559, 794], A4: [794, 1123], A3: [1123, 1587], Letter: [816, 1056], Legal: [816, 1344] } as const;
export const LOGO_SVG =
  '<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 40" fill="none"><path d="M39.9386 4.29229L4.36147 39.2653C3.86301 39.7553 3.20879 40.0003 2.55457 40.0003C1.90035 40.0003 1.24613 39.7553 0.74768 39.2653C-0.249227 38.2853 -0.249227 36.6928 0.74768 35.7129L36.3248 0.739867C37.3217 -0.240112 38.9417 -0.240112 39.9386 0.739867C40.9355 1.71985 40.9355 3.31231 39.9386 4.29229Z" fill="#3CBDFF"/><path d="M27.0869 0.734984C26.09 -0.244995 24.47 -0.244995 23.4731 0.734984L14.2898 9.76236V2.51119C14.2898 1.12289 13.1441 8.11268e-08 11.7352 8.11268e-08C10.3264 8.11268e-08 9.18066 1.12629 9.18066 2.51119V21.893L27.0904 4.28741C28.0873 3.30743 28.0873 1.71496 27.0904 0.734984H27.0869Z" fill="#00FFA7"/><path d="M0.00834371 30.9491L5.1348 25.9097L5.12095 18.8184V2.51608C5.12095 1.12778 3.9752 0.00488281 2.56638 0.00488281C1.14717 0.00488281 0.00488281 1.13118 0.00488281 2.51608V23.1161C0.00488281 23.1671 0.00834445 23.2181 0.0118059 23.2658V30.9491H0.00834371Z" fill="#FFD119"/><path d="M36.3248 13.1822L13.4098 35.7082C12.4129 36.6881 12.4129 38.2806 13.4098 39.2606C13.9082 39.7506 14.5625 39.9956 15.2167 39.9956C15.8709 39.9956 16.5251 39.7506 17.0236 39.2606L39.9386 16.7347C40.9355 15.7547 40.9355 14.1622 39.9386 13.1822C38.9417 12.2023 37.3217 12.2023 36.3248 13.1822Z" fill="#3A7CED"/><path d="M36.3259 25.505L25.9449 35.7097C24.948 36.6897 24.948 38.2822 25.9449 39.2621C26.4434 39.7521 27.0976 39.9971 27.7518 39.9971C28.4061 39.9971 29.0603 39.7521 29.5587 39.2621L39.9397 29.0574C40.9366 28.0774 40.9366 26.485 39.9397 25.505C38.9428 24.525 37.3228 24.525 36.3259 25.505Z" fill="#861FAC"/></svg>';

type PageProps = {
  page: Page;
  body: string;
  onBody?: (h: string) => void;
  header: string;
  onHeader?: (h: string) => void;
  footer: string;
  onFooter?: (h: string) => void;
  headerRight?: string;
  footerLabel?: string;
  readOnly?: boolean;
  placeholder?: string;
};

/** The policy laid out on paper: letterhead, header and footer on every page, watermark, page breaks and zoom. */
export class PolicyPage extends Component<PageProps, { n: number; dw: number; zoom: string }> {
  state = { n: 1, dw: 0, zoom: 'Fit' };
  bodyEl: HTMLDivElement | null = null;
  ro: ResizeObserver | null = null;
  scale = 1;
  geo() {
    const pg = this.props.page;
    const m = PAGE_M[pg.margin] || 96;
    const sz = PAGE_SIZES[pg.size] || PAGE_SIZES.A4;
    const land = pg.orient === 'Landscape';
    const W = land ? sz[1] : sz[0];
    const H = land ? sz[0] : sz[1];
    const zh = Math.max(64, Math.round(m * 0.8));
    const G = 28;
    const ch = H - 2 * zh - 48;
    const gapC = H - ch + G;
    return { m, W, H, zh, G, ch, gapC, step: ch + gapC };
  }
  setBody = (el: HTMLDivElement | null) => {
    if (this.bodyEl === el) return;
    this.bodyEl?.removeEventListener('load', this.paginate, true);
    this.bodyEl = el;
    if (el) {
      el.addEventListener('load', this.paginate, true);
      this.paginate();
    }
  };
  setDesk = (el: HTMLDivElement | null) => {
    this.ro?.disconnect();
    this.ro = null;
    if (el && window.ResizeObserver) {
      this.ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (Math.abs(w - this.state.dw) > 2) this.setState({ dw: w });
      });
      this.ro.observe(el);
    }
  };
  componentDidMount() {
    this.paginate();
  }
  componentDidUpdate() {
    this.paginate();
  }
  componentWillUnmount() {
    this.ro?.disconnect();
    this.bodyEl?.removeEventListener('load', this.paginate, true);
  }
  /** Keeps every block off the page gaps: pushes it to the next page, or splits long paragraphs, lists and tables across pages. */
  paginate = () => {
    const el = this.bodyEl;
    if (!el || !el.isConnected) return;
    const g = this.geo();
    el.querySelectorAll<HTMLElement>('[data-pgpush]').forEach((n) => {
      n.style.marginTop = n.getAttribute('data-pgm') || '';
      n.removeAttribute('data-pgpush');
      n.removeAttribute('data-pgm');
    });
    if (this.flatten(el) && !this.props.readOnly && this.props.onBody) setTimeout(() => this.bodyEl && this.props.onBody?.(rtClean(this.bodyEl)), 0);
    const s = this.scale || 1;
    const er = el.getBoundingClientRect();
    const relBot = (n: Node) => {
      let rc: DOMRect;
      if (n.nodeType === 1) rc = (n as Element).getBoundingClientRect();
      else {
        const rg = document.createRange();
        rg.selectNodeContents(n);
        rc = rg.getBoundingClientRect();
      }
      return rc && (rc.height || rc.width) ? { top: (rc.top - er.top) / s, bot: (rc.bottom - er.top) / s } : null;
    };
    const splitKids = (b: HTMLElement, end: number) => {
      const nodes = [...b.childNodes];
      let i = -1;
      let cut: Node | null = null;
      for (let j = 0; j < nodes.length; j++) {
        const m = relBot(nodes[j]);
        if (!m) continue;
        if (m.bot > end + 1) {
          i = j;
          if (nodes[j].nodeType === 3 && m.top < end) {
            const t = nodes[j] as Text;
            const L = t.length;
            let lo = 0;
            let hi = L;
            while (lo < hi) {
              const mid = (lo + hi + 1) >> 1;
              const rg = document.createRange();
              rg.setStart(t, 0);
              rg.setEnd(t, mid);
              const rc = rg.getBoundingClientRect();
              if ((rc.bottom - er.top) / s <= end + 1) lo = mid;
              else hi = mid - 1;
            }
            let off = lo;
            const sp = t.data.lastIndexOf(' ', off);
            if (sp > 0) off = sp + 1;
            if (off > 0 && off < L) cut = t.splitText(off);
          }
          break;
        }
      }
      if (i < 0) return false;
      let move: Node[];
      if (cut) move = [cut, ...nodes.slice(i + 1)];
      else {
        if (i === 0) return false;
        move = nodes.slice(i);
      }
      const nb = b.cloneNode(false) as HTMLElement;
      nb.removeAttribute('data-pgpush');
      nb.removeAttribute('data-pgm');
      nb.style.marginTop = '';
      move.forEach((n) => nb.appendChild(n));
      while (nb.firstChild && nb.firstChild.nodeName === 'BR') nb.firstChild.remove();
      if (!nb.childNodes.length) return false;
      b.after(nb);
      return true;
    };
    const push = (b: HTMLElement, k: number) => {
      const target = (k + 1) * g.step;
      const top = b.offsetTop;
      const cm = parseFloat(getComputedStyle(b).marginTop) || 0;
      b.setAttribute('data-pgm', b.style.marginTop || '');
      b.setAttribute('data-pgpush', '1');
      b.style.marginTop = cm + target - top + 'px';
      const dd = target - b.offsetTop;
      if (dd) b.style.marginTop = parseFloat(b.style.marginTop) + dd + 'px';
    };
    const splitAt = (b: HTMLElement, end: number) => {
      const tbl = b.tagName === 'TABLE';
      const items = tbl ? [...(b as HTMLTableElement).rows] : ([...b.children] as HTMLElement[]);
      if (items.length < 2) return false;
      const base = b.offsetTop;
      const i = items.findIndex((it) => (it.offsetParent === b ? base + it.offsetTop : it.offsetTop) + it.offsetHeight > end - 4);
      if (i <= 0) return false;
      const nb = b.cloneNode(false) as HTMLElement;
      nb.removeAttribute('data-pgpush');
      nb.removeAttribute('data-pgm');
      nb.style.marginTop = '';
      if (tbl) {
        const tb = document.createElement('tbody');
        nb.appendChild(tb);
        items.slice(i).forEach((it) => tb.appendChild(it));
      } else {
        items.slice(i).forEach((it) => nb.appendChild(it));
        if (b.tagName === 'OL') nb.setAttribute('start', String((parseInt(b.getAttribute('start') || '1', 10) || 1) + i));
      }
      b.after(nb);
      return true;
    };
    let b = el.firstElementChild as HTMLElement | null;
    let guard = 0;
    while (b && guard++ < 3000) {
      const top = b.offsetTop;
      const hh = b.offsetHeight;
      if (hh) {
        const k = Math.floor(top / g.step);
        const end = k * g.step + g.ch;
        const splittable = /^(TABLE|UL|OL)$/.test(b.tagName);
        const blk = b;
        const fitsAfterPush = () => {
          const k2 = Math.floor(blk.offsetTop / g.step);
          const e2 = k2 * g.step + g.ch;
          if (blk.offsetTop + blk.offsetHeight > e2 + 1) {
            if (splittable) splitAt(blk, e2);
            else splitKids(blk, e2);
          }
        };
        if (top > end) {
          push(b, k);
          fitsAfterPush();
        } else if (top + hh > end + 1) {
          if (!splittable) {
            if (hh <= g.ch * 0.5 || !splitKids(b, end)) {
              push(b, k);
              fitsAfterPush();
            }
          } else if (!splitAt(b, end)) {
            push(b, k);
            fitsAfterPush();
          }
        }
      }
      b = b.nextElementSibling as HTMLElement | null;
    }
    const last = el.lastElementChild as HTMLElement | null;
    const bottom = last ? last.offsetTop + last.offsetHeight : 0;
    const n = Math.max(1, Math.floor(Math.max(0, bottom - 1) / g.step) + 1);
    if (n !== this.state.n) this.setState({ n });
  };
  flatten(el: HTMLElement) {
    let changed = false;
    let guard = 0;
    let again = true;
    while (again && guard++ < 40) {
      again = false;
      for (const n of [...el.childNodes]) {
        if (n.nodeType === 3) {
          if (n.textContent!.trim()) {
            const p = document.createElement('p');
            n.replaceWith(p);
            p.appendChild(n);
            changed = again = true;
          }
          continue;
        }
        if (n.nodeType !== 1) {
          n.remove();
          continue;
        }
        const e = n as HTMLElement;
        const hasBlock = [...e.children].some((x) => RT_BL.test(x.tagName));
        if (RT_TOPOK.test(e.tagName) && !(hasBlock && /^(P|H2|H3|H4|BLOCKQUOTE|PRE)$/.test(e.tagName))) continue;
        if (hasBlock) e.replaceWith(...e.childNodes);
        else {
          const p = document.createElement('p');
          e.replaceWith(p);
          p.appendChild(e);
        }
        changed = again = true;
      }
    }
    return changed;
  }
  render() {
    const p = this.props;
    const g = this.geo();
    const ro = !!p.readOnly;
    const n = this.state.n;
    const T = n * g.H + (n - 1) * g.G;
    const pg = p.page;
    const fit = this.state.dw ? Math.min(1, (this.state.dw - 48) / g.W) : 1;
    const Z: Record<string, number> = { Fit: fit, '50%': 0.5, '75%': 0.75, '100%': 1 };
    const s = Math.max(0.3, Z[this.state.zoom] || fit);
    this.scale = s;
    const mirror = (html: string) => <div className="rt-hf" dangerouslySetInnerHTML={{ __html: rtSafe(html) }} />;
    const zone = (html: string, onCh: ((h: string) => void) | undefined, ph: string, k: number) => (ro || k > 0 || !onCh ? mirror(html) : <RichEditor variant="hf" value={html} onChange={onCh} placeholder={ph} />);
    const wmS = Math.round(Math.min(g.W, g.H) * 0.58);
    const pages: ReactNode[] = Array.from({ length: n }, (_, k) => (
      <div key={'pg' + k} className="rt-sheet" style={{ top: k * (g.H + g.G), width: g.W, height: g.H }}>
        {pg.wm && <span className="rt-wm" style={{ width: wmS, height: wmS, marginLeft: -wmS / 2, marginTop: -wmS / 2 }} dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />}
        <div className="rt-head" style={{ left: g.m, right: g.m, height: g.zh, zIndex: k === 0 ? 3 : 0 }}>
          {pg.logo && (
            <span className="rt-brand">
              <span dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
              <b>ivoyant</b>
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>{zone(p.header, p.onHeader, 'Header — type here', k)}</div>
          {p.headerRight && <span className="rt-meta">{p.headerRight}</span>}
        </div>
        <div className="rt-foot" style={{ left: g.m, right: g.m, height: g.zh, zIndex: k === 0 ? 3 : 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{zone(p.footer, p.onFooter, 'Footer', k)}</div>
          <span className="rt-meta">{(p.footerLabel ? p.footerLabel + ' · ' : '') + `Page ${k + 1} of ${n}`}</span>
        </div>
      </div>
    ));
    return (
      <div ref={this.setDesk} className="rt-desk">
        <div className="rt-zoom">
          <span>
            {pg.size} · {pg.orient} · {n} {n > 1 ? 'pages' : 'page'}
          </span>
          <small>Zoom</small>
          {['Fit', '50%', '75%', '100%'].map((k) => (
            <button key={k} type="button" aria-pressed={this.state.zoom === k} onMouseDown={(e) => e.preventDefault()} onClick={() => this.setState({ zoom: k })}>
              {k}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', width: g.W * s, height: T * s, margin: '0 auto' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: g.W, height: T, transform: `scale(${s})`, transformOrigin: '0 0' }}>
            {pages}
            <div style={{ position: 'absolute', left: g.m, top: g.zh + 24, width: g.W - 2 * g.m, zIndex: 1 }}>
              {ro ? (
                <div ref={this.setBody} className="rt-doc" dangerouslySetInnerHTML={{ __html: rtSafe(p.body) }} />
              ) : (
                <RichEditor variant="page" value={p.body} onChange={p.onBody} placeholder={p.placeholder} minH={n * g.step - g.gapC} elRef={this.setBody} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// ================================================================== toolbar

const RT_I: Record<string, string[]> = {
  undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
  redo: ['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7'],
  bold: ['M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'],
  italic: ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'],
  underline: ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'],
  strike: ['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6', 'M4 12h16'],
  color: ['M4 20h16', 'm6 16 6-12 6 12', 'M8 12h8'],
  hilite: ['m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
  left: ['M21 6H3', 'M15 12H3', 'M17 18H3'],
  center: ['M21 6H3', 'M17 12H7', 'M19 18H5'],
  right: ['M21 6H3', 'M21 12H9', 'M21 18H7'],
  justify: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  ul: ['M3 12h.01', 'M3 18h.01', 'M3 6h.01', 'M8 12h13', 'M8 18h13', 'M8 6h13'],
  ol: ['M10 12h11', 'M10 18h11', 'M10 6h11', 'M4 10h2', 'M4 6h1v4', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'],
  indent: ['M21 12H11', 'M21 18H11', 'M21 6H11', 'm3 8 4 4-4 4'],
  outdent: ['M21 12H11', 'M21 18H11', 'M21 6H11', 'm7 8-4 4 4 4'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M9 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'],
  table: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M3 9h18', 'M3 15h18', 'M9 3v18', 'M15 3v18'],
  hr: ['M5 12h14'],
  minus: ['M5 12h14'],
  plus: ['M5 12h14', 'M12 5v14'],
  code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  quote: [
    'M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03V20c0 1 0 1 1 1z',
    'M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z',
  ],
  clear: ['M4 7V4h16v3', 'M5 20h6', 'M13 4 8 20', 'm15 15 5 5', 'm20 15-5 5'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  chev: ['m6 9 6 6 6-6'],
};
const icon = (n: string) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(RT_I[n] || []).map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);
const keepSel = (e: React.MouseEvent) => e.preventDefault();

type TbState = { pop: string | null; url: string; rows: number; cols: number; sizeTxt: string | null; hex: Record<string, string | null> };

export class RichToolbar extends Component<object, TbState> {
  state: TbState = { pop: null, url: '', rows: 3, cols: 3, sizeTxt: null, hex: {} };
  fileRef = createRef<HTMLInputElement>();
  sub = () => this.forceUpdate();
  sel = () => {
    const s = window.getSelection();
    if (rtLive() && s && s.rangeCount && RT.el!.contains(s.anchorNode)) {
      RT.range = s.getRangeAt(0).cloneRange();
      this.forceUpdate();
    }
  };
  componentDidMount() {
    RT.subs.add(this.sub);
    document.addEventListener('selectionchange', this.sel);
  }
  componentWillUnmount() {
    RT.subs.delete(this.sub);
    document.removeEventListener('selectionchange', this.sel);
  }
  tog = (k: string) => () => this.setState((s) => ({ pop: s.pop === k ? null : k }));
  applyLink() {
    let u = this.state.url.trim();
    if (!u) return;
    if (!/^(https?:|mailto:|#)/i.test(u)) u = 'https://' + u;
    rtExec('createLink', u);
    if (rtLive())
      RT.el!.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
        if (a.getAttribute('href') === u) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
      });
    RT.emit?.();
    this.setState({ pop: null, url: '' });
  }
  colorPop(cmd: 'foreColor' | 'hiliteColor', list: string[], title: string) {
    const val = cmd === 'foreColor' ? '#1F4FE0' : '#FFF59D';
    const hx = this.state.hex[cmd];
    const apply = (c: string) => {
      this.setState({ pop: null, hex: { ...this.state.hex, [cmd]: null } });
      rtExec(cmd, c);
    };
    const typed = () => {
      let v = (hx ?? val).trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) apply(v);
    };
    return (
      <div className="rt-colors">
        <span>{title}</span>
        <div className="rt-swatches">
          {list.map((c) => (
            <button key={c} type="button" title={c === 'transparent' ? 'None' : c} onMouseDown={keepSel} onClick={() => apply(c)} style={{ background: c === 'transparent' ? 'linear-gradient(135deg, transparent 45%, #EF4444 45%, #EF4444 55%, transparent 55%)' : c }} />
          ))}
        </div>
        <div className="rt-hex">
          <input type="color" defaultValue={val} title="Pick any colour" onChange={(e) => apply(e.target.value)} />
          <input value={hx ?? val.toUpperCase()} placeholder="#RRGGBB" onChange={(e) => this.setState({ hex: { ...this.state.hex, [cmd]: e.target.value } })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), typed())} />
          <button type="button" onMouseDown={keepSel} onClick={typed}>
            Apply
          </button>
        </div>
      </div>
    );
  }
  render() {
    const live = rtLive();
    const inEd = live && document.activeElement === RT.el;
    const q = (c: string) => {
      try {
        return inEd && document.queryCommandState(c);
      } catch {
        return false;
      }
    };
    let blk = '';
    try {
      blk = inEd ? String(document.queryCommandValue('formatBlock') || '').toLowerCase() : '';
    } catch {
      /* not supported */
    }
    const B = (k: string, title: string, ic: string, on: boolean, act: () => void) => (
      <button key={k} type="button" className={`rt-b${on ? ' on' : ''}`} disabled={!live} title={title} aria-label={title} aria-pressed={on} onMouseDown={keepSel} onClick={act}>
        {icon(ic)}
      </button>
    );
    const TB = (k: string, title: string, label: string, on: boolean, act: () => void) => (
      <button key={k} type="button" className={`rt-b txt${on ? ' on' : ''}`} disabled={!live} title={title} aria-pressed={on} onMouseDown={keepSel} onClick={act}>
        {label}
      </button>
    );
    const Div = () => <span className="rt-div" />;
    const pop = (k: string, child: ReactNode) =>
      this.state.pop === k ? (
        <div className="rt-pop" onMouseDown={(e) => (e.target as HTMLElement).tagName !== 'INPUT' && e.preventDefault()}>
          {child}
        </div>
      ) : null;
    const cur = rtCur() || { pt: 11, fam: 'Default' };
    const stepSize = (dir: number) => {
      const p = cur.pt;
      const nx = dir > 0 ? RT_SIZES.find((x) => x > p) : [...RT_SIZES].reverse().find((x) => x < p);
      if (nx) rtSize(nx);
    };
    const img = RT.img && RT.el && RT.el.contains(RT.img) ? RT.img : null;
    const setW = (w: string) => {
      if (!img) return;
      img.style.width = w;
      RT.emit?.();
      this.forceUpdate();
    };
    const tc = rtT.ctx();
    const multi = !!(tc && tc.b && tc.b !== tc.a);
    const blockBtn = (tag: string, label: string, title: string) => TB('b-' + tag, title, label, blk === tag || (tag === 'p' && (blk === 'p' || blk === 'div') && inEd), () => rtHeading(tag));
    return (
      <div className="rt-toolbar" role="toolbar" aria-label="Formatting">
        <div className="rt-row">
          {B('undo', 'Undo', 'undo', false, () => rtExec('undo'))}
          {B('redo', 'Redo', 'redo', false, () => rtExec('redo'))}
          <Div />
          <span className="rt-rel">
            <button type="button" className={`rt-drop${this.state.pop === 'font' ? ' on' : ''}`} disabled={!live} title="Font" onMouseDown={keepSel} onClick={this.tog('font')}>
              <span>{cur.fam}</span>
              {icon('chev')}
            </button>
            {pop(
              'font',
              <div className="rt-list">
                {RT_FONTS.map(([nm, stack]) => (
                  <button key={nm} type="button" className={cur.fam === nm ? 'on' : ''} style={{ fontFamily: stack }} onMouseDown={keepSel} onClick={() => (rtExec('fontName', stack), this.setState({ pop: null }))}>
                    {nm}
                  </button>
                ))}
              </div>,
            )}
          </span>
          <span className="rt-rel rt-size">
            {B('fsm', 'Decrease font size', 'minus', false, () => stepSize(-1))}
            <input
              value={this.state.sizeTxt ?? String(cur.pt)}
              title="Font size (pt)"
              aria-label="Font size"
              disabled={!live}
              onFocus={(e) => (this.setState({ sizeTxt: String(cur.pt), pop: 'size' }), e.target.select())}
              onChange={(e) => this.setState({ sizeTxt: e.target.value.replace(/[^0-9.]/g, '') })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = Math.min(400, Math.max(1, parseFloat(this.state.sizeTxt || '11')));
                  this.setState({ sizeTxt: null, pop: null });
                  rtSize(v);
                }
                if (e.key === 'Escape') this.setState({ sizeTxt: null, pop: null });
              }}
              onBlur={() => setTimeout(() => this.setState((s) => ({ sizeTxt: null, pop: s.pop === 'size' ? null : s.pop })), 150)}
            />
            {B('fsp', 'Increase font size', 'plus', false, () => stepSize(1))}
            {pop(
              'size',
              <div className="rt-sizes">
                {RT_SIZES.map((z) => (
                  <button key={z} type="button" className={cur.pt === z ? 'on' : ''} onMouseDown={keepSel} onClick={() => (this.setState({ sizeTxt: null, pop: null }), rtSize(z))}>
                    {z}
                  </button>
                ))}
              </div>,
            )}
          </span>
          <Div />
          {blockBtn('p', 'Normal', 'Normal text')}
          {blockBtn('h2', 'H1', 'Section heading — starts a new section')}
          {blockBtn('h3', 'H2', 'Heading 2')}
          {blockBtn('h4', 'H3', 'Heading 3')}
          {B('quote', 'Quote', 'quote', blk === 'blockquote', () => rtExec('formatBlock', 'blockquote'))}
          <Div />
          {B('bold', 'Bold (Ctrl+B)', 'bold', q('bold'), () => rtExec('bold'))}
          {B('italic', 'Italic (Ctrl+I)', 'italic', q('italic'), () => rtExec('italic'))}
          {B('underline', 'Underline (Ctrl+U)', 'underline', q('underline'), () => rtExec('underline'))}
          {B('strike', 'Strikethrough', 'strike', q('strikeThrough'), () => rtExec('strikeThrough'))}
          <span className="rt-rel">
            {B('color', 'Text colour', 'color', this.state.pop === 'color', this.tog('color'))}
            {pop('color', this.colorPop('foreColor', RT_COLORS, 'Text colour'))}
          </span>
          <span className="rt-rel">
            {B('hilite', 'Highlight', 'hilite', this.state.pop === 'hilite', this.tog('hilite'))}
            {pop('hilite', this.colorPop('hiliteColor', ['transparent', ...RT_COLORS.slice(0, 23)], 'Highlight'))}
          </span>
          <Div />
          {B('left', 'Align left', 'left', q('justifyLeft'), () => rtExec('justifyLeft'))}
          {B('center', 'Center', 'center', q('justifyCenter'), () => rtExec('justifyCenter'))}
          {B('right', 'Align right', 'right', q('justifyRight'), () => rtExec('justifyRight'))}
          {B('justify', 'Justify', 'justify', q('justifyFull'), () => rtExec('justifyFull'))}
          <Div />
          {B('ul', 'Bulleted list', 'ul', q('insertUnorderedList'), () => rtExec('insertUnorderedList'))}
          {B('ol', 'Numbered list', 'ol', q('insertOrderedList'), () => rtExec('insertOrderedList'))}
          {B('outdent', 'Decrease indent', 'outdent', false, () => rtExec('outdent'))}
          {B('indent', 'Increase indent', 'indent', false, () => rtExec('indent'))}
          <Div />
          <span className="rt-rel">
            {B('link', 'Insert link', 'link', this.state.pop === 'link', this.tog('link'))}
            {pop(
              'link',
              <div className="rt-link">
                <input value={this.state.url} placeholder="https://…" autoFocus onChange={(e) => this.setState({ url: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), this.applyLink())} />
                <button type="button" className="go" onClick={() => this.applyLink()}>
                  Apply
                </button>
                <button type="button" onClick={() => (rtExec('unlink'), this.setState({ pop: null }))}>
                  Remove
                </button>
              </div>,
            )}
          </span>
          {B('image', 'Insert image', 'image', false, () => live && this.fileRef.current?.click())}
          <span className="rt-rel">
            {B('table', 'Insert table', 'table', this.state.pop === 'table', this.tog('table'))}
            {pop(
              'table',
              <div className="rt-tpick">
                <div>
                  {Array.from({ length: 36 }, (_, i) => {
                    const rr = Math.floor(i / 6) + 1;
                    const cc = (i % 6) + 1;
                    const on = rr <= this.state.rows && cc <= this.state.cols;
                    return <span key={i} className={on ? 'on' : ''} onMouseEnter={() => this.setState({ rows: rr, cols: cc })} onMouseDown={keepSel} onClick={() => (rtExec('insertHTML', rtTable(rr, cc)), this.setState({ pop: null }))} />;
                  })}
                </div>
                <small>
                  {this.state.rows} × {this.state.cols} table
                </small>
              </div>,
            )}
          </span>
          {B('code', 'Inline code', 'code', false, rtCode)}
          {B('hr', 'Horizontal line', 'hr', false, () => rtExec('insertHorizontalRule'))}
          {B('clear', 'Clear formatting', 'clear', false, () => (rtExec('removeFormat'), rtExec('formatBlock', 'p')))}
          <input ref={this.fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => ([...(e.target.files || [])].forEach(rtInsertImg), (e.target.value = ''))} />
          {!live && <span className="rt-hint">Click into the page to format</span>}
        </div>
        {img && (
          <div className="rt-sub">
            <b>Image size</b>
            {['25%', '50%', '75%', '100%'].map((w) => TB('w' + w, 'Width ' + w, w, img.style.width === w, () => setW(w)))}
            <Div />
            {B('imgdel', 'Remove image', 'trash', false, () => (img.remove(), (RT.img = null), RT.emit?.(), rtNotify()))}
          </div>
        )}
        {tc && (
          <div className="rt-sub">
            <b>
              {icon('table')} Table
            </b>
            {TB('ra', '+ Row above', '+ Row above', false, () => rtT.rowAt(true))}
            {TB('rb', '+ Row below', '+ Row below', false, () => rtT.rowAt(false))}
            {TB('cl', '+ Column left', '+ Column left', false, () => rtT.colAt(true))}
            {TB('cr', '+ Column right', '+ Column right', false, () => rtT.colAt(false))}
            <Div />
            {TB('dr', 'Delete row', 'Delete row', false, () => rtT.delRow())}
            {TB('dc', 'Delete column', 'Delete column', false, () => rtT.delCol())}
            <Div />
            {multi && TB('mg', 'Merge selected cells', 'Merge selected', false, () => rtT.merge())}
            {TB('mr', 'Merge right', 'Merge right', false, () => rtT.merge('right'))}
            {TB('md', 'Merge down', 'Merge down', false, () => rtT.merge('down'))}
            {((tc.a.rowSpan || 1) > 1 || (tc.a.colSpan || 1) > 1) && TB('sp', 'Split cell', 'Split cell', false, () => rtT.split())}
            <Div />
            {TB('hd', 'Header row', 'Header row', false, () => rtT.header())}
            <span className="rt-rel">
              {TB('cfb', 'Cell colour', 'Cell colour', this.state.pop === 'cell', this.tog('cell'))}
              {pop(
                'cell',
                <div className="rt-swatches four">
                  {['transparent', '#F1F5F9', '#DBEAFE', '#DCFCE7', '#FEF3C7', '#FEE2E2', '#EDE9FE', '#E0F2FE'].map((c) => (
                    <button key={c} type="button" title={c === 'transparent' ? 'None' : c} onMouseDown={keepSel} onClick={() => (rtT.fill(c), this.setState({ pop: null }))} style={{ background: c }} />
                  ))}
                </div>,
              )}
            </span>
            <Div />
            <button type="button" className="rt-b txt danger" onMouseDown={keepSel} onClick={() => rtT.del()}>
              {icon('trash')} Delete table
            </button>
            {!multi && <span className="rt-hint">Tab moves to the next cell</span>}
          </div>
        )}
      </div>
    );
  }
}
