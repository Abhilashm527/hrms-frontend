import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMyNav } from '../access/api';
import { Icon } from '../components/icons';
import { get } from '../lib/http';
import { useTheme } from '../lib/theme';
import { ACCESS_GROUPS, CONFIG_GROUPS } from '../settings/SettingsLayout';
import { ADMIN_NAV, ESS_NAV, allItems } from './nav';

type Hit = { id: string; title: string; sub: string; meta: string | null; link: string };
type Server = { groups: { group: string; total: number; items: Hit[] }[] };
type Item = { key: string; group: string; title: string; sub: string; meta?: string | null; icon: ReactNode; run: () => void; hay: string };

const SCOPES: { label: string; groups: string[] | null; server?: string }[] = [
  { label: 'All', groups: null },
  { label: 'People', groups: ['People'], server: 'People' },
  { label: 'Leave', groups: ['Leave requests', 'Holidays'], server: 'Leave requests' },
  { label: 'Requests', groups: ['Requests'], server: 'Requests' },
  { label: 'Policies', groups: ['Policies'], server: 'Policies' },
  { label: 'Documents', groups: ['Documents'], server: 'Documents' },
  { label: 'Assets', groups: ['Assets'], server: 'Assets' },
  { label: 'Pages', groups: ['Actions', 'Pages', 'Settings'] },
];
const ORDER = ['Actions', 'Pages', 'People', 'Leave requests', 'Requests', 'Policies', 'Documents', 'Assets', 'Holidays', 'Settings'];
const GROUP_ICON: Record<string, ReactNode> = {
  People: Icon.users,
  'Leave requests': Icon.cal,
  Requests: Icon.file,
  Policies: Icon.shield,
  Documents: Icon.file,
  Assets: Icon.laptop,
  Holidays: Icon.cal,
  Settings: Icon.sliders,
  Pages: Icon.arrowR,
  Actions: Icon.plus,
};
const RECENT_KEY = 'ivy-hrms-recent-q';

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

/** Bold the parts of the text that match what was typed. */
function Mark({ text, toks }: { text: string; toks: string[] }) {
  if (!toks.length) return <>{text}</>;
  const lo = text.toLowerCase();
  const on = new Array(text.length).fill(false);
  for (const k of toks) {
    let i = lo.indexOf(k);
    while (i >= 0) {
      for (let j = i; j < i + k.length; j++) on[j] = true;
      i = lo.indexOf(k, i + k.length);
    }
  }
  const out: ReactNode[] = [];
  for (let i = 0; i < text.length; ) {
    let j = i;
    while (j < text.length && on[j] === on[i]) j++;
    out.push(on[i] ? <mark key={i}>{text.slice(i, j)}</mark> : text.slice(i, j));
    i = j;
  }
  return <>{out}</>;
}

/** The top bar's search: pages and actions locally, people and records from the server (which only returns what you may open). */
export function GlobalSearch({ admin, onClose }: { admin: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const myNav = useMyNav();
  const { mode, set: setTheme } = useTheme();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState(0);
  const [sel, setSel] = useState(0);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [recent, setRecent] = useState(readRecent);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => (setSel(0), setMore({})), [term, scope]);

  const sc = SCOPES[scope];
  const server = useQuery({
    queryKey: ['search', term, sc.server ?? ''],
    queryFn: () => get<Server>(`/search?${new URLSearchParams({ q: term, limit: sc.server ? '40' : '6', ...(sc.server ? { group: sc.server } : {}) })}`),
    enabled: term.length >= 2 && sc.label !== 'Pages',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const go = (to: string) => () => nav(to);

  // what the browser knows: the menus this person has, settings pages, and common actions
  const local = useMemo<Item[]>(() => {
    const on = myNav.data ? new Set(myNav.data.menus) : null;
    const hidden = myNav.data?.pages ?? {};
    const out: Item[] = [];
    const add = (group: string, title: string, sub: string, run: () => void, extra = '') =>
      out.push({ key: `${group}:${title}`, group, title, sub, icon: GROUP_ICON[group], run, hay: `${title} ${sub} ${extra}`.toLowerCase() });
    for (const i of allItems(admin ? ADMIN_NAV : ESS_NAV)) if (!on || on.has(i.key)) add('Pages', i.label, admin ? 'Admin console' : 'Self-service', go(i.path));
    if (!admin) for (const [p, l] of [['/me/requests', 'Requests'], ['/me/assets', 'My assets']] as const) add('Pages', l, 'Self-service', go(p));
    if (admin) {
      const groups = [...(!on || on.has('configuration') ? CONFIG_GROUPS.map((g) => ['Configuration', g] as const) : []), ...(!on || on.has('settings') ? ACCESS_GROUPS.map((g) => ['Settings & roles', g] as const) : [])];
      for (const [area, g] of groups)
        for (const i of g.items) if (i.path && hidden[i.path.slice(1)] !== 'hidden') add('Settings', i.label, `${area} · ${g.label}`, go(i.path), 'settings configuration');
    }
    add('Actions', 'Apply for leave', 'Leave', go(admin ? '/leave?apply=1' : '/me/leave'), 'new leave request time off');
    add('Actions', 'Check in or out', 'Attendance', go('/me/attendance'), 'attendance clock punch');
    add('Actions', 'Fill in my timesheet', 'Attendance', go('/me/attendance?tab=timesheet'), 'hours projects');
    add('Actions', 'Raise a request', 'Requests', go('/me/requests'), 'letter reimbursement ticket helpdesk claim');
    add('Actions', 'Read and acknowledge policies', 'Policies', go('/me/policies'), 'policy');
    if (admin) {
      if (!on || on.has('onboarding')) add('Actions', 'Add a new hire', 'Onboarding', go('/onboarding?new=1'), 'onboard employee hire join');
      if (!on || on.has('documents')) add('Actions', 'Upload a document', 'Documents', go('/documents'), 'file upload');
      if (!on || on.has('policies')) add('Actions', 'Write a new policy', 'Policies', go('/policies'), 'policy create');
    }
    add('Actions', 'Switch theme', `Now ${mode}`, () => setTheme(mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'), 'dark mode light appearance');
    return out;
  }, [admin, myNav.data, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const toks = term.toLowerCase().split(/\s+/).filter(Boolean);
  const inScope = (g: string) => !sc.groups || sc.groups.includes(g);

  // local matches, ranked; with nothing typed, the actions and pages
  const localHits = useMemo(() => {
    const pool = local.filter((x) => inScope(x.group));
    if (!toks.length) return sc.label === 'All' ? pool.filter((x) => x.group === 'Actions' || x.group === 'Pages') : pool;
    return pool
      .filter((x) => toks.every((k) => x.hay.includes(k)))
      .map((x) => {
        const t = x.title.toLowerCase();
        return { x, s: (t.startsWith(term.toLowerCase()) ? 100 : 0) + (t.includes(term.toLowerCase()) ? 50 : 0) + toks.filter((k) => t.includes(k)).length * 10 - t.length / 100 };
      })
      .sort((a, b) => b.s - a.s)
      .map((h) => h.x);
  }, [local, toks.join(' '), scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const remember = () => {
    if (!term) return;
    const next = [term, ...recent.filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // not remembered
    }
  };

  // every group with its items, in a fixed order; the flat list drives the keyboard
  const { groups, flat, total } = useMemo(() => {
    const byGroup = new Map<string, { items: Item[]; total: number }>();
    for (const x of localHits) {
      const g = byGroup.get(x.group) ?? { items: [], total: 0 };
      g.items.push(x);
      g.total++;
      byGroup.set(x.group, g);
    }
    if (term.length >= 2 && server.data)
      for (const g of server.data.groups) {
        if (!inScope(g.group)) continue;
        byGroup.set(g.group, {
          total: g.total,
          items: g.items.map((h) => ({ key: `${g.group}:${h.id}`, group: g.group, title: h.title, sub: h.sub, meta: h.meta, icon: GROUP_ICON[g.group] ?? Icon.file, run: go(h.link), hay: '' })),
        });
      }
    const out: { group: string; items: Item[]; total: number; shown: number }[] = [];
    const flat: Item[] = [];
    let total = 0;
    for (const g of ORDER) {
      const v = byGroup.get(g);
      if (!v || !v.items.length) continue;
      const lim = more[g] || sc.label !== 'All' ? 60 : toks.length ? 5 : 8;
      const items = v.items.slice(0, lim);
      flat.push(...items);
      total += v.total;
      out.push({ group: g, items, total: v.total, shown: items.length });
    }
    return { groups: out, flat, total };
  }, [localHits, server.data, more, scope, term]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (x: Item) => {
    remember();
    onClose();
    setTimeout(x.run, 0);
  };
  const cur = Math.min(sel, Math.max(0, flat.length - 1));
  useEffect(() => {
    list.current?.querySelector('[data-sel="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setSel(Math.min(flat.length - 1, cur + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel(Math.max(0, cur - 1)));
    else if (e.key === 'Enter') (e.preventDefault(), flat[cur] && pick(flat[cur]));
    else if (e.key === 'Escape') (e.preventDefault(), onClose());
    else if (e.key === 'Tab') (e.preventDefault(), setScope((s) => (s + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length));
  };

  const loading = term.length >= 2 && server.isFetching;
  let idx = -1;
  return (
    <div className="gs-scrim" onClick={onClose}>
      <div className="gs" role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <div className="gs-in">
          {Icon.search}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={admin ? 'search people, leave, policies, documents, assets, settings…' : 'search people, leave, policies, requests, actions…'}
            aria-label="Search"
            aria-controls="gs-list"
            aria-activedescendant={flat[cur] ? `gs-${cur}` : undefined}
          />
          {loading && <span className="gs-spin" aria-hidden="true" />}
          <kbd>esc</kbd>
        </div>
        <div className="gs-scopes" role="tablist" aria-label="Search in">
          {SCOPES.map((s, i) => (
            <button key={s.label} type="button" role="tab" aria-selected={scope === i} className={scope === i ? 'on' : undefined} onClick={() => setScope(i)}>
              {s.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <span className="gs-count">{toks.length ? `${total} result${total === 1 ? '' : 's'}` : 'Type to search everything'}</span>
        </div>
        <div className="gs-list" id="gs-list" role="listbox" ref={list}>
          {!toks.length && recent.length > 0 && (
            <div className="gs-recent">
              <span>Recent</span>
              {recent.map((r) => (
                <button key={r} type="button" onClick={() => setQ(r)}>
                  {r}
                </button>
              ))}
              <button
                type="button"
                className="gs-clear"
                onClick={() => {
                  setRecent([]);
                  try {
                    localStorage.removeItem(RECENT_KEY);
                  } catch {
                    // nothing to clear
                  }
                }}
              >
                Clear
              </button>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.group} role="group" aria-label={g.group}>
              <div className="gs-gh">
                <span>{g.group}</span>
                <span>{g.total}</span>
              </div>
              {g.items.map((x) => {
                idx++;
                const i = idx;
                return (
                  <button
                    key={x.key}
                    id={`gs-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === cur}
                    data-sel={i === cur ? '1' : '0'}
                    className={`gs-item${i === cur ? ' on' : ''}`}
                    onMouseMove={() => i !== cur && setSel(i)}
                    onClick={() => pick(x)}
                  >
                    <span className="gs-ic">{x.icon}</span>
                    <span className="gs-t">
                      <b>
                        <Mark text={x.title} toks={toks} />
                      </b>
                      {x.sub && (
                        <small>
                          <Mark text={x.sub} toks={toks} />
                        </small>
                      )}
                    </span>
                    {x.meta && <span className="gs-meta">{x.meta}</span>}
                  </button>
                );
              })}
              {g.total > g.shown && sc.label === 'All' && (
                <button type="button" className="gs-more" onClick={() => (g.items.length < g.total && SCOPES.findIndex((s) => s.server === g.group) > 0 ? setScope(SCOPES.findIndex((s) => s.server === g.group)) : setMore((m) => ({ ...m, [g.group]: true })))}>
                  Show all {g.total}
                </button>
              )}
            </div>
          ))}
          {toks.length > 0 && !flat.length && !loading && (
            <div className="gs-empty">
              No results for “{term}”{sc.label !== 'All' ? ` in ${sc.label}` : ''}
              {term.length < 2 ? ' · type at least 2 letters' : ''}
            </div>
          )}
        </div>
        <div className="gs-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>tab</kbd> change scope
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
