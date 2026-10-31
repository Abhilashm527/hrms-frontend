import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/icons';
import { Overlay } from '../components/Overlay';
import { BlockLoader } from '../components/Splash';
import { date } from '../lib/format';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { employeesApi, type DirectoryItem } from './api';

// ------------------------------------------------------------------ layout settings (Customize), saved for this browser

type FieldKey = 'title' | 'desig' | 'dept' | 'loc' | 'mgr' | 'doj' | 'email' | 'phone' | 'status';
type View = 'cards' | 'table' | 'split';
type Group = 'none' | 'dept' | 'desig' | 'loc';
type Sort = 'id' | 'name' | 'newest';
type Density = 'comfortable' | 'compact';
type DirCfg = { view: View; fields: Record<FieldKey, boolean>; photos: boolean; group: Group; sort: Sort; density: Density };

const DIR_FIELDS: [FieldKey, string][] = [
  ['title', 'Title'],
  ['desig', 'Designation'],
  ['dept', 'Department'],
  ['loc', 'Location'],
  ['mgr', 'Reports to'],
  ['doj', 'Joined'],
  ['email', 'Work email'],
  ['phone', 'Phone'],
  ['status', 'Status'],
];
const DIR_DEF: DirCfg = {
  view: 'cards',
  fields: { title: true, desig: true, dept: true, loc: true, mgr: true, doj: false, email: false, phone: false, status: true },
  photos: true,
  group: 'none',
  sort: 'id',
  density: 'comfortable',
};
const KEY = 'ivy-hrms-dir';

function loadCfg(): DirCfg {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v ? { ...DIR_DEF, ...v, fields: { ...DIR_DEF.fields, ...(v.fields || {}) } } : DIR_DEF;
  } catch {
    return DIR_DEF;
  }
}
function useDirCfg() {
  const [cfg, setCfg] = useState<DirCfg>(loadCfg);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch {
      /* private window: keep it for this visit only */
    }
  }, [cfg]);
  return [cfg, (patch: Partial<DirCfg>) => setCfg((c) => ({ ...c, ...patch })), setCfg] as const;
}

// ------------------------------------------------------------------ helpers

/** The design's department colours, picked by the colour index the API gives each department. */
const toneOf = (e: { department?: { color?: number } | null }) => {
  const i = e.department?.color;
  return i == null ? { fg: 'var(--dc-n-fg)', bg: 'var(--dc-n-bg)' } : { fg: `var(--dc${i}-fg)`, bg: `var(--dc${i}-bg)` };
};
const PILL: Record<string, string> = { healthy: 'pill-ok', active: 'pill-ok', pending: 'pill-warn', degraded: 'pill-warn', failed: 'pill-danger' };
const dateTxt = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? date(v) : v ? String(v) : '—');

/** A column's text for one person; '—' when the viewer can't see it (the API leaves hidden fields out). */
function val(e: DirectoryItem, k: FieldKey): string {
  switch (k) {
    case 'title':
      return e.title || '—';
    case 'desig':
      return e.position?.name || '—';
    case 'dept':
      return e.department?.name || '—';
    case 'loc':
      return e.location?.name || '—';
    case 'mgr':
      return e.manager?.name || '—';
    case 'doj':
      return dateTxt(e.doj);
    case 'email':
      return e.email || '—';
    case 'phone':
      return e.phone || '—';
    case 'status':
      return e.statusLabel;
  }
}
const groupOf: Record<Exclude<Group, 'none'>, { param: string; label: (e: DirectoryItem) => string }> = {
  dept: { param: 'dept', label: (e) => e.department?.name ?? 'Unassigned' },
  desig: { param: 'position', label: (e) => e.position?.name ?? 'Unassigned' },
  loc: { param: 'location', label: (e) => e.location?.name ?? 'Unassigned' },
};

function Status({ e }: { e: Pick<DirectoryItem, 'statusKind' | 'statusLabel'> }) {
  return <span className={`pill ${PILL[e.statusKind] ?? 'pill-muted'}`}>{e.statusLabel}</span>;
}

// Table column widths from the design.
const W: Record<FieldKey, string> = { desig: 'minmax(140px,1fr)', title: 'minmax(150px,1.3fr)', dept: '110px', loc: '100px', mgr: 'minmax(120px,1fr)', doj: '100px', email: 'minmax(190px,1.3fr)', phone: '130px', status: '110px' };
const MW: Record<FieldKey, number> = { desig: 140, title: 150, dept: 110, loc: 100, mgr: 120, doj: 100, email: 190, phone: 130, status: 110 };

// ------------------------------------------------------------------ page

export function EmployeesPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [cfg, setDir, replaceCfg] = useDirCfg();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [zoom, setZoom] = useState<DirectoryItem | null>(null);
  const dept = sp.get('dept') ?? '';
  const loc = sp.get('loc') ?? '';
  const status = sp.get('status') ?? '';
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const size = [10, 20, 50].includes(Number(sp.get('size'))) ? Number(sp.get('size')) : 10;

  const setParams = (patch: Record<string, string>) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
        if (!('page' in patch)) n.delete('page');
        return n;
      },
      { replace: true },
    );
  useEffect(() => {
    const t = setTimeout(() => q.trim() !== (sp.get('q') ?? '') && setParams({ q: q.trim() }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = new URLSearchParams();
  if (sp.get('q')) base.set('q', sp.get('q')!);
  if (dept) base.set('departmentId', dept);
  if (loc) base.set('locationId', loc);
  if (status) base.set('status', status);
  base.set('sort', cfg.sort);
  const grouped = cfg.group !== 'none' && cfg.view !== 'table';
  if (grouped) base.set('group', groupOf[cfg.group as Exclude<Group, 'none'>].param);

  const filters = useQuery({ queryKey: ['employees', 'filters'], queryFn: employeesApi.filters, staleTime: 5 * 60_000 });

  // Table: one page at a time. Cards and split: everyone, loaded 100 at a time.
  const tableParams = new URLSearchParams(base);
  tableParams.set('page', String(page - 1));
  tableParams.set('size', String(size));
  const table = useQuery({ queryKey: ['employees', 'list', tableParams.toString()], queryFn: () => employeesApi.list(tableParams), placeholderData: keepPreviousData, enabled: cfg.view === 'table' });
  const all = useInfiniteQuery({
    queryKey: ['employees', 'all', base.toString()],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(base);
      p.set('page', String(pageParam));
      p.set('size', '100');
      return employeesApi.list(p);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => ((last.page + 1) * last.size < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: cfg.view !== 'table',
  });
  const first = cfg.view === 'table' ? table.data : all.data?.pages[0];
  const loading = cfg.view === 'table' ? table.isLoading : all.isLoading;
  const stale = cfg.view === 'table' ? table.isPlaceholderData : all.isPlaceholderData;
  const items = useMemo(() => all.data?.pages.flatMap((p) => p.items) ?? [], [all.data]);

  // Group in the order (and with the counts) the API gives.
  const groups = useMemo(() => {
    if (!grouped) return [{ label: '', count: first?.total ?? items.length, items }];
    const by = groupOf[cfg.group as Exclude<Group, 'none'>].label;
    const order = all.data?.pages[0]?.groups ?? [];
    const out = order.map((g) => ({ label: g.label, count: g.count, items: items.filter((e) => by(e) === g.label) }));
    for (const e of items) if (!out.some((g) => g.label === by(e))) out.push({ label: by(e), count: 1, items: [e] });
    return out.filter((g) => g.items.length);
  }, [grouped, cfg.group, items, all.data, first?.total]);
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const open = (id: string) => nav(`/employees/${id}`, { state: { from: location.pathname + location.search } });
  const total = first?.total ?? 0;

  return (
    <>
      <PermissionsNotice errors={[table.error, all.error, filters.error]} />
      <div className="toolbar">
        <label className="search-in">
          {Icon.search}
          <input placeholder="search name, title, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="sel" value={loc} onChange={(e) => setParams({ loc: e.target.value })} aria-label="Location">
          <option value="">All locations</option>
          {filters.data?.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className="sel" value={status} onChange={(e) => setParams({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PROBATION">Probation</option>
          <option value="NOTICE">Notice period</option>
        </select>
        <span className="grow" />
        {first && (
          <span className="dir-count">
            {total} of {first.totalAll}
          </span>
        )}
        <span className="dir-views" role="group" aria-label="View">
          {(
            [
              ['cards', 'Cards', Icon.grid],
              ['table', 'Table', Icon.list],
              ['split', 'Split', Icon.split],
            ] as const
          ).map(([k, l, ic]) => (
            <button key={k} type="button" title={`${l} view`} aria-pressed={cfg.view === k} onClick={() => setDir({ view: k })}>
              {ic}
              {l}
            </button>
          ))}
        </span>
        <Customize cfg={cfg} set={setDir} reset={() => replaceCfg({ ...DIR_DEF, view: cfg.view })} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => nav('/onboarding?new=1')}>
          {Icon.userPlus} New hire
        </button>
      </div>

      <div className="chips" role="group" aria-label="Department">
        <button type="button" className="chip caps" aria-pressed={!dept} onClick={() => setParams({ dept: '' })}>
          All
        </button>
        {filters.data?.departments.map((d) => (
          <button key={d.id} type="button" className="chip caps" aria-pressed={dept === d.id} onClick={() => setParams({ dept: dept === d.id ? '' : d.id })}>
            {d.name}
          </button>
        ))}
      </div>

      {loading && <BlockLoader page label="Loading people…" />}

      {!loading && cfg.view === 'cards' && (
        <div className="dir-groups" style={{ opacity: stale ? 0.6 : 1 }}>
          {groups.map((g) => (
            <div key={g.label || 'all'} className="dir-group">
              {grouped && (
                <div className="dir-group-head">
                  <span>{g.label}</span>
                  <span className="n">{g.count}</span>
                  <span className="line" />
                </div>
              )}
              <div className="dir-cards" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cfg.density === 'compact' ? 240 : 210}px, 1fr))` }}>
                {g.items.map((e) => (cfg.density === 'compact' ? <CompactCard key={e.id} e={e} cfg={cfg} onOpen={() => open(e.id)} /> : <Card key={e.id} e={e} cfg={cfg} onOpen={() => open(e.id)} />))}
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="dir-empty card">No employees match</div>}
          <LoadMore q={all} shown={items.length} total={total} />
        </div>
      )}

      {!loading && cfg.view === 'table' && (
        <DirTable rows={table.data?.items ?? []} cfg={cfg} stale={stale} onOpen={open} total={total} page={page} size={size} go={(p) => setParams({ page: String(p) })} setSize={(s) => setParams({ size: String(s), page: '' })} />
      )}

      {!loading && cfg.view === 'split' && (
        <Split
          groups={groups}
          ordered={ordered}
          grouped={grouped}
          cfg={cfg}
          sel={sp.get('sel')}
          pick={(id) => setParams({ sel: id, page: sp.get('page') ?? '' })}
          reveal={(id) => (ordered.some((e) => e.id === id) ? setParams({ sel: id, page: sp.get('page') ?? '' }) : (setQ(''), setSp(new URLSearchParams({ sel: id }), { replace: true })))}
          open={open}
          zoom={setZoom}
          more={<LoadMore q={all} shown={items.length} total={total} />}
        />
      )}

      {zoom && <PhotoZoom e={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ cards

function Card({ e, cfg, onOpen }: { e: DirectoryItem; cfg: DirCfg; onOpen: () => void }) {
  const F = cfg.fields;
  const tone = toneOf(e);
  const meta: [ReactNode, string][] = [];
  if (F.loc) meta.push([Icon.pin, val(e, 'loc')]);
  if (F.mgr) meta.push([Icon.org, `Reports to ${val(e, 'mgr')}`]);
  if (F.doj) meta.push([Icon.cal, `Joined ${val(e, 'doj')}`]);
  if (F.email) meta.push([Icon.mailSm, val(e, 'email')]);
  if (F.phone) meta.push([Icon.phone, val(e, 'phone')]);
  return (
    <button type="button" className="dir-card" onClick={onOpen}>
      {F.status && e.statusKind !== 'healthy' && e.statusKind !== 'active' && (
        <span className="dir-card-badge">
          <Status e={e} />
        </span>
      )}
      <Avatar url={e.photoUrl} initials={e.initials} size={72} tone={tone} noPhoto={!cfg.photos} />
      <span className="dir-card-txt">
        <b>{e.name}</b>
        {F.title && <span className="t">{val(e, 'title')}</span>}
        {F.desig && <span className="d">{val(e, 'desig')}</span>}
      </span>
      {F.dept && e.department && (
        <span className="dir-dept" style={{ background: tone.bg, color: tone.fg }}>
          {e.department.name}
        </span>
      )}
      {meta.length > 0 && (
        <span className="dir-card-meta">
          {meta.map(([ic, v], i) => (
            <span key={i}>
              {ic}
              <span>{v}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

const subOf = (e: DirectoryItem, cfg: DirCfg) => [cfg.fields.title && e.title, cfg.fields.desig && e.position?.name, cfg.fields.dept && e.department?.name].filter(Boolean).join(' · ') || e.code;

function CompactCard({ e, cfg, onOpen }: { e: DirectoryItem; cfg: DirCfg; onOpen: () => void }) {
  return (
    <button type="button" className="dir-card compact" onClick={onOpen}>
      <Avatar url={e.photoUrl} initials={e.initials} size={40} tone={toneOf(e)} noPhoto={!cfg.photos} />
      <span className="dir-two">
        <b>{e.name}</b>
        <span>{subOf(e, cfg)}</span>
      </span>
      {cfg.fields.status && e.statusKind !== 'healthy' && e.statusKind !== 'active' && <Status e={e} />}
    </button>
  );
}

function LoadMore({ q, shown, total }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown }; shown: number; total: number }) {
  if (!q.hasNextPage) return null;
  return (
    <div className="dir-more">
      <button type="button" className="btn btn-secondary btn-sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
        {q.isFetchingNextPage ? 'Loading…' : `Show more · ${total - shown} left`}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ table

function DirTable({ rows, cfg, stale, onOpen, total, page, size, go, setSize }: { rows: DirectoryItem[]; cfg: DirCfg; stale: boolean; onOpen: (id: string) => void; total: number; page: number; size: number; go: (p: number) => void; setSize: (s: number) => void }) {
  const cols = DIR_FIELDS.map(([k]) => k).filter((k) => cfg.fields[k]);
  const grid = ['minmax(200px,1.6fr)', ...cols.map((k) => W[k])].join(' ');
  const minW = 232 + cols.reduce((a, k) => a + MW[k] + 12, 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(page, pages);
  const start = (p - 1) * size;
  let seq: (number | '…')[] = [];
  if (pages <= 7) seq = Array.from({ length: pages }, (_, i) => i + 1);
  else {
    seq = [1];
    const a = Math.max(2, p - 1),
      b = Math.min(pages - 1, p + 1);
    if (a > 2) seq.push('…');
    for (let i = a; i <= b; i++) seq.push(i);
    if (b < pages - 1) seq.push('…');
    seq.push(pages);
  }
  return (
    <div className="dir-tbl">
      <div style={{ minWidth: minW, opacity: stale ? 0.6 : 1 }}>
        <div className="dir-tbl-head" style={{ gridTemplateColumns: grid }}>
          <span>Employee</span>
          {cols.map((k) => (
            <span key={k}>{DIR_FIELDS.find((f) => f[0] === k)![1]}</span>
          ))}
        </div>
        {rows.map((e) => (
          <button key={e.id} type="button" className="dir-tbl-row" style={{ gridTemplateColumns: grid }} onClick={() => onOpen(e.id)}>
            <span className="dir-who">
              <Avatar url={e.photoUrl} initials={e.initials} size={32} tone={toneOf(e)} noPhoto={!cfg.photos} />
              <span className="dir-two">
                <b>{e.name}</b>
                <span className="mono">{e.code}</span>
              </span>
            </span>
            {cols.map((k) =>
              k === 'status' ? (
                <span key={k}>
                  <Status e={e} />
                </span>
              ) : (
                <span key={k} className="ell">
                  {val(e, k)}
                </span>
              ),
            )}
          </button>
        ))}
        {rows.length === 0 && <div className="dir-empty">No employees match</div>}
      </div>
      <div className="dir-pager">
        <span>{total ? `${start + 1}–${Math.min(start + size, total)} of ${total}` : '0 results'}</span>
        <span className="grow" />
        <label>
          Rows per page
          <select className="sel sm" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="dir-pages">
          <button type="button" className="dfx-icon-btn" disabled={p <= 1} onClick={() => go(p - 1)} title="Previous page">
            {Icon.chevL}
          </button>
          {seq.map((n, i) =>
            n === '…' ? (
              <span key={`g${i}`} className="gap">
                …
              </span>
            ) : (
              <button key={n} type="button" className="num" aria-current={n === p ? 'page' : undefined} onClick={() => go(n)}>
                {n}
              </button>
            ),
          )}
          <button type="button" className="dfx-icon-btn" disabled={p >= pages} onClick={() => go(p + 1)} title="Next page">
            {Icon.chevR}
          </button>
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ split

function Split({
  groups,
  ordered,
  grouped,
  cfg,
  sel,
  pick,
  reveal,
  open,
  zoom,
  more,
}: {
  groups: { label: string; count: number; items: DirectoryItem[] }[];
  ordered: DirectoryItem[];
  grouped: boolean;
  cfg: DirCfg;
  sel: string | null;
  pick: (id: string) => void;
  reveal: (id: string) => void;
  open: (id: string) => void;
  zoom: (e: DirectoryItem) => void;
  more: ReactNode;
}) {
  const cur = ordered.find((e) => e.id === sel) ?? ordered[0] ?? null;
  const idx = cur ? ordered.indexOf(cur) : -1;
  const listRef = useRef<HTMLDivElement>(null);
  const mv = (d: number) => {
    const n = ordered[Math.min(ordered.length - 1, Math.max(0, idx + d))];
    if (n) pick(n.id);
  };

  // ↑ ↓ moves, Enter opens the profile — unless you're typing somewhere.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : document.body;
      if (t.closest('input, textarea, select, [contenteditable], [role=dialog], .ivy-dd, .dir-cfg') || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        mv(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && cur && (t.closest('.dir-split-item') || !t.closest('button, a'))) {
        e.preventDefault();
        open(cur.id);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  useEffect(() => {
    listRef.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [cur?.id]);

  return (
    <div className="dir-split">
      <div className="dir-split-list" ref={listRef}>
        {groups.map((g) => (
          <div key={g.label || 'all'}>
            {grouped && (
              <div className="dir-split-group">
                {g.label} · {g.count}
              </div>
            )}
            {g.items.map((e) => (
              <button key={e.id} type="button" data-on={cur?.id === e.id ? '1' : '0'} className="dir-split-item" onClick={() => pick(e.id)} onDoubleClick={() => open(e.id)}>
                <Avatar url={e.photoUrl} initials={e.initials} size={34} tone={toneOf(e)} noPhoto={!cfg.photos} />
                <span className="dir-two">
                  <b>{e.name}</b>
                  <span>{subOf(e, cfg)}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
        {ordered.length === 0 && <div className="dir-empty">No employees match</div>}
        {more}
      </div>
      <div className="dir-split-main">{cur && <Preview e={cur} pos={`${idx + 1} of ${ordered.length}`} prev={idx > 0 ? () => mv(-1) : null} next={idx < ordered.length - 1 ? () => mv(1) : null} open={open} reveal={reveal} zoom={zoom} />}</div>
    </div>
  );
}

function Preview({ e, pos, prev, next, open, reveal, zoom }: { e: DirectoryItem; pos: string; prev: (() => void) | null; next: (() => void) | null; open: (id: string) => void; reveal: (id: string) => void; zoom: (e: DirectoryItem) => void }) {
  const q = useQuery({ queryKey: ['employees', 'preview', e.id], queryFn: () => employeesApi.preview(e.id), staleTime: 60_000 });
  const p = q.data;
  const [copied, setCopied] = useState(false);
  const tone = toneOf(e);
  const show = (v: unknown) => (v && typeof v === 'object' && 'name' in (v as object) ? String((v as { name: string }).name) : dateTxt(v));
  const copy = () => {
    navigator.clipboard?.writeText(`${location.origin}/employees/${e.id}`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="dir-pv">
      <div className="dir-pv-head">
        <button type="button" className="dir-pv-photo" title="View photo" onClick={() => zoom(e)}>
          <Avatar url={e.photoUrl} initials={e.initials} size={96} tone={tone} />
        </button>
        <div className="dir-pv-name">
          <span className="row">
            <b>{e.name}</b>
            <Status e={e} />
          </span>
          <span className="sub">{[e.title, e.department?.name].filter(Boolean).join(' · ') || '—'}</span>
          <span className="mono">{e.code}</span>
        </div>
        <div className="dir-pv-nav">
          <button type="button" className="dfx-icon-btn" title="Previous (↑)" disabled={!prev} onClick={() => prev?.()}>
            {Icon.chevL}
          </button>
          <span>{pos}</span>
          <button type="button" className="dfx-icon-btn" title="Next (↓)" disabled={!next} onClick={() => next?.()}>
            {Icon.chevR}
          </button>
        </div>
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => open(e.id)}>
          {Icon.arrowR} Open full profile
        </button>
        {(p?.email ?? e.email) && (
          <a className="btn btn-secondary btn-sm" href={`mailto:${p?.email ?? e.email}`}>
            {Icon.mailSm} Email
          </a>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
          {Icon.link} {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>
      {q.isLoading && <BlockLoader height={160} size={28} label="Loading details…" />}
      {q.isError && <div className="dir-empty">{q.error.message}</div>}
      {p && (
        <>
          <div className="dir-pv-fields">
            {p.fields.map((f) => (
              <div key={f.key}>
                <span className="k">{f.label}</span>
                <span className="v">{show(f.value)}</span>
              </div>
            ))}
            {p.fields.length === 0 && <span className="field-hint">Your role can't see this person's details.</span>}
          </div>
          <div className="dir-pv-line">
            <b>Reporting line</b>
            {p.manager && (
              <button type="button" className="dir-mgr" onClick={() => reveal(p.manager!.id)}>
                <span className="lbl">MANAGER</span>
                <Avatar url={`/api/v1/employees/${p.manager.id}/photo?s=64`} initials={p.manager.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()} size={28} />
                <b>{p.manager.name}</b>
              </button>
            )}
            {p.reports.length > 0 && (
              <div className="dir-reports">
                {p.reports.map((r) => (
                  <button key={r.id} type="button" onClick={() => reveal(r.id)}>
                    <Avatar url={r.photoUrl} initials={r.initials} size={26} tone={toneOf(r)} />
                    <span className="dir-two">
                      <b>{r.name}</b>
                      <span>{r.title ?? r.position?.name ?? ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!p.manager && p.reports.length === 0 && <span className="field-hint">No manager or direct reports recorded.</span>}
          </div>
        </>
      )}
      <span className="field-hint">↑ ↓ to move · Enter to open profile</span>
    </div>
  );
}

// ------------------------------------------------------------------ customize popover, photo zoom

function Customize({ cfg, set, reset }: { cfg: DirCfg; set: (p: Partial<DirCfg>) => void; reset: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.ivy-dd') && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', key));
  }, [open]);
  const seg = <K extends 'group' | 'sort' | 'density'>(k: K, label: string, opts: [DirCfg[K], string][]) => (
    <div className="dir-cfg-sec">
      <span className="dir-cfg-lbl">{label}</span>
      <div className="dir-cfg-seg">
        {opts.map(([v, t]) => (
          <button key={String(v)} type="button" aria-pressed={cfg[k] === v} onClick={() => set({ [k]: v } as Partial<DirCfg>)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="dir-cfg-wrap" ref={ref}>
      <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {Icon.sliders} Customize
      </button>
      {open && (
        <div className="dir-cfg" role="dialog" aria-label="Customize directory">
          <div className="dir-cfg-sec">
            <span className="dir-cfg-lbl">Show fields</span>
            <div className="dir-cfg-fields">
              {DIR_FIELDS.map(([k, l]) => (
                <button key={k} type="button" role="checkbox" aria-checked={cfg.fields[k]} onClick={() => set({ fields: { ...cfg.fields, [k]: !cfg.fields[k] } })}>
                  <span className="box">{cfg.fields[k] && Icon.checkSmall}</span>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="dir-cfg-toggle" onClick={() => set({ photos: !cfg.photos })}>
            <span>Employee photos</span>
            <span className="switch" role="switch" aria-checked={cfg.photos} />
          </button>
          {seg('group', 'Group by', [
            ['none', 'None'],
            ['dept', 'Dept'],
            ['desig', 'Designation'],
            ['loc', 'Location'],
          ])}
          {seg('sort', 'Sort', [
            ['id', 'Employee ID'],
            ['name', 'Name'],
            ['newest', 'Newest'],
          ])}
          {seg('density', 'Card size', [
            ['comfortable', 'Comfortable'],
            ['compact', 'Compact'],
          ])}
          <div className="dir-cfg-foot">
            <span>Saved for this browser</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoZoom({ e, onClose }: { e: DirectoryItem; onClose: () => void }) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <Overlay>
      <div className="dir-zoom" onClick={onClose}>
        <div className="dir-zoom-card" role="dialog" aria-label={e.name} onClick={(ev) => ev.stopPropagation()}>
          <Avatar url={e.photoUrl} initials={e.initials} size={260} radius={12} tone={toneOf(e)} />
          <span className="dir-two center">
            <b>{e.name}</b>
            <span>{[e.title, e.department?.name].filter(Boolean).join(' · ')}</span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Overlay>
  );
}
