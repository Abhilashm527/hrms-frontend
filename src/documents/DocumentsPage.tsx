import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { badge, docsApi, ext, kb, saveFile, type AccessKey, type DocFolder, type Item } from './api';

const ico = (d: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const I = {
  folder: ico(<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />),
  folderPlus: ico(<><path d="M12 10v6" /><path d="M9 13h6" /><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></>),
  star: ico(<path d="M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7a2 2 0 0 0 1.5 1.1l5.2.8a.5.5 0 0 1 .3.9l-3.8 3.7a2 2 0 0 0-.6 1.8l.9 5.2a.5.5 0 0 1-.8.5l-4.6-2.4a2 2 0 0 0-1.9 0L5.4 21a.5.5 0 0 1-.8-.5l.9-5.2a2 2 0 0 0-.6-1.8L1.1 9.8a.5.5 0 0 1 .3-.9l5.2-.8A2 2 0 0 0 8.1 7Z" />),
  clock: ico(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  lock: ico(<><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>, 13),
  upload: ico(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>),
  move: ico(<><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><path d="M2 12h20" /><path d="M12 2v20" /></>),
  edit: ico(<><path d="M12 20h9" /><path d="M16.4 3.6a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></>),
  more: ico(<><path d="M12 5h.01" /><path d="M12 12h.01" /><path d="M12 19h.01" /></>),
  caretR: ico(<path d="m9 18 6-6-6-6" />, 12),
  caretD: ico(<path d="m6 9 6 6 6-6" />, 12),
};
const STAR_ON = (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth={1.6} strokeLinejoin="round" aria-hidden="true">
    <path d="M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7a2 2 0 0 0 1.5 1.1l5.2.8a.5.5 0 0 1 .3.9l-3.8 3.7a2 2 0 0 0-.6 1.8l.9 5.2a.5.5 0 0 1-.8.5l-4.6-2.4a2 2 0 0 0-1.9 0L5.4 21a.5.5 0 0 1-.8-.5l.9-5.2a2 2 0 0 0-.6-1.8L1.1 9.8a.5.5 0 0 1 .3-.9l5.2-.8A2 2 0 0 0 8.1 7Z" />
  </svg>
);

type Where = 'starred' | 'recent' | string;
type Modal = { kind: 'newFolder'; parent: string } | { kind: 'rename'; item: { id: string; name: string; folder: boolean } } | { kind: 'move'; ids: string[] } | { kind: 'delete'; ids: string[] };
const VIEW_KEY = 'hrms-docs-view';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/** Documents: the company's shared files in folders, each folder open to one group. */
export function DocumentsPage() {
  const qc = useQueryClient();
  const tree = useQuery({ queryKey: ['docs', 'tree'], queryFn: docsApi.tree });
  const [cur, setCur] = useState<Where>('');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<'name' | 'at' | 'size'>('name');
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<Modal | null>(null);
  const [preview, setPreview] = useState<Item | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dropUp, setDropUp] = useState(false);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [overFolder, setOverFolder] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const folders = tree.data?.folders ?? [];
  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const top = folders.find((f) => f.parentId === null);
  const here: Where = cur || top?.id || '';
  const virt = here === 'starred' || here === 'recent';
  const folder = virt ? undefined : byId.get(here);
  const canEdit = !!tree.data?.canEdit;

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  // A folder that disappears (deleted, or no longer open to you) sends you back to the top.
  useEffect(() => {
    if (cur && !virt && tree.data && !byId.has(cur)) setCur('');
  }, [cur, virt, tree.data, byId]);

  const items = useQuery({
    queryKey: ['docs', 'items', here, term],
    queryFn: () => docsApi.items(virt ? { view: here as 'starred' | 'recent', q: term } : { folderId: here, q: term }),
    enabled: !!here,
  });

  const go = (w: Where) => (setCur(w), setSel(new Set()), setQ(''), setTerm(''), setTreeOpen(false));
  const refresh = () => qc.invalidateQueries({ queryKey: ['docs'] });
  const fail = (e: unknown) => setErr(errorText(e));

  const rows = useMemo(() => {
    const list = [...(items.data?.items ?? [])];
    if (here === 'recent') return list;
    const cmp = (a: Item, b: Item) =>
      sort === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : sort === 'at' ? +new Date(b.at) - +new Date(a.at) : (b.size ?? -1) - (a.size ?? -1);
    return list.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'FOLDER' ? -1 : 1) : cmp(a, b)));
  }, [items.data, sort, here]);

  const path = useMemo(() => {
    const out: DocFolder[] = [];
    let f = folder;
    while (f) {
      out.unshift(f);
      f = f.parentId ? byId.get(f.parentId) : undefined;
    }
    return out;
  }, [folder, byId]);

  // ---- actions ----
  const act = useMutation({
    mutationFn: ({ run }: { run: () => Promise<unknown>; done?: string; label?: string }) => run(),
    onSuccess: (_r, v) => (refresh(), v.done && setToast(v.done), setErr(null)),
    onError: fail,
  });
  const run = (fn: () => Promise<unknown>, done?: string) => act.mutate({ run: fn, done });

  const uploadTo = here && !virt ? here : top?.id;
  const addFiles = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (!list.length || !uploadTo) return;
    if (!canEdit) return setErr('You can open these documents but not add to them.');
    setErr(null);
    let ok = 0;
    const problems: string[] = [];
    for (const f of list) {
      try {
        await docsApi.upload(uploadTo, f);
        ok++;
      } catch (e) {
        problems.push(errorText(e));
      }
    }
    refresh();
    if (ok) setToast(`${ok} file${ok > 1 ? 's' : ''} uploaded to ${byId.get(uploadTo)?.name ?? 'the folder'}`);
    if (problems.length) setErr(problems.join(' · '));
  };

  const toggleStar = (it: { id: string; star: boolean }) => run(() => docsApi.star(it.id, !it.star));
  const openItem = (it: Item) => (it.kind === 'FOLDER' ? go(it.id) : setPreview(it));
  const acts = (it: Item): [string, () => void, boolean?][] => [
    ['Open', () => openItem(it)],
    ...(it.kind === 'FILE' ? ([['Download', () => void saveFile(it.id, it.name).catch(fail)]] as [string, () => void][]) : []),
    ...(canEdit
      ? ([
          ['Rename', () => setModal({ kind: 'rename', item: { id: it.id, name: it.name, folder: it.kind === 'FOLDER' } })],
          ['Move', () => setModal({ kind: 'move', ids: [it.id] })],
        ] as [string, () => void][])
      : []),
    [it.star ? 'Remove star' : 'Star', () => toggleStar(it)],
    ...(canEdit ? ([['Delete', () => setModal({ kind: 'delete', ids: [it.id] }), true]] as [string, () => void, boolean][]) : []),
  ];

  // ---- drag & drop ----
  const dragStart = (it: Item) => (e: DragEvent) => {
    if (!canEdit) return e.preventDefault();
    const ids = sel.has(it.id) ? [...sel] : [it.id];
    setDragIds(ids);
    e.dataTransfer.setData('text/plain', ids.join(','));
    e.dataTransfer.effectAllowed = 'move';
  };
  const dropOn = (target: string) => (e: DragEvent) => {
    if (!dragIds) return;
    e.preventDefault();
    const ids = dragIds.filter((x) => x !== target);
    setDragIds(null);
    setOverFolder(null);
    if (ids.length) run(() => docsApi.move(ids, target), `Moved to ${byId.get(target)?.name}`);
  };
  const overOn = (target: string) => (e: DragEvent) => {
    if (dragIds && !dragIds.includes(target)) {
      e.preventDefault();
      setOverFolder(target);
    }
  };

  if (tree.isLoading) return <BlockLoader page label="Loading documents…" />;
  if (tree.isError || !tree.data) return <Alert>{errorText(tree.error)}</Alert>;

  const t = tree.data;
  const usedPct = Math.max(1, Math.round((t.usedBytes / t.quotaBytes) * 100));
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const curName = here === 'starred' ? 'Starred' : here === 'recent' ? 'Recent' : (folder?.name ?? '');
  const accessOf = (k: AccessKey) => t.accessOptions.find((o) => o.value === k)?.label ?? k;

  return (
    <div className="dm-page">
      <aside className={`dm-side${treeOpen ? ' open' : ''}`}>
        <button type="button" className="dm-side-toggle" onClick={() => setTreeOpen((o) => !o)} aria-expanded={treeOpen}>
          <span className="dm-caret">{treeOpen ? I.caretD : I.caretR}</span>
          <span className="dm-fold">{I.folder}</span>
          <b>{curName}</b>
          <span className="dm-muted">Folders</span>
        </button>
        <div className="dm-side-body">
          {(
            [
              ['starred', 'Starred', I.star, t.starredCount],
              ['recent', 'Recent', I.clock, null],
            ] as const
          ).map(([k, l, ic, n]) => (
            <button key={k} type="button" className={`dm-quick${here === k ? ' on' : ''}`} onClick={() => go(k)}>
              <span className="dm-muted">{ic}</span>
              <span style={{ flex: 1 }}>{l}</span>
              {n != null && <span className="dm-n">{n}</span>}
            </button>
          ))}
          <span className="dm-sec">Folders</span>
          <div className="dm-tree" role="tree">
            {top && treeNode(top, 0)}
          </div>
          <div className="dm-usage">
            <div className="dm-bar">
              <div style={{ width: `${usedPct}%` }} />
            </div>
            <span>
              {kb(t.usedBytes)} of {kb(t.quotaBytes)} used
            </span>
          </div>
        </div>
      </aside>

      <section
        className="dm-main"
        onDragOver={(e) => {
          if (!dragIds && canEdit && !virt && Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault();
            setDropUp(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropUp(false);
        }}
        onDrop={(e) => {
          if (dragIds || !Array.from(e.dataTransfer.types).includes('Files')) return;
          e.preventDefault();
          setDropUp(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <div className="dm-head">
          <div className="dm-crumbs">
            {virt ? (
              <h1>{curName}</h1>
            ) : (
              path.map((p, i) =>
                i < path.length - 1 ? (
                  <span key={p.id} className="dm-crumb">
                    <button type="button" onClick={() => go(p.id)}>
                      {p.name}
                    </button>
                    <span>/</span>
                  </span>
                ) : (
                  <h1 key={p.id}>{p.name}</h1>
                ),
              )
            )}
            {folder && !folder.root && canEdit && (
              <>
                <button type="button" className="dfx-icon-btn dm-ib" title="Rename folder" onClick={() => setModal({ kind: 'rename', item: { id: folder.id, name: folder.name, folder: true } })}>
                  {I.edit}
                </button>
                <button type="button" className="dfx-icon-btn dm-ib" title="Delete folder" onClick={() => setModal({ kind: 'delete', ids: [folder.id] })}>
                  {Icon.trash}
                </button>
              </>
            )}
          </div>
          {!virt && canEdit && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ kind: 'newFolder', parent: here })}>
                {I.folderPlus} New folder
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInput.current?.click()}>
                {I.upload} Upload
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = '';
                  void addFiles(files);
                }}
              />
            </>
          )}
        </div>

        <div className="dm-tools">
          <input className="input sm dm-search" value={q} onChange={(e) => (setQ(e.target.value), setSel(new Set()))} placeholder={virt ? 'search all documents…' : `search in ${curName}…`} aria-label="Search" />
          {folder && (
            <label className="dm-acc" title={folder.access ? 'Set on this folder' : `Inherited from ${folder.inheritedFrom || 'All documents'}`}>
              {I.lock}
              {t.canSetAccess ? (
                <select
                  className="input sm"
                  value={folder.access ?? ''}
                  onChange={(e) => {
                    const v = (e.target.value || null) as AccessKey | null;
                    run(() => docsApi.updateFolder(folder.id, { access: v }), `${folder.name} · ${v ? `open to ${accessOf(v)}` : 'now inherits its parent'}`);
                  }}
                  aria-label="Who can open this folder"
                >
                  {!folder.root && <option value="">Inherit · {accessOf(folder.effectiveAccess)}</option>}
                  {t.accessOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <b>{accessOf(folder.effectiveAccess)}</b>
              )}
              <span className="dm-muted dm-acc-sub">{folder.root ? 'Default for all folders' : folder.access ? 'Set on this folder' : `Inherited from ${folder.inheritedFrom || 'All documents'}`}</span>
            </label>
          )}
          <span style={{ flex: 1 }} />
          <span className="dm-muted dm-count">
            {rows.length} item{rows.length === 1 ? '' : 's'}
          </span>
          {here !== 'recent' && (
            <select className="input sm dm-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              <option value="name">Sort: Name</option>
              <option value="at">Sort: Modified</option>
              <option value="size">Sort: Size</option>
            </select>
          )}
          <span className="seg" role="group" aria-label="View">
            {(
              [
                ['list', Icon.list, 'List'],
                ['grid', Icon.grid, 'Grid'],
              ] as const
            ).map(([k, ic, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={view === k}
                title={l}
                onClick={() => {
                  setView(k);
                  try {
                    localStorage.setItem(VIEW_KEY, k);
                  } catch {
                    // not remembered
                  }
                }}
              >
                {ic}
              </button>
            ))}
          </span>
        </div>

        {err && (
          <Alert>
            {err}{' '}
            <button type="button" className="ep-link" onClick={() => setErr(null)}>
              Dismiss
            </button>
          </Alert>
        )}

        {sel.size > 0 && (
          <div className="dm-selbar">
            <b>{sel.size} selected</b>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => rows.filter((r) => sel.has(r.id) && r.kind === 'FILE').forEach((r) => void saveFile(r.id, r.name).catch(fail))}
              disabled={!rows.some((r) => sel.has(r.id) && r.kind === 'FILE')}
            >
              {Icon.download} Download
            </button>
            {canEdit && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'move', ids: [...sel] })}>
                  {I.move} Move
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'delete', ids: [...sel] })}>
                  {Icon.trash} Delete
                </button>
              </>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSel(new Set())}>
              Clear
            </button>
          </div>
        )}

        {items.isLoading ? (
          <BlockLoader label="Loading…" height={220} />
        ) : rows.length === 0 ? (
          <div className="dm-empty">
            {term ? `Nothing matches “${term}”` : here === 'starred' ? 'Star files and folders to find them here' : here === 'recent' ? 'No files yet' : canEdit ? 'This folder is empty · drop files here or use Upload' : 'This folder is empty'}
          </div>
        ) : view === 'list' ? (
          <div className="dm-list" role="table">
            <div className="dm-row dm-row-head" role="row">
              <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all" />
              <span>Name</span>
              <span className="dm-c-size">Size</span>
              <span className="dm-c-at">Modified</span>
              <span className="dm-c-by">Owner</span>
              <span />
            </div>
            {rows.map((r) => (
              <div
                key={r.id}
                role="row"
                className={`dm-row${sel.has(r.id) ? ' sel' : ''}${overFolder === r.id ? ' over' : ''}`}
                draggable={canEdit}
                onDragStart={dragStart(r)}
                onDragEnd={() => (setDragIds(null), setOverFolder(null))}
                onDragOver={r.kind === 'FOLDER' ? overOn(r.id) : undefined}
                onDragLeave={() => setOverFolder(null)}
                onDrop={r.kind === 'FOLDER' ? dropOn(r.id) : undefined}
                onClick={() => openItem(r)}
                style={{ opacity: dragIds?.includes(r.id) ? 0.5 : 1 }}
              >
                <input type="checkbox" checked={sel.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => setSel((s) => toggle(s, r.id))} aria-label={`Select ${r.name}`} />
                <span className="dm-name">
                  <Thumb it={r} />
                  <span className="dm-name-txt">
                    <span>{r.name}</span>
                    {(term || virt) && r.where && <small>{r.where}</small>}
                    <small className="dm-tiny">
                      {r.kind === 'FILE' ? `${kb(r.size)} · ` : ''}
                      {fmtDate(r.at)}
                    </small>
                  </span>
                </span>
                <span className="dm-c-size">{r.kind === 'FILE' ? kb(r.size) : '—'}</span>
                <span className="dm-c-at">{fmtDate(r.at)}</span>
                <span className="dm-c-by">{r.by ?? '—'}</span>
                {rowActions(r)}
              </div>
            ))}
          </div>
        ) : (
          <div className="dm-grid">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`dm-card${sel.has(r.id) ? ' sel' : ''}${overFolder === r.id ? ' over' : ''}`}
                draggable={canEdit}
                onDragStart={dragStart(r)}
                onDragEnd={() => (setDragIds(null), setOverFolder(null))}
                onDragOver={r.kind === 'FOLDER' ? overOn(r.id) : undefined}
                onDragLeave={() => setOverFolder(null)}
                onDrop={r.kind === 'FOLDER' ? dropOn(r.id) : undefined}
                onClick={() => openItem(r)}
                style={{ opacity: dragIds?.includes(r.id) ? 0.5 : 1 }}
              >
                <input className="dm-card-check" type="checkbox" checked={sel.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => setSel((s) => toggle(s, r.id))} aria-label={`Select ${r.name}`} />
                {rowActions(r, true)}
                <Thumb it={r} big />
                <span className="dm-card-name">{r.name}</span>
                <small className="dm-muted">
                  {r.kind === 'FILE' ? `${kb(r.size)} · ` : ''}
                  {fmtDate(r.at)}
                </small>
              </div>
            ))}
          </div>
        )}
        {canEdit && !virt && <span className="dm-tip">Tip: drag files from your computer to upload here · drag items onto a folder to move them.</span>}
        {dropUp && <div className="dm-drop">Drop to upload to {folder?.name}</div>}
      </section>

      {preview && (
        <Preview
          it={preview}
          canEdit={canEdit}
          accessLabel={preview.access}
          onClose={() => setPreview(null)}
          onRename={() => setModal({ kind: 'rename', item: { id: preview.id, name: preview.name, folder: false } })}
          onMove={() => setModal({ kind: 'move', ids: [preview.id] })}
          onDelete={() => setModal({ kind: 'delete', ids: [preview.id] })}
          onError={fail}
        />
      )}
      {modal && (
        <ModalView
          m={modal}
          folders={folders}
          rows={rows}
          onClose={() => setModal(null)}
          onDone={(msg, removed) => {
            setModal(null);
            refresh();
            setToast(msg);
            if (removed) {
              setSel(new Set());
              if (preview && removed.includes(preview.id)) setPreview(null);
              if (folder && removed.includes(folder.id)) go(folder.parentId ?? '');
            } else if (preview) setPreview(null);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );

  // ---- pieces that need the page's state ----
  function treeNode(f: DocFolder, depth: number): ReactNode {
    const kids = folders.filter((x) => x.parentId === f.id);
    const isOpen = depth === 0 || open[f.id] || path.some((p) => p.id === f.id);
    return (
      <div key={f.id} role="none">
        <div
          role="treeitem"
          aria-selected={here === f.id}
          aria-expanded={kids.length ? isOpen : undefined}
          className={`dm-node${here === f.id ? ' on' : ''}${overFolder === f.id ? ' over' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => go(f.id)}
          onDragOver={overOn(f.id)}
          onDragLeave={() => setOverFolder(null)}
          onDrop={dropOn(f.id)}
        >
          <button
            type="button"
            className="dm-caret"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            style={{ visibility: kids.length && depth > 0 ? 'visible' : 'hidden' }}
            onClick={(e) => (e.stopPropagation(), setOpen((o) => ({ ...o, [f.id]: !isOpen })))}
          >
            {isOpen ? I.caretD : I.caretR}
          </button>
          <span className="dm-fold">{I.folder}</span>
          <span className="dm-node-name">{f.name}</span>
          {f.restricted && (
            <span className="dm-muted" title={`Open to ${accessOf(f.effectiveAccess)}`}>
              {I.lock}
            </span>
          )}
          <span className="dm-n">{f.count}</span>
        </div>
        {isOpen && kids.map((k) => treeNode(k, depth + 1))}
      </div>
    );
  }

  function rowActions(it: Item, card?: boolean): ReactNode {
    return (
      <span className={card ? 'dm-card-acts' : 'dm-acts'} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="dfx-icon-btn dm-ib" title={it.star ? 'Remove star' : 'Star'} aria-pressed={it.star} onClick={() => toggleStar(it)}>
          {it.star ? STAR_ON : I.star}
        </button>
        <button type="button" className="dfx-icon-btn dm-ib" title="More actions" aria-haspopup="menu" aria-expanded={menu === it.id} onClick={() => setMenu(menu === it.id ? null : it.id)}>
          {I.more}
        </button>
        {menu === it.id && (
          <>
            <div className="menu-scrim" onClick={() => setMenu(null)} />
            <div className="dm-menu" role="menu">
              {acts(it).map(([l, fn, danger]) => (
                <button key={l} type="button" role="menuitem" className={danger ? 'danger' : undefined} onClick={() => (setMenu(null), fn())}>
                  {l}
                </button>
              ))}
            </div>
          </>
        )}
      </span>
    );
  }
}

const toggle = (s: Set<string>, id: string) => {
  const n = new Set(s);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
};

function Thumb({ it, big }: { it: Item; big?: boolean }) {
  if (it.kind === 'FOLDER') return <span className={`dm-thumb dm-thumb-folder${big ? ' big' : ''}`}>{I.folder}</span>;
  const [l, fg, bg] = badge(it.name);
  return (
    <span className={`dm-thumb${big ? ' big' : ''}`} style={{ color: fg, background: bg }}>
      {l}
    </span>
  );
}

/** Side panel: the file itself (PDFs and images) and its details. */
function Preview({ it, canEdit, accessLabel, onClose, onRename, onMove, onDelete, onError }: { it: Item; canEdit: boolean; accessLabel: string; onClose: () => void; onRename: () => void; onMove: () => void; onDelete: () => void; onError: (e: unknown) => void }) {
  const e = ext(it.name);
  const showable = e === 'pdf' || IMG.includes(e);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!showable) return;
    let u: string | null = null;
    let live = true;
    docsApi
      .content(it.id, true)
      .then((b) => {
        if (!live) return;
        u = URL.createObjectURL(b);
        setUrl(u);
      })
      .catch((x) => live && setFailed(errorText(x)));
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [it.id, showable]);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const [l, fg, bg] = badge(it.name);
  const meta: [string, string][] = [
    ['Type', l + (it.mime ? ` · ${it.mime}` : '')],
    ['Size', kb(it.size)],
    ['Folder', it.where],
    ['Access', accessLabel],
    ['Uploaded by', it.by ?? '—'],
    ['Modified', fmtDate(it.at)],
  ];
  return (
    <div className="dm-prev-scrim" onClick={onClose}>
      <aside className="dm-prev" role="dialog" aria-label={it.name} onClick={(ev) => ev.stopPropagation()}>
        <header>
          <span className="dm-thumb" style={{ color: fg, background: bg }}>
            {l}
          </span>
          <b>{it.name}</b>
          <button type="button" className="dfx-icon-btn" title="Close" onClick={onClose}>
            {Icon.close}
          </button>
        </header>
        <div className="dm-prev-body">
          <div className="dm-prev-media">
            {failed ? (
              <span className="dm-muted">{failed}</span>
            ) : !showable ? (
              <span className="dm-muted">No preview for this file type</span>
            ) : !url ? (
              <span className="dm-muted">Loading preview…</span>
            ) : e === 'pdf' ? (
              <iframe src={url} title={it.name} />
            ) : (
              <img src={url} alt={it.name} />
            )}
          </div>
          <div className="dm-meta">
            {meta.map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <footer>
          {canEdit && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete}>
              {Icon.trash} Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          {canEdit && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onMove}>
                Move
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onRename}>
                Rename
              </button>
            </>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveFile(it.id, it.name).catch(onError)}>
            {Icon.download} Download
          </button>
        </footer>
      </aside>
    </div>
  );
}

/** New folder, rename, move and delete. */
function ModalView({ m, folders, rows, onClose, onDone }: { m: Modal; folders: DocFolder[]; rows: Item[]; onClose: () => void; onDone: (msg: string, removed?: string[]) => void }) {
  const [name, setName] = useState(m.kind === 'newFolder' ? 'New folder' : m.kind === 'rename' ? m.item.name : '');
  const [target, setTarget] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const ids = m.kind === 'move' || m.kind === 'delete' ? m.ids : [];
  const label = (id: string) => byId.get(id)?.name ?? rows.find((r) => r.id === id)?.name ?? 'item';
  const what = ids.length > 1 ? `${ids.length} items` : `“${label(ids[0] ?? '')}”`;
  const isFolder = (id: string) => byId.has(id);
  // A folder can't go inside itself or anything under it.
  const blocked = new Set<string>();
  const under = (id: string) => {
    blocked.add(id);
    folders.filter((f) => f.parentId === id).forEach((f) => under(f.id));
  };
  ids.filter(isFolder).forEach(under);
  const fileCount = ids.reduce((n, id) => n + (isFolder(id) ? (byId.get(id)?.count ?? 0) : 1), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (m.kind === 'newFolder') {
        await docsApi.createFolder(m.parent, name.trim());
        return [`Folder “${name.trim()}” created`] as const;
      }
      if (m.kind === 'rename') {
        await (m.item.folder ? docsApi.updateFolder(m.item.id, { name: name.trim() }) : docsApi.updateFile(m.item.id, { name: name.trim() }));
        return [`Renamed to “${name.trim()}”`] as const;
      }
      if (m.kind === 'move') {
        await docsApi.move(m.ids, target!);
        return [`Moved ${what} to ${byId.get(target!)?.name}`, m.ids] as const;
      }
      await docsApi.remove(m.ids);
      return [`${ids.length > 1 ? `${ids.length} items` : what} deleted`, m.ids] as const;
    },
    onSuccess: (r) => onDone(r[0], r[1] ? [...r[1]] : undefined),
    onError: (e) => setErr(fieldErrors(e).name ?? errorText(e)),
  });
  const ok = () => {
    if ((m.kind === 'newFolder' || m.kind === 'rename') && !name.trim()) return setErr('Enter a name');
    if (m.kind === 'move' && !target) return setErr('Choose a folder');
    save.mutate();
  };

  const pickTree = (id: string, depth: number): ReactNode[] => {
    const f = byId.get(id);
    if (!f) return [];
    const dis = blocked.has(id);
    return [
      <button
        key={id}
        type="button"
        className={`dm-pick${target === id ? ' on' : ''}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        disabled={dis}
        onClick={() => (setTarget(id), setErr(null))}
      >
        <span className="dm-fold">{I.folder}</span>
        {f.name}
      </button>,
      ...folders.filter((k) => k.parentId === id).flatMap((k) => pickTree(k.id, depth + 1)),
    ];
  };
  const top = folders.find((f) => f.parentId === null);

  const title =
    m.kind === 'newFolder' ? 'New folder' : m.kind === 'rename' ? 'Rename' : m.kind === 'move' ? `Move ${what}` : `Delete ${what}?`;
  const sub =
    m.kind === 'newFolder'
      ? `Inside ${byId.get(m.parent)?.name} · it starts open to the same people`
      : m.kind === 'move'
        ? 'Choose a destination folder'
        : m.kind === 'delete'
          ? ids.some(isFolder)
            ? `Folders are deleted with everything inside them · ${fileCount} file${fileCount === 1 ? '' : 's'} in total. This can't be undone.`
            : "This can't be undone."
          : '';
  return (
    <div className="dm-modal-scrim" onClick={onClose}>
      <div className="dm-modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <b>{title}</b>
          {sub && <span>{sub}</span>}
        </header>
        <div className="dm-modal-body">
          {(m.kind === 'newFolder' || m.kind === 'rename') && (
            <>
              <input
                className="input"
                autoFocus
                value={name}
                onChange={(e) => (setName(e.target.value), setErr(null))}
                onKeyDown={(e) => e.key === 'Enter' && ok()}
                onFocus={(e) => {
                  const dot = m.kind === 'rename' && !m.item.folder ? e.target.value.lastIndexOf('.') : -1;
                  e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
                }}
                aria-label="Name"
                aria-invalid={!!err}
              />
            </>
          )}
          {m.kind === 'move' && <div className="dm-picker">{top && pickTree(top.id, 0)}</div>}
          {err && <span className="field-err">{err}</span>}
        </div>
        <footer>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn btn-sm ${m.kind === 'delete' ? 'btn-danger' : 'btn-primary'}`} disabled={save.isPending} onClick={ok}>
            {m.kind === 'newFolder' ? 'Create' : m.kind === 'rename' ? 'Rename' : m.kind === 'move' ? 'Move here' : 'Delete'}
          </button>
        </footer>
      </div>
    </div>
  );
}
