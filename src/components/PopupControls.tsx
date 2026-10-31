import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

/*
 * The design replaces the browser's own dropdown list and date picker everywhere with its own popups. These two layers
 * do the same for every <select> and <input type="date"> in the app: the elements stay normal form controls (React state,
 * forms and keyboard typing keep working); only the popup that opens is ours. Add data-native to an element to opt out.
 */

const setNative = (el: HTMLSelectElement | HTMLInputElement, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const inLayer = (t: EventTarget | null) => !!(t instanceof Element && t.closest('[data-ivy-dd],[data-dp-pop]'));

// ------------------------------------------------------------------ dropdown

type Opt = { v: string; l: string; disabled: boolean; group?: string };
type DD = { el: HTMLSelectElement; top: number; left: number; w: number; opts: Opt[]; value: string; active: string; q: string; searchable: boolean };

export function DropdownLayer() {
  const [dd, setDD] = useState<DD | null>(null);
  const ref = useRef<DD | null>(null);
  ref.current = dd;
  const search = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    ref.current?.el.removeAttribute('data-dd-open');
    setDD(null);
  }, []);

  const open = useCallback((el: HTMLSelectElement) => {
    const r = el.getBoundingClientRect();
    const opts: Opt[] = [...el.options].map((o) => ({ v: o.value, l: o.text, disabled: o.disabled, group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : undefined }));
    const H = Math.min(300, opts.length * 33 + (opts.length > 7 ? 48 : 10));
    const below = r.bottom + H + 8 < window.innerHeight;
    const w = Math.max(r.width, 200);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    ref.current?.el.removeAttribute('data-dd-open');
    el.setAttribute('data-dd-open', '');
    setDD({ el, top: below ? r.bottom + 4 : Math.max(8, r.top - H - 4), left, w, opts, value: el.value, active: el.value, q: '', searchable: opts.length > 7 });
  }, []);

  const items = useMemo(() => {
    if (!dd) return [];
    const q = dd.q.trim().toLowerCase();
    return dd.opts.filter((o) => !(o.disabled && o.v === '') && (!q || o.l.toLowerCase().includes(q)));
  }, [dd]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const pick = useCallback(
    (v: string) => {
      const el = ref.current?.el;
      close();
      if (el && el.value !== v) setNative(el, v);
      el?.focus();
    },
    [close],
  );

  useEffect(() => {
    const usable = (t: EventTarget | null): HTMLSelectElement | null => {
      const sel = t instanceof Element ? t.closest('select') : null;
      return sel && !sel.disabled && !sel.multiple && !sel.hasAttribute('data-native') ? sel : null;
    };
    const down = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const sel = usable(e.target);
      if (sel) {
        e.preventDefault();
        sel.focus();
        if (ref.current?.el === sel) close();
        else open(sel);
        return;
      }
      if (ref.current && !inLayer(e.target)) close();
    };
    const key = (e: KeyboardEvent) => {
      const d = ref.current;
      if (!d) {
        // Open from the keyboard the way the mouse does, instead of the browser's list.
        const sel = usable(e.target);
        if (sel && (e.key === 'Enter' || e.key === ' ' || ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey))) {
          e.preventDefault();
          open(sel);
        }
        return;
      }
      const list = itemsRef.current.filter((o) => !o.disabled);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        d.el.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!list.length) return;
        let k = list.findIndex((o) => o.v === d.active);
        k = e.key === 'ArrowDown' ? Math.min(list.length - 1, k + 1) : Math.max(0, k - 1);
        setDD({ ...d, active: list[k].v });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (list.some((o) => o.v === d.active)) pick(d.active);
      } else if (e.key === 'Tab') {
        close();
      }
    };
    const away = (e: Event) => ref.current && !inLayer(e.target) && close();
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close, pick]);

  useEffect(() => {
    if (dd?.searchable) search.current?.focus();
  }, [dd?.el, dd?.searchable]);

  // Keep the highlighted option in view while moving with the arrow keys.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [dd?.active]);

  if (!dd) return null;
  let lastGroup: string | undefined;
  return createPortal(
    <div data-ivy-dd="1" className="ivy-dd" style={{ top: dd.top, left: dd.left, width: dd.w }} role="listbox">
      {dd.searchable && (
        <div className="ivy-dd-search">
          {Icon.search}
          <input ref={search} value={dd.q} placeholder="Search…" onChange={(e) => setDD({ ...dd, q: e.target.value })} aria-label="Search options" />
        </div>
      )}
      <div className="ivy-dd-list" ref={listRef}>
        {items.map((o) => {
          const header = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          const sel = o.v === dd.value;
          return (
            <div key={`${o.group ?? ''}|${o.v}|${o.l}`}>
              {header && <div className="ivy-dd-group">{header}</div>}
              <button
                type="button"
                role="option"
                aria-selected={sel}
                data-active={o.v === dd.active}
                className={`ivy-dd-item${sel ? ' sel' : ''}`}
                disabled={o.disabled}
                onMouseEnter={() => o.v !== dd.active && setDD({ ...dd, active: o.v })}
                onClick={() => !o.disabled && pick(o.v)}
              >
                <span>{o.l}</span>
                {sel && <span className="ivy-dd-check">{Icon.checkSmall}</span>}
              </button>
            </div>
          );
        })}
        {items.length === 0 && <div className="ivy-dd-empty">No matches</div>}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ date picker

type DP = { el: HTMLInputElement; top: number; left: number; v: string; min: string; max: string; m: string };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function DatePickerLayer() {
  const [dp, setDP] = useState<DP | null>(null);
  const ref = useRef<DP | null>(null);
  ref.current = dp;
  const today = iso(new Date());

  const open = useCallback(
    (el: HTMLInputElement) => {
      const r = el.getBoundingClientRect();
      const W = 292,
        H = 372;
      let top = r.bottom + 4;
      if (top + H > window.innerHeight) top = Math.max(8, r.top - H - 4);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      const v = el.value || '';
      const start = v || (el.min && el.min > today ? el.min : el.max && el.max < today ? el.max : today);
      setDP({ el, top, left, v, min: el.min || '', max: el.max || '', m: start.slice(0, 7) });
    },
    [today],
  );
  const close = useCallback(() => setDP(null), []);

  useEffect(() => {
    const usable = (t: EventTarget | null) => {
      const el = t instanceof Element ? t.closest('input[type=date]') : null;
      return el instanceof HTMLInputElement && !el.disabled && !el.readOnly && !el.hasAttribute('data-native') ? el : null;
    };
    const down = (e: MouseEvent) => {
      const el = usable(e.target);
      if (el && e.button === 0) {
        e.preventDefault();
        el.focus({ preventScroll: true });
        if (ref.current?.el === el) close();
        else open(el);
        return;
      }
      if (ref.current && !inLayer(e.target)) close();
    };
    // Stops the browser's own calendar from opening on click; typing a date still works.
    const click = (e: MouseEvent) => usable(e.target) && e.preventDefault();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current) {
        e.stopPropagation();
        close();
      }
    };
    const away = (e: Event) => ref.current && !inLayer(e.target) && close();
    document.addEventListener('mousedown', down, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  if (!dp) return null;
  const [y, mo] = dp.m.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = Array.from({ length: 42 }, (_, i) => new Date(y, mo - 1, 1 - offset + i));
  const lastWeekNeeded = days.slice(35).some((d) => d.getMonth() === mo - 1);
  const shown = lastWeekNeeded ? days : days.slice(0, 35);
  const ok = (v: string) => (!dp.min || v >= dp.min) && (!dp.max || v <= dp.max);
  const shift = (n: number) => {
    const d = new Date(y, mo - 1 + n, 1);
    setDP({ ...dp, m: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` });
  };
  const pick = (v: string) => {
    setNative(dp.el, v);
    close();
  };
  const years = Array.from({ length: 121 }, (_, i) => new Date().getFullYear() - 100 + i).filter((yy) => (!dp.min || yy >= Number(dp.min.slice(0, 4))) && (!dp.max || yy <= Number(dp.max.slice(0, 4))));
  const prevOk = !dp.min || dp.m > dp.min.slice(0, 7);
  const nextOk = !dp.max || dp.m < dp.max.slice(0, 7);

  return createPortal(
    <div data-dp-pop="1" className="ivy-dp" style={{ top: dp.top, left: dp.left }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="ivy-dp-head">
        <button type="button" aria-label="Previous month" disabled={!prevOk} onClick={() => shift(-1)}>
          ‹
        </button>
        <select data-native value={mo} onChange={(e) => setDP({ ...dp, m: `${y}-${pad(Number(e.target.value))}` })} aria-label="Month">
          {MONTHS.map((n, i) => (
            <option key={n} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <select data-native value={y} onChange={(e) => setDP({ ...dp, m: `${e.target.value}-${pad(mo)}` })} aria-label="Year" style={{ width: 74 }}>
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Next month" disabled={!nextOk} onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="ivy-dp-week">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="ivy-dp-days">
        {shown.map((d) => {
          const v = iso(d);
          const out = d.getMonth() !== mo - 1;
          const sel = v === dp.v;
          return (
            <button key={v} type="button" disabled={!ok(v)} title={v} onClick={() => pick(v)} className={`${sel ? 'sel' : ''}${v === today ? ' today' : ''}${out ? ' out' : ''}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="ivy-dp-foot">
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => pick('')}>
          Clear
        </button>
        <button type="button" className="today-btn" disabled={!ok(today)} onClick={() => pick(today)}>
          Today
        </button>
      </div>
    </div>,
    document.body,
  );
}
