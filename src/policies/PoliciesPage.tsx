import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { Modal } from '../leave/ui';
import { ApiError, errorText, fieldErrors } from '../lib/http';
import { catTone, daysTo, downloadPdf, dueTxt, fmtD, polApi, STATUS, type Category, type Changes, type Detail, type Row, type Section } from './api';

const doc = (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M9 13h6" />
    <path d="M9 17h4" />
  </svg>
);
const SWATCHES = ['#0F766E', '#2563EB', '#7C3AED', '#DC2626', '#B45309', '#475569', '#15803D', '#DB2777'];
const CYCLES = [3, 6, 12, 24, 36];
type Filter = 'ALL' | 'published' | 'draft' | 'due' | 'archived';

export function CatChip({ c }: { c: { name: string; color: string } }) {
  const t = catTone(c.color);
  return (
    <span className="po-cat" style={{ color: t.fg, background: t.bg }}>
      <span style={{ background: c.color }} />
      {c.name}
    </span>
  );
}

function Toast({ msg }: { msg: string | null }) {
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}
function useToast() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    if (!t) return;
    const x = setTimeout(() => setT(null), 3200);
    return () => clearTimeout(x);
  }, [t]);
  return [t, setT] as const;
}

/** Policies (HR): the list, or one policy when the address has ?open=id. */
export function PoliciesPage() {
  const [sp, setSp] = useSearchParams();
  const open = sp.get('open');
  const go = (id: string | null) => setSp(id ? { open: id } : {});
  return open ? <PolicyDetail key={open} id={open} onBack={() => go(null)} /> : <PolicyList onOpen={go} />;
}

// ====================================================================== list

function PolicyList({ onOpen }: { onOpen: (id: string) => void }) {
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
      {creating && <NewPolicy categories={q.data.categories} policies={all} onClose={() => setCreating(false)} onCreated={(id) => (setCreating(false), onOpen(id))} />}
      {cats && <CategoriesModal categories={q.data.categories} onClose={() => setCats(false)} />}
    </div>
  );
}

function NewPolicy({ categories, policies, onClose, onCreated }: { categories: Category[]; policies: Row[]; onClose: () => void; onCreated: (id: string) => void }) {
  const opts = useQuery({ queryKey: ['policies', 'new-options'], queryFn: polApi.newOptions });
  const [f, setF] = useState({ name: '', categoryId: categories[0]?.id ?? '', ownerId: '', approverId: '', cycleMonths: 12, ackRequired: true, from: 'blank' });
  const [fe, setFe] = useState<Record<string, string>>({});
  useEffect(() => {
    if (opts.data && !f.ownerId) setF((x) => ({ ...x, ownerId: opts.data!.me }));
  }, [opts.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = useMutation({
    meta: { busy: 'Creating the draft…' },
    mutationFn: () => polApi.create({ ...f, name: f.name.trim(), approverId: f.approverId || null, ownerId: f.ownerId || null }),
    onSuccess: (r) => onCreated(r.id),
    onError: (e) => setFe({ ...fieldErrors(e), _: errorText(e) }),
  });
  const pickTemplate = (key: string) => {
    const t = opts.data?.templates.find((x) => x.key === key);
    const c = t && categories.find((x) => x.name.toLowerCase() === t.category.toLowerCase());
    setF((x) => ({ ...x, from: key, name: x.name || t?.name || '', categoryId: c?.id ?? x.categoryId }));
  };
  const set = (k: keyof typeof f, v: unknown) => (setF((x) => ({ ...x, [k]: v })), setFe({}));
  const people = opts.data?.people ?? [];
  return (
    <Modal
      width={520}
      title="New policy"
      sub="Starts as a draft. Nobody sees it until you publish it."
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={create.isPending} onClick={() => (f.name.trim() ? create.mutate() : setFe({ name: 'Enter a name' }))}>
            Create draft
          </button>
        </>
      }
    >
      {fe._ && !Object.keys(fe).some((k) => k !== '_') && <Alert>{fe._}</Alert>}
      <label className="field">
        <span className="field-label">Start from</span>
        <select className="input sm" value={f.from} onChange={(e) => pickTemplate(e.target.value)}>
          <option value="blank">Blank · Purpose, Scope, Policy, Exceptions</option>
          <optgroup label="Templates">
            {opts.data?.templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </optgroup>
          {policies.some((p) => p.version) && (
            <optgroup label="Copy a published policy">
              {policies
                .filter((p) => p.version)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    Copy of {p.name} · v{p.version}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      </label>
      <label className="field">
        <span className="field-label">
          Name<span className="req">*</span>
        </span>
        <input className="input sm" value={f.name} autoFocus onChange={(e) => set('name', e.target.value)} aria-invalid={!!fe.name} placeholder="e.g. Leave policy" />
        {fe.name && <span className="field-err">{fe.name}</span>}
      </label>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Category</span>
          <select className="input sm" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Review every</span>
          <select className="input sm" value={f.cycleMonths} onChange={(e) => set('cycleMonths', Number(e.target.value))}>
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {c} months
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Owner</span>
          <select className="input sm" value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            <option value="">No owner</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.title ? ` · ${p.title}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Approver</span>
          <select className="input sm" value={f.approverId} onChange={(e) => set('approverId', e.target.value)}>
            <option value="">No approver</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.title ? ` · ${p.title}` : ''}
              </option>
            ))}
          </select>
          {fe.approverId && <span className="field-err">{fe.approverId}</span>}
        </label>
      </div>
      <label className="po-check">
        <input type="checkbox" checked={f.ackRequired} onChange={(e) => set('ackRequired', e.target.checked)} />
        Employees must read and acknowledge it
      </label>
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

// ====================================================================== one policy

type Tab = 'overview' | 'text' | 'acks' | 'history' | 'settings';

function PolicyDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['policies', id], queryFn: () => polApi.detail(id) });
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [toast, setToast] = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; cta: string; danger?: boolean; run: () => Promise<unknown>; done: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['policies'] });
  const act = useMutation({
    mutationFn: (v: { run: () => Promise<unknown>; done: string; after?: () => void }) => v.run(),
    onSuccess: (_r, v) => (refresh(), setToast(v.done), setErr(null), v.after?.()),
    onError: (e) => setErr(errorText(e)),
  });
  const run = (fn: () => Promise<unknown>, done: string, after?: () => void) => act.mutate({ run: fn, done, after });

  if (q.isLoading) return <BlockLoader page label="Loading the policy…" />;
  if (q.isError || !q.data) return (
    <div className="po-page">
      <button type="button" className="ep-link" onClick={onBack}>
        ← Policies
      </button>
      <Alert>{errorText(q.error)}</Alert>
    </div>
  );
  const p = q.data;
  const cur = p.versions[0];
  const dr = p.draft;
  const [sl, sc] = STATUS[p.status];
  const d = daysTo(p.nextReview);
  const edit = () => {
    if (p.archived) return setErr('Restore the policy to edit it.');
    if (dr) return (setEditing(true), setTab('text'));
    run(() => polApi.startDraft(p.id), `Started draft v${cur ? nextMinor(cur.version) : '1.0'}`, () => (setEditing(true), setTab('text')));
  };
  const tabs: [Tab, string, number?][] = [
    ['overview', 'Overview'],
    ['text', editing && dr ? 'Edit draft' : 'Policy text'],
    ...(p.acks ? ([['acks', 'Acknowledgements', p.acks.total - p.acks.done]] as [Tab, string, number][]) : []),
    ['history', 'History', p.versions.length + (dr ? 1 : 0)],
    ...(p.canManage ? ([['settings', 'Settings']] as [Tab, string][]) : []),
  ];

  return (
    <div className="po-page">
      <div className="po-crumb">
        <button type="button" className="ep-link" onClick={onBack}>
          {Icon.chevL} Policies
        </button>
        <span>/</span>
        <span>{p.name}</span>
      </div>
      <div className="po-dhead">
        <span className="po-ic po-ic-lg">{doc}</span>
        <div className="po-head-main">
          <div className="po-head-title">
            <h1>{p.name}</h1>
            {cur && <span className="mono po-muted">v{cur.version}</span>}
            <span className={`pill ${sc}`}>{sl}</span>
            <CatChip c={p.category} />
          </div>
          <span className="po-muted">
            {cur ? `Effective ${fmtD(cur.publishedAt)} · ` : 'Not published yet · '}review every {p.cycleMonths} months
            {p.nextReview ? ` · next review ${fmtD(p.nextReview)} (${dueTxt(d)})` : ''}
          </span>
          <div className="po-people">
            <span>
              <span className="po-av">{p.owner?.initials ?? '–'}</span>Owner · <b>{p.owner?.name ?? 'none'}</b>
            </span>
            <span>
              <span className="po-av">{p.approver?.initials ?? '–'}</span>Approver · <b>{p.approver?.name ?? 'none'}</b>
            </span>
          </div>
        </div>
        <div className="po-head-acts">
          {p.canManage && !p.archived && !editing && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={edit}>
              {dr ? 'Continue editing' : 'Edit'}
            </button>
          )}
          {cur && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadPdf(p.id, p.name).catch((e) => setErr(errorText(e)))}>
              {Icon.download} Download
            </button>
          )}
          {p.canManage && cur && !p.archived && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(() => polApi.reviewed(p.id), 'Marked as reviewed · next review restarts')}>
              Mark reviewed
            </button>
          )}
          {p.canManage &&
            (cur || p.archived ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  p.archived
                    ? run(() => polApi.archive(p.id, false), 'Policy restored')
                    : setConfirm({ title: `Archive ${p.name}?`, text: 'Employees stop seeing it. Its versions and acknowledgements are kept, and you can restore it.', cta: 'Archive', run: () => polApi.archive(p.id, true), done: 'Policy archived' })
                }
              >
                {p.archived ? 'Restore' : 'Archive'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirm({ title: `Delete ${p.name}?`, text: "It has never been published, so nothing is lost but this draft. This can't be undone.", cta: 'Delete', danger: true, run: () => polApi.remove(p.id), done: 'Draft deleted' })}
              >
                Delete
              </button>
            ))}
        </div>
      </div>
      {err && (
        <Alert>
          {err}{' '}
          <button type="button" className="ep-link" onClick={() => setErr(null)}>
            Dismiss
          </button>
        </Alert>
      )}
      {dr && !editing && (
        <div className="po-banner">
          <span className="po-banner-t">
            <b>
              Draft v{dr.nextVersion}
              {dr.inReview ? ` · waiting for ${p.approver?.name ?? 'the approver'}` : dr.approved ? ' · approved' : ''}
            </b>
            <small>
              Last edited {fmtD(dr.updatedAt)}
              {dr.updatedBy ? ` by ${dr.updatedBy}` : ''}
              {dr.note ? ` · ${dr.note}` : ''}
            </small>
          </span>
          <ChangePills c={dr.changes} first={!cur} />
          <span style={{ flex: 1 }} />
          {p.canManage && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={edit}>
              Continue editing
            </button>
          )}
          {p.canApprove && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(() => polApi.approve(p.id), 'Draft approved')}>
              Approve
            </button>
          )}
          {p.canManage && !dr.inReview && !dr.approved && p.approverId && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(() => polApi.submit(p.id), `Sent to ${p.approver?.name} for review`)}>
              Submit for review
            </button>
          )}
          {p.canManage && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPublishing(true)}>
              Publish
            </button>
          )}
        </div>
      )}
      <div className="dfx-tabbar" role="tablist">
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => (setTab(k), setView(null))}>
            {l}
            {n ? <span className="dfx-count">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview p={p} goTab={setTab} />}
      {tab === 'text' &&
        (editing && dr ? (
          <Editor
            p={p}
            onClose={() => setEditing(false)}
            onPublish={() => setPublishing(true)}
            onDiscard={() =>
              setConfirm({
                title: 'Discard this draft?',
                text: cur ? `Your changes are lost; employees keep seeing v${cur.version}.` : 'Nothing has been published, so delete the policy instead if you no longer need it.',
                cta: 'Discard',
                danger: true,
                run: () => polApi.discardDraft(p.id),
                done: 'Draft discarded',
              })
            }
            onSaved={(m) => (refresh(), setToast(m))}
          />
        ) : cur ? (
          <Reader sections={cur.sections} title={`v${cur.version} · effective ${fmtD(cur.publishedAt)}`} />
        ) : dr ? (
          <Reader sections={dr.sections} title={`Draft v${dr.nextVersion} · not published`} />
        ) : null)}
      {tab === 'acks' && p.acks && <Acks a={p.acks} />}
      {tab === 'history' &&
        (view ? (
          <VersionView p={p} v={view} onBack={() => setView(null)} onError={(e) => setErr(errorText(e))} />
        ) : (
          <History p={p} onView={setView} />
        ))}
      {tab === 'settings' && p.canManage && <Settings p={p} onSaved={(m) => (refresh(), setToast(m))} />}

      {publishing && dr && <PublishModal p={p} onClose={() => setPublishing(false)} onDone={(v) => (setPublishing(false), setEditing(false), setTab('overview'), refresh(), setToast(`Published v${v}`))} />}
      {confirm && (
        <Modal
          width={440}
          title={confirm.title}
          onClose={() => setConfirm(null)}
          foot={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn-sm ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
                disabled={act.isPending}
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  run(c.run, c.done, () => {
                    if (c.cta === 'Delete') onBack();
                    if (c.cta === 'Discard') setEditing(false);
                  });
                }}
              >
                {confirm.cta}
              </button>
            </>
          }
        >
          <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{confirm.text}</span>
        </Modal>
      )}
      <Toast msg={toast} />
    </div>
  );
}

const nextMinor = (v: string) => {
  const [a, b] = v.split('.').map(Number);
  return `${a}.${b + 1}`;
};

function ChangePills({ c, first }: { c: Changes; first: boolean }) {
  if (first) return <span className="po-pill po-pill-info">First version</span>;
  if (!c.total) return <span className="po-pill po-pill-mute">No changes yet</span>;
  return (
    <span className="po-pills">
      {c.added > 0 && <span className="po-pill po-pill-add">+{c.added} section{c.added > 1 ? 's' : ''}</span>}
      {c.edited > 0 && <span className="po-pill po-pill-ed">{c.edited} edited</span>}
      {c.removed > 0 && <span className="po-pill po-pill-del">−{c.removed} section{c.removed > 1 ? 's' : ''}</span>}
      {c.reordered && <span className="po-pill po-pill-mute">reordered</span>}
      <span className="po-pill po-pill-mute">
        +{c.sentencesAdded} / −{c.sentencesRemoved} sentences
      </span>
    </span>
  );
}

function Overview({ p, goTab }: { p: Detail; goTab: (t: Tab) => void }) {
  const cur = p.versions[0];
  const a = p.acks;
  const d = daysTo(p.nextReview);
  const stats: [string, string, string][] = [
    ['Current version', cur ? `v${cur.version}` : '—', cur ? `effective ${fmtD(cur.publishedAt)}` : 'not published yet'],
    ['Versions', String(p.versions.length), p.draft ? `+ draft v${p.draft.nextVersion}` : 'no open draft'],
    ['Acknowledged', a ? `${Math.round((a.done / Math.max(1, a.total)) * 100)}%` : '—', a ? `${a.done} of ${a.total} · v${a.version}` : p.ackRequired ? 'after first publish' : 'not required'],
    ['Next review', p.nextReview ? fmtD(p.nextReview) : '—', p.nextReview ? dueTxt(d) : p.archived ? 'archived' : 'after first publish'],
    ['Review cycle', `${p.cycleMonths} months`, p.lastReviewedOn ? `last reviewed ${fmtD(p.lastReviewedOn)}` : 'never reviewed'],
  ];
  return (
    <div className="po-ov">
      <div className="po-stats">
        {stats.map(([l, v, s]) => (
          <div key={l} className="po-stat">
            <span>{l}</span>
            <b>{v}</b>
            <small>{s}</small>
          </div>
        ))}
      </div>
      <div className="po-two">
        <section className="po-card">
          <header>
            Recent activity
            <button type="button" className="ep-link" onClick={() => goTab('history')}>
              Full history
            </button>
          </header>
          {p.events.slice(0, 8).map((e, i) => (
            <div key={i} className="po-ev">
              <span className={`po-dot po-ev-${e.type}`} />
              <span className="po-ev-t">
                <span>{e.text}</span>
                <small>
                  {e.by} · {fmtD(e.at)}
                </small>
              </span>
            </div>
          ))}
        </section>
        <section className="po-card">
          <header>
            Acknowledgement by department
            {a && (
              <button type="button" className="ep-link" onClick={() => goTab('acks')}>
                Who's pending
              </button>
            )}
          </header>
          {a ? (
            a.departments.map((x) => <DeptBar key={x.name} name={x.name} done={x.done} total={x.total} />)
          ) : (
            <div className="po-none">{p.ackRequired ? 'Shows once the policy is published.' : 'This policy doesn’t ask for acknowledgement.'}</div>
          )}
        </section>
      </div>
    </div>
  );
}

function DeptBar({ name, done, total }: { name: string; done: number; total: number }) {
  const r = total ? done / total : 0;
  return (
    <div className="po-dept">
      <span>{name}</span>
      <span className="po-bar">
        <span style={{ width: `${Math.round(r * 100)}%`, background: r >= 0.9 ? 'var(--success, #16A34A)' : r >= 0.7 ? 'var(--brand)' : 'var(--warning, #D97706)' }} />
      </span>
      <small>
        {done}/{total}
      </small>
    </div>
  );
}

function Acks({ a }: { a: NonNullable<Detail['acks']> }) {
  const [q, setQ] = useState('');
  const pending = a.pending.filter((x) => !q || `${x.name} ${x.department}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="po-two">
      <section className="po-card">
        <header>
          By department · v{a.version}
          <small className="po-muted">
            {a.done} of {a.total} acknowledged
          </small>
        </header>
        {a.departments.map((x) => (
          <DeptBar key={x.name} name={x.name} done={x.done} total={x.total} />
        ))}
        {a.recent.length > 0 && (
          <>
            <div className="po-sub">Latest</div>
            {a.recent.map((r) => (
              <div key={r.id} className="po-person-row">
                <span>{r.name}</span>
                <small className="po-muted">
                  {r.department} · {fmtD(r.at)}
                </small>
              </div>
            ))}
          </>
        )}
      </section>
      <section className="po-card">
        <header>
          Not acknowledged yet · {a.pending.length}
          <input className="input sm" style={{ maxWidth: 180 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…" aria-label="Search pending people" />
        </header>
        {pending.map((x) => (
          <div key={x.id} className="po-person-row">
            <span>{x.name}</span>
            <small className="po-muted">{x.department}</small>
          </div>
        ))}
        {pending.length === 0 && <div className="po-none">{a.pending.length ? 'Nobody matches' : 'Everyone has acknowledged this version'}</div>}
      </section>
    </div>
  );
}

export function Reader({ sections, title }: { sections: Section[]; title?: string }) {
  return (
    <article className="po-doc">
      {title && <div className="po-doc-meta">{title}</div>}
      {sections.map((s, i) => (
        <section key={i}>
          <h3>
            {i + 1}. {s.heading}
          </h3>
          {(s.body || '').split(/\n+/).map((para, k) => (para.trim() ? <p key={k}>{para}</p> : null))}
          {!s.body.trim() && <p className="po-muted">Nothing written yet.</p>}
        </section>
      ))}
    </article>
  );
}

function Editor({ p, onClose, onPublish, onDiscard, onSaved }: { p: Detail; onClose: () => void; onPublish: () => void; onDiscard: () => void; onSaved: (m: string) => void }) {
  const dr = p.draft!;
  const [secs, setSecs] = useState<Section[]>(() => dr.sections.map((s) => ({ ...s })));
  const [note, setNote] = useState(dr.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(secs) !== JSON.stringify(dr.sections) || note !== (dr.note ?? '');
  const save = useMutation({
    meta: { busy: 'Saving the draft…' },
    mutationFn: () => polApi.saveDraft(p.id, secs, note.trim()),
    onSuccess: () => (setErr(null), onSaved('Draft saved')),
    onError: (e) => setErr(errorText(e)),
  });
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const upd = (i: number, k: keyof Section, v: string) => setSecs((x) => x.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const move = (i: number, by: number) =>
    setSecs((x) => {
      const y = [...x];
      const [s] = y.splice(i, 1);
      y.splice(i + by, 0, s);
      return y;
    });
  return (
    <div className="po-editor">
      <div className="po-ed-bar">
        <b>Editing draft v{dr.nextVersion}</b>
        <span className="po-muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDiscard}>
          Discard draft
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => (dirty && !window.confirm('Leave without saving your changes?') ? null : onClose())}>
          Close editor
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          Save draft
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={() => (dirty ? save.mutateAsync().then(onPublish).catch(() => undefined) : onPublish())}>
          Publish…
        </button>
      </div>
      {err && <Alert>{err}</Alert>}
      <label className="field">
        <span className="field-label">What’s changing</span>
        <input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Raised carry forward to 12 days" maxLength={200} />
      </label>
      {secs.map((s, i) => (
        <div key={i} className="po-ed-sec">
          <div className="po-ed-sec-h">
            <span className="po-muted mono">{i + 1}.</span>
            <input className="input sm" value={s.heading} onChange={(e) => upd(i, 'heading', e.target.value)} placeholder="Section heading" aria-label={`Section ${i + 1} heading`} />
            <button type="button" className="dfx-icon-btn" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="dfx-icon-btn" title="Move down" disabled={i === secs.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" className="dfx-icon-btn" title="Remove section" disabled={secs.length === 1} onClick={() => setSecs((x) => x.filter((_, j) => j !== i))}>
              {Icon.trash}
            </button>
          </div>
          <textarea className="input" rows={Math.min(14, Math.max(4, Math.ceil(s.body.length / 90) + 1))} value={s.body} onChange={(e) => upd(i, 'body', e.target.value)} placeholder="Write this section. A blank line starts a new paragraph." aria-label={`Section ${i + 1} text`} />
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSecs((x) => [...x, { heading: '', body: '' }])}>
        {Icon.plus} Add section
      </button>
    </div>
  );
}

function PublishModal({ p, onClose, onDone }: { p: Detail; onClose: () => void; onDone: (v: string) => void }) {
  const dr = p.draft!;
  const cur = p.versions[0];
  const [major, setMajor] = useState(false);
  const [note, setNote] = useState(dr.note ?? (cur ? '' : 'Initial release'));
  const [reack, setReack] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const pub = useMutation({
    meta: { busy: 'Publishing…' },
    mutationFn: () => polApi.publish(p.id, { major, note: note.trim(), requireAck: reack }),
    onSuccess: (r) => onDone(r.version),
    onError: (e) => setErr(fieldErrors(e).note ?? errorText(e)),
  });
  const v = cur ? (major ? dr.nextMajor : dr.nextVersion) : '1.0';
  return (
    <Modal
      width={500}
      title={`Publish v${v}`}
      sub={cur ? `Replaces v${cur.version} for everyone straight away.` : 'Employees see it straight away.'}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={pub.isPending} onClick={() => (note.trim() ? pub.mutate() : setErr('Say what changed'))}>
            Publish v{v}
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      {cur && (
        <div className="po-choice" role="radiogroup" aria-label="Kind of change">
          {(
            [
              [false, `Minor · v${dr.nextVersion}`, 'Wording, clarifications, small corrections'],
              [true, `Major · v${dr.nextMajor}`, 'Changes what people are entitled to or must do'],
            ] as const
          ).map(([m, l, s]) => (
            <button key={l} type="button" role="radio" aria-checked={major === m} className={major === m ? 'on' : ''} onClick={() => (setMajor(m), setReack(m || reack))}>
              <b>{l}</b>
              <small>{s}</small>
            </button>
          ))}
        </div>
      )}
      {cur && <ChangePills c={dr.changes} first={false} />}
      <label className="field">
        <span className="field-label">
          Change note<span className="req">*</span>
        </span>
        <input className="input sm" value={note} onChange={(e) => (setNote(e.target.value), setErr(null))} placeholder="Shown in the history and to employees" maxLength={200} />
      </label>
      {p.ackRequired && cur && (
        <label className="po-check">
          <input type="checkbox" checked={reack} onChange={(e) => setReack(e.target.checked)} />
          Ask everyone to acknowledge v{v} again
        </label>
      )}
      {p.ackRequired && !cur && <span className="po-muted" style={{ fontSize: 12 }}>Everyone is asked to read and acknowledge it, and gets an in-app message.</span>}
      {dr.inReview && <Alert kind="info">This draft is still waiting for {p.approver?.name ?? 'the approver'}. Publishing now skips their review.</Alert>}
    </Modal>
  );
}

function History({ p, onView }: { p: Detail; onView: (v: string) => void }) {
  return (
    <div className="po-two">
      <section className="po-card">
        <header>Versions</header>
        {p.draft && (
          <button type="button" className="po-ver" onClick={() => onView('draft')}>
            <span className="mono">v{p.draft.nextVersion}</span>
            <span className="po-ver-t">
              <span>Draft{p.draft.note ? ` · ${p.draft.note}` : ''}</span>
              <small>edited {fmtD(p.draft.updatedAt)}</small>
            </span>
            <span className="pill pill-warn">Draft</span>
          </button>
        )}
        {p.versions.map((v, i) => (
          <button key={v.id} type="button" className="po-ver" onClick={() => onView(v.version)}>
            <span className="mono">v{v.version}</span>
            <span className="po-ver-t">
              <span>{v.note || '—'}</span>
              <small>
                {v.publishedBy ?? 'Someone'} · {fmtD(v.publishedAt)}
                {v.major ? ' · major' : ''}
                {v.requiresAck ? ' · asked for acknowledgement' : ''}
              </small>
            </span>
            {i === 0 && <span className="pill pill-ok">Current</span>}
          </button>
        ))}
        {!p.versions.length && !p.draft && <div className="po-none">No versions yet</div>}
      </section>
      <section className="po-card">
        <header>Activity</header>
        {p.events.map((e, i) => (
          <div key={i} className="po-ev">
            <span className={`po-dot po-ev-${e.type}`} />
            <span className="po-ev-t">
              <span>{e.text}</span>
              <small>
                {e.by} · {new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </small>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function VersionView({ p, v, onBack, onError }: { p: Detail; v: string; onBack: () => void; onError: (e: unknown) => void }) {
  const isDraft = v === 'draft';
  const ver = p.versions.find((x) => x.version === v);
  const secs = isDraft ? p.draft?.sections ?? [] : ver?.sections ?? [];
  const idx = p.versions.findIndex((x) => x.version === v);
  const prev = isDraft ? p.versions[0] : p.versions[idx + 1];
  const changed = useMemo(() => {
    if (!prev) return new Map<string, 'ADDED' | 'EDITED'>();
    const was = new Map(prev.sections.map((s) => [s.heading.toLowerCase(), s.body]));
    return new Map(secs.filter((s) => was.get(s.heading.toLowerCase()) !== s.body).map((s) => [s.heading, was.has(s.heading.toLowerCase()) ? ('EDITED' as const) : ('ADDED' as const)]));
  }, [prev, secs]);
  const removed = prev ? prev.sections.filter((s) => !secs.some((x) => x.heading.toLowerCase() === s.heading.toLowerCase())) : [];
  return (
    <div className="po-vview">
      <div className="po-ed-bar">
        <button type="button" className="ep-link" onClick={onBack}>
          {Icon.chevL} All versions
        </button>
        <b>{isDraft ? `Draft v${p.draft?.nextVersion}` : `v${v}`}</b>
        {prev && <span className="po-muted">Highlighted: changed since v{prev.version}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadPdf(p.id, p.name, isDraft ? 'draft' : v).catch(onError)}>
          {Icon.download} Download
        </button>
      </div>
      <article className="po-doc">
        {secs.map((s, i) => {
          const ch = changed.get(s.heading);
          return (
            <section key={i} className={ch ? `po-ch po-ch-${ch.toLowerCase()}` : undefined}>
              <h3>
                {i + 1}. {s.heading}
                {ch && <span className={`po-pill ${ch === 'ADDED' ? 'po-pill-add' : 'po-pill-ed'}`}>{ch === 'ADDED' ? 'New' : 'Changed'}</span>}
              </h3>
              {s.body.split(/\n+/).map((para, k) => (para.trim() ? <p key={k}>{para}</p> : null))}
            </section>
          );
        })}
        {removed.map((s) => (
          <section key={s.heading} className="po-ch po-ch-removed">
            <h3>
              {s.heading} <span className="po-pill po-pill-del">Removed</span>
            </h3>
          </section>
        ))}
      </article>
    </div>
  );
}

function Settings({ p, onSaved }: { p: Detail; onSaved: (m: string) => void }) {
  const opts = useQuery({ queryKey: ['policies', 'new-options'], queryFn: polApi.newOptions });
  const cats = useQuery({ queryKey: ['policies', 'categories'], queryFn: polApi.categories });
  const [f, setF] = useState({ name: p.name, categoryId: p.category.id, ownerId: p.ownerId ?? '', approverId: p.approverId ?? '', cycleMonths: p.cycleMonths, ackRequired: p.ackRequired });
  const [fe, setFe] = useState<Record<string, string>>({});
  const save = useMutation({
    meta: { busy: 'Saving…' },
    mutationFn: () => polApi.update(p.id, { ...f, name: f.name.trim(), ownerId: f.ownerId || null, approverId: f.approverId || null }),
    onSuccess: () => (setFe({}), onSaved('Settings saved')),
    onError: (e) => setFe({ ...fieldErrors(e), _: e instanceof ApiError ? e.message : errorText(e) }),
  });
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const people = opts.data?.people ?? [];
  const dirty = f.name !== p.name || f.categoryId !== p.category.id || f.ownerId !== (p.ownerId ?? '') || f.approverId !== (p.approverId ?? '') || f.cycleMonths !== p.cycleMonths || f.ackRequired !== p.ackRequired;
  return (
    <section className="po-card po-settings">
      {fe._ && <Alert>{fe._}</Alert>}
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input sm" value={f.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!fe.name} />
          {fe.name && <span className="field-err">{fe.name}</span>}
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <select className="input sm" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {(cats.data ?? [p.category]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Owner</span>
          <select className="input sm" value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            <option value="">No owner</option>
            {people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.title ? ` · ${x.title}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Approver</span>
          <select className="input sm" value={f.approverId} onChange={(e) => set('approverId', e.target.value)}>
            <option value="">No approver</option>
            {people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.title ? ` · ${x.title}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Review every</span>
          <select className="input sm" value={f.cycleMonths} onChange={(e) => set('cycleMonths', Number(e.target.value))}>
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {c} months
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="po-check">
        <input type="checkbox" checked={f.ackRequired} onChange={(e) => set('ackRequired', e.target.checked)} />
        Employees must read and acknowledge it
      </label>
      <div>
        <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          Save settings
        </button>
      </div>
    </section>
  );
}
