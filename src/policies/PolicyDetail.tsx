import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { Modal } from '../leave/ui';
import { errorText, fieldErrors } from '../lib/http';
import { daysTo, downloadPdf, dueTxt, fmtD, polApi, STATUS, type Detail, type Imported, type Section } from './api';
import { PolicyPage, RichToolbar } from './doc/Doc';
import { buildDoc, diffSecs, PAGE_DEFAULT, parseDoc, type DiffStats, type Page, type SecDiff } from './doc/model';
import { APPLIES, CatChip, CYCLES, DOC_ICON, Toast, useToast } from './shared';

type Tab = 'overview' | 'text' | 'history';
type Confirm = { title: string; text: string; cta: string; danger?: boolean; run: () => Promise<unknown>; done: string; after?: () => void };

const nextMinor = (v: string) => {
  const [a, b] = v.split('.').map(Number);
  return `${a}.${b + 1}`;
};
const daysAgo = (d: string) => Math.max(0, Math.round((Date.now() - +new Date(d)) / 864e5));
const agoTxt = (d: string) => {
  const n = daysAgo(d);
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
};

/** Change pills: "+1 section · 2 edited · +4 / −1 sentences", or "First version". */
export function Pills({ st, first }: { st: DiffStats | null; first?: boolean }) {
  if (first || !st) return <span className="po-pill po-pill-info">First version</span>;
  if (!st.add && !st.del && !st.secAdd && !st.secDel && !st.secEd) return <span className="po-pill po-pill-mute">No changes yet</span>;
  return (
    <span className="po-pills">
      {st.secAdd > 0 && <span className="po-pill po-pill-add">+{st.secAdd} section{st.secAdd > 1 ? 's' : ''}</span>}
      {st.secEd > 0 && <span className="po-pill po-pill-ed">{st.secEd} edited</span>}
      {st.secDel > 0 && <span className="po-pill po-pill-del">−{st.secDel} section{st.secDel > 1 ? 's' : ''}</span>}
      <span className="po-pill po-pill-mute">
        +{st.add} / −{st.del} sentences
      </span>
    </span>
  );
}

/** One policy for HR: overview, the text on paper, history, and the document editor for drafts. */
export function PolicyDetail({ id, onBack, startEditing = false }: { id: string; onBack: () => void; startEditing?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['policies', id], queryFn: () => polApi.detail(id) });
  const [tab, setTab] = useState<Tab>(startEditing ? 'text' : 'overview');
  const [editing, setEditing] = useState(startEditing);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const flush = useRef<(() => Promise<void>) | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['policies'] });
  const act = useMutation({
    mutationFn: (v: { run: () => Promise<unknown>; done: string; after?: () => void }) => v.run(),
    onSuccess: (_r, v) => (refresh(), setToast(v.done), setErr(null), v.after?.()),
    onError: (e) => setErr(errorText(e)),
  });
  const run = (fn: () => Promise<unknown>, done: string, after?: () => void) => act.mutate({ run: fn, done, after });

  if (q.isLoading) return <BlockLoader page label="Loading the policy…" />;
  if (q.isError || !q.data)
    return (
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
  const isEditing = editing && !!dr && p.canManage;
  const edit = () => {
    if (p.archived) return setErr('Restore the policy to edit it.');
    if (dr) return (setEditing(true), setTab('text'));
    run(() => polApi.startDraft(p.id), `Started draft v${cur ? nextMinor(cur.version) : '1.0'}`, () => (setEditing(true), setTab('text')));
  };
  const goTab = async (t: Tab) => {
    if (isEditing && t !== 'text') {
      await flush.current?.();
      setEditing(false);
    }
    setTab(t);
  };
  const publish = async () => {
    await flush.current?.();
    await qc.invalidateQueries({ queryKey: ['policies', id] });
    setPublishing(true);
  };
  const tabs: [Tab, string, number?][] = [
    ['overview', 'Overview'],
    ['text', isEditing ? 'Edit draft' : 'Policy text'],
    ['history', 'History', p.versions.length + (dr ? 1 : 0)],
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
        <span className="po-ic po-ic-lg">{DOC_ICON}</span>
        <div className="po-head-main">
          <div className="po-head-title">
            <h1>{p.name}</h1>
            <span className="mono po-vchip">{cur ? `v${cur.version}` : 'not published'}</span>
            <span className={`pill ${sc}`}>{sl}</span>
            <CatChip c={p.category} />
          </div>
          <span className="po-muted">
            Applies to {p.appliesTo.toLowerCase()} · reviewed every {p.cycleMonths} months
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
          {p.canManage && !p.archived && !isEditing && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={edit}>
              {Icon.sliders} {dr ? 'Edit draft' : 'Edit'}
            </button>
          )}
          {(cur || dr) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadPdf(p.id, p.name, cur ? undefined : 'draft').catch((e) => setErr(errorText(e)))}>
              {Icon.download} Download
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
              !isEditing && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirm({ title: `Delete ${p.name}?`, text: "It has never been published, so nothing is lost but this draft. This can't be undone.", cta: 'Delete', danger: true, run: () => polApi.remove(p.id), done: 'Draft deleted', after: onBack })}
                >
                  Delete
                </button>
              )
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
      {dr && !isEditing && (
        <div className="po-banner">
          <span className="po-banner-t">
            <b>
              Draft v{dr.nextVersion} {dr.inReview ? `· waiting for ${p.approver?.name ?? 'the approver'}` : dr.approved ? '· approved' : 'in progress'}
            </b>
            <small>
              {dr.note || (cur ? 'No change note yet' : 'Initial release')} · last edited {fmtD(dr.updatedAt)}
              {dr.updatedBy ? ` by ${dr.updatedBy}` : ''}
            </small>
          </span>
          <Pills st={cur ? diffSecs(cur.sections, dr.sections).st : null} first={!cur} />
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
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => void goTab(k)}>
            {l}
            {n ? <span className="dfx-count">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview p={p} goTab={(t) => void goTab(t)} run={run} />}
      {tab === 'text' &&
        (isEditing ? (
          <DocEditor
            key={p.id}
            p={p}
            flushRef={flush}
            onPublish={() => void publish()}
            onSaved={() => refresh()}
            onToast={setToast}
            onDiscard={() =>
              setConfirm(
                cur
                  ? { title: 'Discard this draft?', text: `Your changes are lost; employees keep seeing v${cur.version}.`, cta: 'Discard', danger: true, run: () => polApi.discardDraft(p.id), done: 'Draft discarded', after: () => setEditing(false) }
                  : { title: `Delete ${p.name}?`, text: "It has never been published, so nothing is lost but this draft. This can't be undone.", cta: 'Delete', danger: true, run: () => polApi.remove(p.id), done: 'Policy deleted', after: onBack },
              )
            }
            onSubmit={() => run(() => (flush.current?.() ?? Promise.resolve()).then(() => polApi.submit(p.id)), `Sent to ${p.approver?.name} for review`, () => setEditing(false))}
          />
        ) : (
          <TextView p={p} />
        ))}
      {tab === 'history' && <History p={p} />}

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
                  run(c.run, c.done, c.after);
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

// ================================================================== overview

function Overview({ p, goTab, run }: { p: Detail; goTab: (t: Tab) => void; run: (fn: () => Promise<unknown>, done: string) => void }) {
  const cur = p.versions[0];
  const a = p.acks;
  const d = daysTo(p.nextReview);
  const first = p.versions[p.versions.length - 1];
  const last = cur ? { at: cur.publishedAt, by: cur.publishedBy } : p.draft ? { at: p.draft.updatedAt, by: p.draft.updatedBy } : null;
  const pct = a ? Math.round((a.done / Math.max(1, a.total)) * 100) : 0;
  const latest = cur && p.versions[1] ? diffSecs(p.versions[1].sections, cur.sections) : null;
  const stats: [string, ReactNode, ReactNode, boolean?][] = [
    ['Current version', cur ? `v${cur.version}` : '—', cur ? `effective ${fmtD(cur.publishedAt)}` : 'not published yet'],
    ['Revisions', String(p.versions.length), first ? `since ${fmtD(first.publishedAt)}` : 'draft only'],
    ['Last changed', last ? agoTxt(last.at) : '—', last?.by ? `by ${last.by}` : ''],
    [
      'Next review',
      p.nextReview ? fmtD(p.nextReview) : '—',
      p.nextReview ? (
        <>
          {dueTxt(d)}
          {p.canManage && cur && !p.archived && (
            <>
              {' · '}
              <button type="button" className="ep-link" onClick={() => run(() => polApi.reviewed(p.id), 'Marked as reviewed · next review restarts')}>
                Mark reviewed
              </button>
            </>
          )}
        </>
      ) : p.archived ? (
        'archived'
      ) : (
        'after first publish'
      ),
      d != null && d < 0,
    ],
    ['Acknowledged', a ? `${pct}%` : '—', a ? `${a.done} of ${a.total} employees` : p.ackRequired ? 'after first publish' : 'not required'],
  ];
  const lowest = a ? [...a.departments].sort((x, y) => x.done / Math.max(1, x.total) - y.done / Math.max(1, y.total)).slice(0, 3) : [];
  return (
    <div className="po-ov">
      <div className="po-stats">
        {stats.map(([l, v, s, bad]) => (
          <div key={l} className="po-stat">
            <span>{l}</span>
            <b>{v}</b>
            <small className={bad ? 'po-bad' : ''}>{s}</small>
          </div>
        ))}
      </div>
      <Lifecycle p={p} onHistory={() => goTab('history')} />
      <div className="po-two">
        <section className="po-card">
          <header>
            {cur ? `What changed in v${cur.version}` : 'Latest change'}
            {cur && (
              <button type="button" className="ep-link" onClick={() => goTab('history')}>
                View changes
              </button>
            )}
          </header>
          {!cur ? (
            <div className="po-none">Not published yet. Publish the draft to release v1.0.</div>
          ) : !latest ? (
            <div className="po-chg">
              <span className="po-chg-t">
                <b>{cur.note || 'First release'}</b>
                <Pills st={null} first />
              </span>
              <small>
                {cur.publishedBy ?? 'Someone'} · {fmtD(cur.publishedAt)}
              </small>
            </div>
          ) : (
            <div className="po-chg">
              <span className="po-chg-t">
                <b>{cur.note || latest.secs.filter((x) => x.k !== 'same').map((x) => x.h).join(', ') || 'No text changes'}</b>
                <Pills st={latest.st} />
              </span>
              <small>
                {cur.publishedBy ?? 'Someone'} · {fmtD(cur.publishedAt)}
              </small>
            </div>
          )}
        </section>
        <section className="po-card">
          <header>
            Acknowledgement
            {a && p.canManage && a.pending.length > 0 && (
              <button type="button" className="ep-link" onClick={() => run(() => polApi.remind(p.id), `Reminded ${a.pending.length} ${a.pending.length === 1 ? 'person' : 'people'}`)}>
                Send reminder
              </button>
            )}
          </header>
          {a ? (
            <div className="po-ack">
              <span className="po-donut" style={{ background: `conic-gradient(var(--brand) ${pct * 3.6}deg, var(--bg-3) 0)` }}>
                <span>{pct}%</span>
              </span>
              <div className="po-ack-r">
                <small className="po-muted">
                  {a.done} of {a.total} employees · lowest teams
                </small>
                {lowest.map((x) => (
                  <DeptBar key={x.name} name={x.name} done={x.done} total={x.total} />
                ))}
                {a.pending.length > 0 && (
                  <small className="po-muted" title={a.pending.map((x) => x.name).join(', ')}>
                    Waiting on {a.pending.slice(0, 4).map((x) => x.name).join(', ')}
                    {a.pending.length > 4 ? ` and ${a.pending.length - 4} more` : ''}
                  </small>
                )}
              </div>
            </div>
          ) : (
            <div className="po-none">{p.ackRequired ? 'Employees acknowledge a policy once it is published.' : 'This policy doesn’t ask for acknowledgement.'}</div>
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
      <small>{Math.round(r * 100)}%</small>
    </div>
  );
}

/** Versions on a time line, each dot sized by how much changed, with the open draft and the next review. */
function Lifecycle({ p, onHistory }: { p: Detail; onHistory: () => void }) {
  const vs = [...p.versions].reverse();
  const now = Date.now();
  const pts = vs.map((v, i) => {
    const st = i ? diffSecs(vs[i - 1].sections, v.sections).st : null;
    const size = st ? Math.min(22, 10 + Math.sqrt(st.add + st.del + 3 * (st.secAdd + st.secDel))) * 1.4 : 16;
    return { v, t: +new Date(v.publishedAt), size };
  });
  const review = p.nextReview ? +new Date(p.nextReview + 'T00:00:00') : null;
  const draftT = p.draft ? +new Date(p.draft.updatedAt) : null;
  const t0 = Math.min(now, ...(pts.length ? [pts[0].t] : [+new Date(p.createdAt)]));
  const t1 = Math.max(now, review ?? now, draftT ?? now) + 864e5 * 20;
  const x = (t: number) => 3 + ((t - t0) / Math.max(1, t1 - t0)) * 94;
  const years: number[] = [];
  for (let y = new Date(t0).getFullYear() + 1; y <= new Date(t1).getFullYear(); y++) years.push(y);
  const mon = (t: number) => new Date(t).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }).replace(' ', " '");
  return (
    <section className="po-card po-life">
      <header>
        Lifecycle
        <span className="po-legend">
          <span>
            <i className="dot" /> Version · size = change
          </span>
          <span>
            <i className="dot draft" /> Draft
          </span>
          <span>
            <i className="dot review" /> Next review
          </span>
          <button type="button" className="ep-link" onClick={onHistory}>
            Full history
          </button>
        </span>
      </header>
      <div className="po-line">
        <span className="po-axis" />
        {years.map((y) => (
          <span key={y} className="po-year" style={{ left: `${x(+new Date(y, 0, 1))}%` }}>
            {y}
          </span>
        ))}
        <span className="po-today" style={{ left: `${x(now)}%` }}>
          <small>today</small>
        </span>
        {pts.map((pt, i) => (
          <span key={pt.v.id} className={`po-pt${i % 2 ? ' low' : ''}`} style={{ left: `${x(pt.t)}%` }} title={`v${pt.v.version} · ${fmtD(pt.v.publishedAt)}${pt.v.note ? ' · ' + pt.v.note : ''}`}>
            <b>v{pt.v.version}</b>
            <i style={{ width: pt.size, height: pt.size }} />
            <small>{mon(pt.t)}</small>
          </span>
        ))}
        {draftT && p.draft && (
          <span className="po-pt draft" style={{ left: `${x(draftT)}%` }} title={`Draft v${p.draft.nextVersion}`}>
            <b>draft</b>
            <i />
            <small>{mon(draftT)}</small>
          </span>
        )}
        {review && (
          <span className="po-pt review low" style={{ left: `${x(review)}%` }} title={`Next review ${fmtD(p.nextReview)}`}>
            <b>review</b>
            <i />
            <small>{mon(review)}</small>
          </span>
        )}
      </div>
    </section>
  );
}

// ================================================================== policy text (read)

type VerPick = { key: string; label: string; sections: Section[]; ver: string; status: string; effective: string; by: string | null; note: string | null };

function versionsOf(p: Detail): VerPick[] {
  const out: VerPick[] = [];
  if (p.draft) out.push({ key: 'draft', label: `Draft v${p.draft.nextVersion} · not published`, sections: p.draft.sections, ver: `v${p.draft.nextVersion} draft`, status: 'Draft', effective: '—', by: p.draft.updatedBy, note: p.draft.note });
  p.versions.forEach((v, i) =>
    out.push({
      key: v.version,
      label: `v${v.version}${i === 0 ? ' · current' : ''} · ${fmtD(v.publishedAt)}`,
      sections: v.sections,
      ver: `v${v.version}`,
      status: i === 0 ? 'Published' : 'Superseded',
      effective: `${fmtD(v.publishedAt)} → ${i === 0 ? 'today' : fmtD(p.versions[i - 1].publishedAt)}`,
      by: v.publishedBy,
      note: v.note,
    }),
  );
  return out;
}

function TextView({ p }: { p: Detail }) {
  const list = versionsOf(p);
  const [key, setKey] = useState(p.versions[0]?.version ?? 'draft');
  const v = list.find((x) => x.key === key) ?? list[0];
  const pageRef = useRef<HTMLDivElement>(null);
  if (!v) return <div className="po-none">Nothing written yet.</div>;
  const go = (i: number) => pageRef.current?.querySelectorAll('.rt-doc > h2')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const rows: [string, ReactNode][] = [
    ['Status', <span className={v.status === 'Published' ? 'po-ok' : v.status === 'Draft' ? 'po-warn' : ''}>{v.status}</span>],
    ['Effective', v.effective],
    [v.key === 'draft' ? 'Last edited by' : 'Published by', v.by ?? '—'],
    ['Change note', v.note || '—'],
    ['Category', p.category.name],
    ['Owner', p.owner?.name ?? '—'],
    ['Approver', p.approver?.name ?? '—'],
    ['Applies to', p.appliesTo],
    ['Review cycle', `Every ${p.cycleMonths} months`],
    ['Next review', p.nextReview ? `${fmtD(p.nextReview)} · ${dueTxt(daysTo(p.nextReview))}` : '—'],
  ];
  return (
    <div className="po-split">
      <aside className="po-side">
        <section className="po-card">
          <header>Version</header>
          <select className="input sm" value={v.key} onChange={(e) => setKey(e.target.value)} aria-label="Version">
            {list.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <small className="po-muted">
            {v.ver} · {v.status.toLowerCase()}
          </small>
        </section>
        <section className="po-card">
          <header>Details</header>
          <dl className="po-dl">
            {rows.map(([k, val]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="po-card">
          <header>
            Contents <small className="po-muted">{v.sections.length} sections</small>
          </header>
          <ol className="po-toc">
            {v.sections.map((s, i) => (
              <li key={i}>
                <button type="button" onClick={() => go(i)}>
                  {s.heading}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>
      <div ref={pageRef} className="po-paper">
        <PolicyPage readOnly page={p.page ?? PAGE_DEFAULT} body={buildDoc(v.sections)} header={p.header} footer={p.footer} headerRight={p.name} footerLabel={v.ver} />
      </div>
    </div>
  );
}

/** For employees: the published version on paper. */
export function DocReader({ sections, page, header, footer, name, version }: { sections: Section[]; page?: Page; header: string; footer: string; name: string; version: string }) {
  return (
    <div className="po-paper">
      <PolicyPage readOnly page={page ?? PAGE_DEFAULT} body={buildDoc(sections)} header={header} footer={footer} headerRight={name} footerLabel={`v${version}`} />
    </div>
  );
}

// ================================================================== the document editor

function Seg<T extends string>({ value, options, onChange }: { value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <span className="po-seg">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </span>
  );
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

function DocEditor({
  p,
  flushRef,
  onPublish,
  onSaved,
  onToast,
  onDiscard,
  onSubmit,
}: {
  p: Detail;
  flushRef: React.MutableRefObject<(() => Promise<void>) | null>;
  onPublish: () => void;
  onSaved: () => void;
  onToast: (m: string) => void;
  onDiscard: () => void;
  onSubmit: () => void;
}) {
  const dr = p.draft!;
  const cur = p.versions[0];
  const [doc, setDoc] = useState(() => buildDoc(dr.sections));
  const [note, setNote] = useState(dr.note ?? (cur ? '' : 'Initial release'));
  const [state, setState] = useState<SaveState>('saved');
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const latest = useRef({ doc, note });
  latest.current = { doc, note };
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const save = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const secs = parseDoc(latest.current.doc);
    if (!secs.length) {
      setState('error');
      setSaveErr('Add at least one heading (H1) with some text — each H1 starts a section.');
      return;
    }
    setState('saving');
    const job = polApi
      .saveDraft(p.id, secs, latest.current.note.trim())
      .then(() => {
        setState((s) => (s === 'saving' ? 'saved' : s));
        setSaveErr(null);
        setSavedAt(new Date());
        onSaved();
      })
      .catch((e) => {
        setState('error');
        setSaveErr(errorText(e));
      });
    inflight.current = job;
    await job;
  }, [p.id, onSaved]);
  const schedule = useCallback(() => {
    setState('dirty');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 1200);
  }, [save]);
  useEffect(() => {
    flushRef.current = async () => {
      if (timer.current) await save();
      else if (inflight.current) await inflight.current;
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, save]);
  useEffect(
    () => () => {
      if (timer.current) void save();
    },
    [save],
  );
  useEffect(() => {
    if (state !== 'dirty' && state !== 'saving') return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [state]);

  // live change count against the published version (recomputed when typing pauses)
  const [secsNow, setSecsNow] = useState(dr.sections);
  useEffect(() => {
    const t = window.setTimeout(() => setSecsNow(parseDoc(doc)), 400);
    return () => window.clearTimeout(t);
  }, [doc]);
  const st = useMemo(() => (cur ? diffSecs(cur.sections, secsNow).st : null), [cur, secsNow]);

  // settings save straight away (they aren't versioned)
  const qc = useQueryClient();
  const opts = useQuery({ queryKey: ['policies', 'new-options'], queryFn: polApi.newOptions });
  const cats = useQuery({ queryKey: ['policies', 'categories'], queryFn: polApi.categories });
  const [name, setName] = useState(p.name);
  const [page, setPage] = useState<Page>(p.page ?? PAGE_DEFAULT);
  const [setErr, setSetErr] = useState<string | null>(null);
  const patch = useMutation({
    mutationFn: (b: Record<string, unknown>) => polApi.update(p.id, b),
    onSuccess: () => (setSetErr(null), qc.invalidateQueries({ queryKey: ['policies'] })),
    onError: (e) => setSetErr(Object.values(fieldErrors(e))[0] ?? errorText(e)),
  });
  const hfTimer = useRef<Record<string, number>>({});
  const hf = (k: 'header' | 'footer') => (h: string) => {
    window.clearTimeout(hfTimer.current[k]);
    hfTimer.current[k] = window.setTimeout(() => patch.mutate({ [k]: h }), 900);
  };
  const setPg = (np: Page) => (setPage(np), patch.mutate({ page: np }));
  const people = opts.data?.people ?? [];

  // import a PDF or Word file into the draft
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<{ name: string; data: Imported } | null>(null);
  const [impMode, setImpMode] = useState<'replace' | 'append'>('replace');
  const [reading, setReading] = useState(false);
  const [impErr, setImpErr] = useState<string | null>(null);
  const readFile = async (fl: File | undefined) => {
    if (!fl) return;
    setReading(true);
    setImpErr(null);
    try {
      const data = await polApi.importFile(fl);
      setImp({ name: fl.name, data });
      setImpMode(parseDoc(doc).some((x) => x.body.replace(/<[^>]+>/g, '').trim()) ? 'append' : 'replace');
    } catch (e) {
      setImpErr(Object.values(fieldErrors(e))[0] ?? errorText(e));
    } finally {
      setReading(false);
    }
  };
  const applyImport = () => {
    if (!imp) return;
    const add = buildDoc(imp.data.sections);
    setDoc(impMode === 'replace' ? add : doc + add);
    if (!note.trim() || note === 'Initial release') setNote(`Imported from ${imp.name}`);
    setImp(null);
    schedule();
    onToast(`Imported ${imp.data.sections.length} section${imp.data.sections.length === 1 ? '' : 's'} from ${imp.name}`);
  };

  const status = state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Unsaved changes' : state === 'error' ? 'Not saved' : savedAt ? `Saved ${savedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : cur ? 'All changes saved' : 'First version · saved as you type';

  return (
    <div className="po-split po-edit">
      <aside className="po-side">
        <section className="po-card">
          <header>Draft v{dr.nextVersion}</header>
          <Pills st={st} first={!cur} />
          <small className={`po-muted${state === 'error' ? ' po-bad' : ''}`}>{status}</small>
          {saveErr && <small className="po-bad">{saveErr}</small>}
          <label className="po-f">
            <span>Change note</span>
            <input className="input sm" value={note} maxLength={200} placeholder="e.g. Raised carry forward to 12 days" onChange={(e) => (setNote(e.target.value), schedule())} />
          </label>
          <div className="po-acts">
            <button type="button" className="btn btn-primary btn-sm" disabled={state === 'saving'} onClick={onPublish}>
              Publish…
            </button>
            {p.approverId && !dr.inReview && !dr.approved && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onSubmit}>
                Submit for review
              </button>
            )}
          </div>
          <div className="po-acts">
            <button type="button" className="btn btn-ghost btn-sm" disabled={state === 'saving'} onClick={() => void save().then(() => onToast('Draft saved'))}>
              Save draft
            </button>
            <button type="button" className="btn btn-ghost btn-sm po-danger" onClick={onDiscard}>
              {cur ? 'Discard draft' : 'Delete policy'}
            </button>
          </div>
          <button type="button" className="btn btn-secondary btn-sm po-import" disabled={reading} onClick={() => fileRef.current?.click()}>
            {Icon.download} {reading ? 'Reading the file…' : 'Import PDF or Word…'}
          </button>
          <input ref={fileRef} type="file" hidden accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => (void readFile(e.target.files?.[0]), (e.target.value = ''))} />
          {impErr && <small className="po-bad">{impErr}</small>}
        </section>
        <section className="po-card">
          <header>Details</header>
          {setErr && <small className="po-bad">{setErr}</small>}
          <label className="po-f">
            <span>Policy name</span>
            <input className="input sm" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== p.name && patch.mutate({ name: name.trim() })} />
          </label>
          <label className="po-f">
            <span>Category</span>
            <select className="input sm" value={p.category.id} onChange={(e) => patch.mutate({ categoryId: e.target.value })}>
              {(cats.data ?? [p.category]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="po-f">
            <span>Owner</span>
            <select className="input sm" value={p.ownerId ?? ''} onChange={(e) => patch.mutate({ ownerId: e.target.value || null })}>
              <option value="">No owner</option>
              {people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.title ? ` · ${x.title}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="po-f">
            <span>Approver</span>
            <select className="input sm" value={p.approverId ?? ''} onChange={(e) => patch.mutate({ approverId: e.target.value || null })}>
              <option value="">No approver</option>
              {people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.title ? ` · ${x.title}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="po-f">
            <span>Applies to</span>
            <select className="input sm" value={p.appliesTo} onChange={(e) => patch.mutate({ appliesTo: e.target.value })}>
              {[...new Set([p.appliesTo, ...APPLIES])].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="po-f">
            <span>Review cycle</span>
            <select className="input sm" value={p.cycleMonths} onChange={(e) => patch.mutate({ cycleMonths: Number(e.target.value) })}>
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  Every {c} months
                </option>
              ))}
            </select>
          </label>
          <label className="po-check">
            <input type="checkbox" checked={p.ackRequired} onChange={(e) => patch.mutate({ ackRequired: e.target.checked })} />
            Employees must read and acknowledge it
          </label>
        </section>
        <section className="po-card">
          <header>Page setup</header>
          <div className="po-f">
            <span>Paper size</span>
            <Seg value={page.size} options={['A5', 'A4', 'A3', 'Letter', 'Legal']} onChange={(v) => setPg({ ...page, size: v })} />
          </div>
          <div className="po-f">
            <span>Margins</span>
            <Seg value={page.margin} options={['Narrow', 'Normal', 'Wide']} onChange={(v) => setPg({ ...page, margin: v })} />
          </div>
          <div className="po-f">
            <span>Orientation</span>
            <Seg value={page.orient} options={['Portrait', 'Landscape']} onChange={(v) => setPg({ ...page, orient: v })} />
          </div>
          <div className="po-two-f">
            <div className="po-f">
              <span>Logo in header</span>
              <Seg value={page.logo ? 'On' : 'Off'} options={['On', 'Off']} onChange={(v) => setPg({ ...page, logo: v === 'On' })} />
            </div>
            <div className="po-f">
              <span>Watermark</span>
              <Seg value={page.wm ? 'On' : 'Off'} options={['On', 'Off']} onChange={(v) => setPg({ ...page, wm: v === 'On' })} />
            </div>
          </div>
        </section>
      </aside>
      <div className="po-paper">
        <div className="po-tb">
          <RichToolbar />
        </div>
        <PolicyPage
          page={page}
          body={doc}
          onBody={(h) => (setDoc(h), schedule())}
          header={p.header}
          onHeader={hf('header')}
          footer={p.footer}
          onFooter={hf('footer')}
          headerRight={name}
          footerLabel={`v${dr.nextVersion} draft`}
          placeholder="Start with a heading (H1) for the first section, then write — or import a PDF or Word file"
        />
      </div>
      {imp && (
        <Modal
          width={520}
          title={`Import ${imp.name}`}
          sub={`Found ${imp.data.sections.length} section${imp.data.sections.length === 1 ? '' : 's'}${imp.data.pages > 1 ? ` on ${imp.data.pages} pages` : ''}. Check the text after importing; formatting from the file is simplified.`}
          onClose={() => setImp(null)}
          foot={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImp(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={applyImport}>
                Import
              </button>
            </>
          }
        >
          <ol className="po-imp-list">
            {imp.data.sections.map((x, i) => (
              <li key={i}>
                <b>{x.heading}</b>
                <small>{x.body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110) || 'No text'}</small>
              </li>
            ))}
          </ol>
          <div className="po-choice" role="radiogroup" aria-label="Where to put it">
            {(
              [
                ['replace', 'Replace the draft', 'The draft becomes the file’s text'],
                ['append', 'Add to the end', 'Keep what’s written and add these sections after it'],
              ] as const
            ).map(([k, l, sub]) => (
              <button key={k} type="button" role="radio" aria-checked={impMode === k} className={impMode === k ? 'on' : ''} onClick={() => setImpMode(k)}>
                <b>{l}</b>
                <small>{sub}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ================================================================== publish

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
      {cur && <Pills st={diffSecs(cur.sections, dr.sections).st} />}
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

// ================================================================== history

const EV_IC: Record<string, string> = { published: '↑', approved: '✓', submitted: '→', draft: '✎', created: '+', archived: '▣', restored: '↺', reviewed: '✓', settings: '⚙', reminder: '✉', discarded: '✕' };

function History({ p }: { p: Detail }) {
  const list = versionsOf(p);
  const [sel, setSel] = useState(list[0]?.key ?? '');
  const [mode, setMode] = useState<'Changes only' | 'Full text' | 'Document'>('Changes only');
  const idx = list.findIndex((x) => x.key === sel);
  const v = list[idx];
  const older = list.slice(idx + 1).filter((x) => x.key !== 'draft');
  const [cmp, setCmp] = useState<string | null>(null);
  const base = older.find((x) => x.key === cmp) ?? older[0] ?? null;
  const diff = useMemo(() => (v ? diffSecs(base?.sections ?? [], v.sections) : null), [v, base]);
  const pillsFor = (i: number) => {
    const next = list[i + 1];
    return next ? diffSecs(next.sections, list[i].sections).st : null;
  };
  const shown: SecDiff[] = diff ? (mode === 'Changes only' && base ? diff.secs.filter((x) => x.k !== 'same') : diff.secs) : [];
  return (
    <div className="po-hist">
      <section className="po-card po-vers">
        <header>
          Versions <small className="po-muted">{p.versions.length} published</small>
        </header>
        {list.map((x, i) => (
          <button key={x.key} type="button" className={`po-ver${x.key === sel ? ' on' : ''}`} onClick={() => (setSel(x.key), setCmp(null))}>
            <span className={`po-ver-dot${x.key === 'draft' ? ' draft' : ''}`} />
            <span className="po-ver-t">
              <span>
                <b className="mono">{x.key === 'draft' ? `v${p.draft!.nextVersion}` : `v${x.key}`}</b>
                {x.key === 'draft' ? <span className="pill pill-warn">Draft</span> : i === (p.draft ? 1 : 0) ? <span className="pill pill-ok">Current</span> : null}
              </span>
              <span>{x.note || (i === list.length - 1 ? 'Initial release' : '—')}</span>
              <small>
                {x.by ?? 'Someone'} · {x.key === 'draft' ? fmtD(p.draft!.updatedAt) : fmtD(p.versions.find((y) => y.version === x.key)!.publishedAt)}
              </small>
              {i === list.length - 1 ? <span className="po-pill po-pill-info">First release</span> : <Pills st={pillsFor(i)} />}
            </span>
          </button>
        ))}
        {!list.length && <div className="po-none">No versions yet</div>}
      </section>
      <div className="po-hist-r">
        {v && (
          <section className="po-card">
            <header>
              <span>{base ? `${v.ver} compared with ${base.ver}` : `${v.ver} · first release`}</span>
              <span className="po-hist-ctl">
                {older.length > 0 && (
                  <label className="po-muted">
                    compare with{' '}
                    <select className="input sm" value={base?.key ?? ''} onChange={(e) => setCmp(e.target.value)}>
                      {older.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Seg value={mode} options={['Changes only', 'Full text', 'Document']} onChange={setMode} />
              </span>
            </header>
            {mode === 'Document' ? (
              <div className="po-paper">
                <PolicyPage readOnly page={p.page ?? PAGE_DEFAULT} body={buildDoc(v.sections)} header={p.header} footer={p.footer} headerRight={p.name} footerLabel={v.ver} />
              </div>
            ) : (
              <>
                <div className="po-hist-sum">
                  {base ? <Pills st={diff!.st} /> : <span className="po-pill po-pill-info">First release</span>}
                  <span className="po-legend">
                    <span>
                      <i className="sw add" /> added
                    </span>
                    <span>
                      <i className="sw del" /> removed
                    </span>
                  </span>
                </div>
                {shown.length === 0 && <div className="po-none">No text changes between these versions.</div>}
                {shown.map((s) => (
                  <div key={s.h} className="po-dsec">
                    <b>
                      {s.h}
                      {s.k !== 'same' && base && <span className={`po-pill ${s.k === 'added' ? 'po-pill-add' : s.k === 'removed' ? 'po-pill-del' : 'po-pill-ed'}`}>{s.k === 'added' ? 'Added' : s.k === 'removed' ? 'Removed' : 'Edited'}</span>}
                    </b>
                    <p>
                      {s.parts.map((pt, k) => (
                        <span key={k} className={base ? `po-s-${pt.k}` : undefined}>
                          {pt.t}{' '}
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </>
            )}
          </section>
        )}
        <section className="po-card">
          <header>
            Activity log <small className="po-muted">{p.events.length} events</small>
          </header>
          {p.events.map((e, i) => (
            <div key={i} className="po-ev">
              <span className="po-ev-ic">{EV_IC[e.type] ?? '•'}</span>
              <span className="po-ev-t">
                <span>{e.text}</span>
                <small>
                  {e.by} · {fmtD(e.at)}
                </small>
              </span>
              {e.version && <span className="mono po-muted">v{e.version}</span>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

