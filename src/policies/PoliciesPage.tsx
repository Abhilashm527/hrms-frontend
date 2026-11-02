import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { Modal } from '../leave/ui';
import { errorText, fieldErrors } from '../lib/http';
import { daysTo, dueTxt, fmtD, polApi, STATUS, type Category, type Row } from './api';
import { PolicyDetail } from './PolicyDetail';
import { CatChip, DOC_ICON as doc } from './shared';

const SWATCHES = ['#0F766E', '#2563EB', '#7C3AED', '#DC2626', '#B45309', '#475569', '#15803D', '#DB2777'];
type Filter = 'ALL' | 'published' | 'draft' | 'due' | 'archived';

export { CatChip };

/** Policies (HR): the list, or one policy when the address has ?open=id. */
export function PoliciesPage() {
  const [sp, setSp] = useSearchParams();
  const open = sp.get('open');
  const go = (id: string | null, edit = false) => setSp(id ? { open: id, ...(edit ? { edit: '1' } : {}) } : {});
  return open ? <PolicyDetail key={open} id={open} startEditing={sp.get('edit') === '1'} onBack={() => go(null)} /> : <PolicyList onOpen={go} />;
}

// ====================================================================== list

function PolicyList({ onOpen }: { onOpen: (id: string, edit?: boolean) => void }) {
  const q = useQuery({ queryKey: ['policies'], queryFn: polApi.list });
  const [filter, setFilter] = useState<Filter>('ALL');
  const [cat, setCat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [cats, setCats] = useState(false);

  if (q.isLoading) return <BlockLoader page label="Loading policies…" />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const all = q.data.items;
  const live = all.filter((p) => !p.archived);
  const due = live.filter((p) => p.nextReview && (daysTo(p.nextReview) ?? 99) <= 30);
  const overdue = due.filter((p) => (daysTo(p.nextReview) ?? 0) < 0);
  const acks = live.filter((p) => p.ack && p.ack.total);
  const avg = acks.length ? acks.reduce((a, p) => a + p.ack!.done / p.ack!.total, 0) / acks.length : 0;
  const inF = (p: Row) =>
    filter === 'archived' ? p.archived : p.archived ? false : filter === 'published' ? !!p.version : filter === 'draft' ? !!p.draft : filter === 'due' ? due.includes(p) : true;
  const needle = search.trim().toLowerCase();
  const rows = all
    .filter((p) => inF(p) && (cat === 'ALL' || p.category.id === cat) && (!needle || `${p.name} ${p.category.name} ${p.owner?.name ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => (daysTo(a.nextReview) ?? 9999) - (daysTo(b.nextReview) ?? 9999));
  const kpi = (k: Filter, label: string, value: ReactNode, sub: string, dot: string, warn?: boolean) => (
    <button key={k} type="button" className={`po-kpi${filter === k ? ' on' : ''}`} onClick={() => setFilter(filter === k && k !== 'ALL' ? 'ALL' : k)}>
      <span className="po-kpi-l">
        <span style={{ background: dot }} />
        {label}
      </span>
      <b>{value}</b>
      <small style={warn ? { color: 'var(--danger-fg)' } : undefined}>{sub}</small>
    </button>
  );
  const nArch = all.length - live.length;

  return (
    <div className="po-page">
      <div className="po-top">
        <span>
          <h1>Policies</h1>
          <small>Write, publish and track acknowledgement of company policies</small>
        </span>
      </div>
      <div className="po-kpis">
        {kpi('ALL', 'Active policies', live.length, `${new Set(live.map((p) => p.category.id)).size} categories`, 'var(--brand)')}
        {kpi('published', 'Published', live.filter((p) => p.version).length, `${Math.round(avg * 100)}% acknowledged on average`, 'var(--success, #16A34A)')}
        {kpi('draft', 'Drafts & reviews', live.filter((p) => p.draft).length, `${live.filter((p) => p.draft?.inReview).length} waiting for approval`, 'var(--warning, #D97706)')}
        {kpi('due', 'Review due · 30 days', due.length, overdue.length ? `${overdue.length} overdue` : 'none overdue', 'var(--danger, #DC2626)', overdue.length > 0)}
      </div>
      <div className="po-tools">
        <label className="search-in po-search">
          {Icon.search}
          <input placeholder="search policies…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search policies" />
        </label>
        <select className="input sm po-sel" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="ALL">All categories</option>
          {q.data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCats(true)}>
          Categories
        </button>
        <button type="button" className="ep-link" onClick={() => setFilter(filter === 'archived' ? 'ALL' : 'archived')}>
          {filter === 'archived' ? 'Back to active' : `Archived (${nArch})`}
        </button>
        <span style={{ flex: 1 }} />
        <span className="po-muted">
          {rows.length} of {filter === 'archived' ? nArch : live.length}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          {Icon.plus} New policy
        </button>
      </div>
      <div className="po-table">
        <div className="po-grid po-head">
          <span>Policy</span>
          <span>Version</span>
          <span>Status</span>
          <span>Owner</span>
          <span>Last updated</span>
          <span>Next review</span>
          <span>Acknowledged</span>
        </div>
        {rows.map((p) => {
          const d = daysTo(p.nextReview);
          const r = p.ack && p.ack.total ? p.ack.done / p.ack.total : 0;
          const [sl, sc] = STATUS[p.status];
          return (
            <button key={p.id} type="button" className="po-grid po-row" onClick={() => onOpen(p.id)}>
              <span className="po-name">
                <span className="po-ic">{doc}</span>
                <span className="po-name-t">
                  <b>{p.name}</b>
                  <CatChip c={p.category} />
                </span>
              </span>
              <span className="po-stack">
                <span className="mono">{p.version ? `v${p.version}` : '—'}</span>
                <small>{p.versionCount ? `${p.versionCount} version${p.versionCount > 1 ? 's' : ''}` : 'not published'}</small>
              </span>
              <span className="po-stack">
                <span className={`pill ${sc}`}>{sl}</span>
                {p.draft && p.version && <small className="po-warn">Draft v{p.draft.nextVersion} {p.draft.inReview ? 'in review' : 'open'}</small>}
              </span>
              <span className="po-person">
                {p.owner ? (
                  <>
                    <span className="po-av">{p.owner.initials}</span>
                    <span>{p.owner.name}</span>
                  </>
                ) : (
                  <span className="po-muted">No owner</span>
                )}
              </span>
              <span className="po-muted">{fmtD(p.updatedAt)}</span>
              <span className="po-stack">
                <span>{p.nextReview ? fmtD(p.nextReview) : '—'}</span>
                <small style={{ color: d == null ? undefined : d < 0 ? 'var(--danger-fg)' : d <= 30 ? 'var(--warning-fg)' : undefined }}>
                  {p.archived ? 'archived' : p.version ? dueTxt(d) : 'after first publish'}
                </small>
              </span>
              <span className="po-stack">
                <span className="po-muted">{p.ack ? `${Math.round(r * 100)}% · ${p.ack.done}/${p.ack.total}` : '—'}</span>
                <span className="po-bar">
                  <span style={{ width: `${Math.round(r * 100)}%`, background: r >= 0.9 ? 'var(--success, #16A34A)' : r >= 0.7 ? 'var(--brand)' : 'var(--warning, #D97706)' }} />
                </span>
              </span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="po-empty">
            {all.length === 0 ? (
              <>
                No policies yet.{' '}
                <button type="button" className="ep-link" onClick={() => setCreating(true)}>
                  Create the first one
                </button>{' '}
                from a template or a blank page.
              </>
            ) : (
              'No policies match'
            )}
          </div>
        )}
      </div>
      {creating && <NewPolicy categories={q.data.categories} policies={all} onClose={() => setCreating(false)} onCreated={(id) => (setCreating(false), onOpen(id, true))} />}
      {cats && <CategoriesModal categories={q.data.categories} onClose={() => setCats(false)} />}
    </div>
  );
}

/** As in the UX: name, category (a new one can be added inline), owner and where to start from. Review cycle, approver and
 * acknowledgement keep their defaults (12 months, none, required) and are changed later under Settings. */
function NewPolicy({ categories, policies, onClose, onCreated }: { categories: Category[]; policies: Row[]; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const opts = useQuery({ queryKey: ['policies', 'new-options'], queryFn: polApi.newOptions });
  const [f, setF] = useState({ name: '', categoryId: categories[0]?.id ?? '', ownerId: '', from: 'blank' });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [catDraft, setCatDraft] = useState<string | null>(null);
  const [catErr, setCatErr] = useState<string | null>(null);
  useEffect(() => {
    if (opts.data && !f.ownerId) setF((x) => ({ ...x, ownerId: opts.data!.me }));
  }, [opts.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = useMutation({
    meta: { busy: 'Creating the draft…' },
    mutationFn: () => polApi.create({ ...f, name: f.name.trim(), ownerId: f.ownerId || null, approverId: null, cycleMonths: 12, ackRequired: true }),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ['policies'] }), onCreated(r.id)),
    onError: (e) => setFe({ ...fieldErrors(e), _: errorText(e) }),
  });
  const addCat = useMutation({
    mutationFn: (name: string) => polApi.addCategory({ name, color: SWATCHES.find((c) => !categories.some((x) => x.color.toUpperCase() === c)) ?? SWATCHES[0] }),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ['policies'] }), setF((x) => ({ ...x, categoryId: r.id })), setCatDraft(null), setCatErr(null)),
    onError: (e) => setCatErr(fieldErrors(e).name ?? errorText(e)),
  });
  const pickFrom = (key: string) => {
    const t = opts.data?.templates.find((x) => x.key === key);
    const c = t && categories.find((x) => x.name.toLowerCase() === t.category.toLowerCase());
    setF((x) => ({ ...x, from: key, name: x.name || t?.name || '', categoryId: c?.id ?? x.categoryId }));
  };
  const set = (k: keyof typeof f, v: string) => (setF((x) => ({ ...x, [k]: v })), setFe({}));
  const people = opts.data?.people ?? [];
  const nameBad = (tried && !f.name.trim()) || !!fe.name;
  const go = () => (f.name.trim() ? create.mutate() : setTried(true));
  return (
    <Modal
      width={520}
      title="New policy"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={create.isPending} onClick={go}>
            Create draft
          </button>
        </>
      }
    >
      {fe._ && !Object.keys(fe).some((k) => k !== '_') && <Alert>{fe._}</Alert>}
      <div className="po-new">
        <label className="field po-wide">
          <span className="field-label">Policy name</span>
          <input
            className="input sm"
            value={f.name}
            autoFocus
            onChange={(e) => set('name', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            aria-invalid={nameBad}
            placeholder="e.g. Parental leave"
          />
          {nameBad && <span className="field-err">{fe.name ?? 'Enter a name'}</span>}
        </label>
        <div className="field">
          <span className="field-label">Category</span>
          {catDraft != null ? (
            <span className="po-catadd">
              <input
                className="input sm"
                autoFocus
                value={catDraft}
                placeholder="New category name"
                aria-invalid={!!catErr}
                onChange={(e) => (setCatDraft(e.target.value), setCatErr(null))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && catDraft.trim()) addCat.mutate(catDraft.trim());
                  if (e.key === 'Escape') (e.stopPropagation(), setCatDraft(null));
                }}
              />
              <button type="button" className="btn btn-primary btn-sm" disabled={!catDraft.trim() || addCat.isPending} onClick={() => addCat.mutate(catDraft.trim())}>
                Add
              </button>
              <button type="button" className="dfx-icon-btn" title="Cancel" onClick={() => (setCatDraft(null), setCatErr(null))}>
                {Icon.close}
              </button>
            </span>
          ) : (
            <select className="input sm" value={f.categoryId} onChange={(e) => (e.target.value === '__new' ? setCatDraft('') : set('categoryId', e.target.value))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New category…</option>
            </select>
          )}
          {catErr && <span className="field-err">{catErr}</span>}
        </div>
        <label className="field">
          <span className="field-label">Owner</span>
          <select className="input sm" value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            {!f.ownerId && <option value="">—</option>}
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field po-wide">
          <span className="field-label">Start from</span>
          <select className="input sm" value={f.from} onChange={(e) => pickFrom(e.target.value)}>
            <option value="blank">Blank template</option>
            {opts.data?.templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name} template
              </option>
            ))}
            {policies
              .filter((p) => p.version)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Copy of {p.name} · v{p.version}
                </option>
              ))}
          </select>
        </label>
        <span className="po-wide po-hint">The policy starts as a draft. Nothing is visible to employees until you publish v1.0.</span>
      </div>
    </Modal>
  );
}

function CategoriesModal({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [names, setNames] = useState<Record<string, string>>({});
  const [nn, setNn] = useState('');
  const [nc, setNc] = useState(SWATCHES.find((s) => !categories.some((c) => c.color.toUpperCase() === s)) ?? SWATCHES[0]);
  const [err, setErr] = useState<string | null>(null);
  const done = () => (qc.invalidateQueries({ queryKey: ['policies'] }), setErr(null));
  const m = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: done, onError: (e) => setErr(fieldErrors(e).name ?? errorText(e)) });
  const add = () => nn.trim() && m.mutate(() => polApi.addCategory({ name: nn.trim(), color: nc }).then(() => setNn('')));
  const swatches = (cur: string, pick: (c: string) => void) => (
    <span className="po-sw">
      {SWATCHES.map((s) => (
        <button key={s} type="button" title={s} aria-pressed={cur.toUpperCase() === s} style={{ background: s }} onClick={() => pick(s)} />
      ))}
      <label className="po-sw-custom" title="Custom colour" style={!SWATCHES.includes(cur.toUpperCase()) ? { boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${cur}` } : undefined}>
        <input type="color" value={cur} onChange={(e) => pick(e.target.value.toUpperCase())} />
      </label>
    </span>
  );
  return (
    <Modal
      width={560}
      title="Policy categories"
      sub="Rename or recolour a category; a category in use can't be deleted."
      onClose={onClose}
      foot={
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Done
        </button>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="po-cats">
        {categories.map((c) => (
          <div key={c.id} className="po-cat-row">
            <input
              className="input sm"
              value={names[c.id] ?? c.name}
              onChange={(e) => setNames((x) => ({ ...x, [c.id]: e.target.value }))}
              onBlur={() => {
                const v = (names[c.id] ?? c.name).trim();
                if (v && v !== c.name) m.mutate(() => polApi.updateCategory(c.id, { name: v }));
                setNames((x) => {
                  const y = { ...x };
                  delete y[c.id];
                  return y;
                });
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Category name"
            />
            {swatches(c.color, (col) => m.mutate(() => polApi.updateCategory(c.id, { color: col })))}
            <span className="po-muted po-cnt">{c.count ?? 0}</span>
            <button
              type="button"
              className="dfx-icon-btn"
              title={c.count ? `In use by ${c.count} ${c.count === 1 ? 'policy' : 'policies'}` : 'Delete category'}
              disabled={!!c.count}
              onClick={() => m.mutate(() => polApi.deleteCategory(c.id))}
            >
              {Icon.trash}
            </button>
          </div>
        ))}
        <div className="po-cat-row po-cat-new">
          <input className="input sm" value={nn} placeholder="New category" onChange={(e) => (setNn(e.target.value), setErr(null))} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New category" />
          {swatches(nc, setNc)}
          <button type="button" className="btn btn-secondary btn-sm" disabled={!nn.trim() || m.isPending} onClick={add}>
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}

