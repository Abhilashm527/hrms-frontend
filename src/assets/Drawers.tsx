import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { Overlay } from '../components/Overlay';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { assetApi, BADGE, fmtD, type HwDetail, type LicDetail, rupees, saveBlob, statusColor, type TimelineItem, val, WARRANTY } from './api';
import { AssignDialog, RecoverDialog, RepairDialog, RepairedDialog, RetireDialog, SeatDialog } from './Dialogs';
import { AI, fmtSize, Initials, tintOf, typeIcon, useStatusHex } from './ui';

type Done = (msg: string) => void;
const stamp = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const left = (days?: number | null) => {
  if (days == null) return '';
  if (days < 0) return `Expired ${-days} day${days === -1 ? '' : 's'} ago`;
  const y = Math.floor(days / 365);
  const m = Math.round((days % 365) / 30);
  return y ? `${y} yr ${m} mo remaining` : `${days} day${days === 1 ? '' : 's'} remaining`;
};
const W_LABEL: Record<string, string> = { ACTIVE: 'Active', ENDING: 'Ending soon', EXPIRED: 'Expired', NONE: 'Not covered' };

// ------------------------------------------------------------------------------------------------------------- layout

/** The design's detail sheet: 980px from the right under the top bar, header on white, body on grey. */
function Sheet({ onClose, head, tabs, tab, setTab, children }: { onClose: () => void; head: ReactNode; tabs: [string, string][]; tab: string; setTab: (t: string) => void; children: ReactNode }) {
  const [inn, setIn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setIn(true));
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener('keydown', k);
    };
  }, [onClose]);
  return (
    <Overlay>
      <div className="ad-wrap">
        <div className="ad-scrim" style={{ opacity: inn ? 1 : 0 }} onClick={onClose} />
        <div className="ad-sheet" style={{ transform: inn ? 'none' : 'translateX(100%)' }} role="dialog" aria-modal="true">
          <div className="ad-top">
            {head}
            <div className="dfx-tabbar ad-tabs" role="tablist">
              {tabs.map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="ad-body">{children}</div>
        </div>
      </div>
    </Overlay>
  );
}

function Head({ icon, code, pills, title, sub, actions, onClose }: { icon: ReactNode; code: string; pills: ReactNode; title: string; sub: ReactNode; actions: ReactNode; onClose: () => void }) {
  return (
    <div className="ad-head">
      <span className="ad-tile">{icon}</span>
      <div className="ad-id">
        <div>
          <span className="ad-code">{code}</span>
          {pills}
        </div>
        <span className="ad-title">{title}</span>
        <span className="ad-sub">{sub}</span>
      </div>
      <div className="ad-acts">
        {actions}
        <button type="button" className="dfx-icon-btn" onClick={onClose} title="Close">
          {Icon.close}
        </button>
      </div>
    </div>
  );
}
const Pill = ({ c, children, dot = true }: { c: [string, string]; children: ReactNode; dot?: boolean }) => (
  <span className={`ad-pill${dot ? '' : ' cat'}`} style={{ color: c[0], background: c[1] }}>
    {dot && <i style={{ background: c[0] }} />}
    {children}
  </span>
);

function Box({ icon, title, extra, children }: { icon: ReactNode; title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="ad-box">
      <div className="ad-box-h">
        <span className="ic">{icon}</span>
        <b>{title}</b>
        {extra}
      </div>
      {children}
    </div>
  );
}
/** Label above value, in a responsive grid (the design's detail cards). */
function KV({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  return (
    <div className="ad-kv">
      {rows.map((r) => (
        <div key={r.k}>
          <span>{r.k}</span>
          <b>{r.v}</b>
        </div>
      ))}
    </div>
  );
}
/** Label above value, stacked (the narrow side cards). */
function KVStack({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  return (
    <div className="ad-kvs">
      {rows.map((r) => (
        <div key={r.k}>
          <span>{r.k}</span>
          <b>{r.v}</b>
        </div>
      ))}
    </div>
  );
}
const StatusVal = ({ fg, children }: { fg: string; children: ReactNode }) => (
  <span className="ad-stv" style={{ color: fg }}>
    <i style={{ background: fg }} />
    {children}
  </span>
);
const CreatedBy = ({ name }: { name: string | null }) => (
  <div className="ad-by">
    <span>Created by</span>
    <b>
      <span className="dfx-avatar" style={{ width: 22, height: 22, fontSize: 9 }}>
        {(name ?? 'S')
          .split(' ')
          .map((x) => x[0])
          .join('')
          .slice(0, 2)}
      </span>
      {name ?? 'System'}
    </b>
  </div>
);

// ------------------------------------------------------------------------------------------------------------- timeline

type Cat = [string, string, string, ReactNode];
/** Event kind → the design's category: label, fg, bg, icon. */
const HW_CAT = (kind: string): Cat =>
  /ASSIGNED|RECOVERED/.test(kind)
    ? ['Ownership', '#6D28D9', '#EDE9FE', Icon.users]
    : /STATUS|RETIRED|REPAIR/.test(kind)
      ? ['Status', '#BE185D', '#FCE7F3', AI.target]
      : kind === 'FILE'
        ? ['Attachments', '#0F766E', '#CCFBF1', AI.upload]
        : ['General', '#1D4ED8', '#DBEAFE', Icon.file];
const SW_CAT = (kind: string): Cat =>
  /SEAT/.test(kind) ? ['Seats', '#6D28D9', '#EDE9FE', Icon.users] : /RENEW|COST|BILL|TERM/.test(kind) ? ['Billing', '#0F766E', '#CCFBF1', AI.rupee] : ['General', '#1D4ED8', '#DBEAFE', Icon.file];

function TimelineView({ load, csv, cat, chips, name }: { load: (o: string) => Promise<{ items: TimelineItem[] }>; csv: () => Promise<Blob>; cat: (k: string) => Cat; chips: string[]; name: string }) {
  const [q, setQ] = useState('');
  const [chip, setChip] = useState('ALL');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const t = useQuery({ queryKey: ['assets', 'timeline', name, order], queryFn: () => load(order) });
  const items = useMemo(() => {
    const all = t.data?.items ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((x) => (chip === 'ALL' || cat(x.kind)[0].toUpperCase() === chip) && (!needle || `${x.title} ${x.description ?? ''} ${x.by ?? ''}`.toLowerCase().includes(needle)));
  }, [t.data, chip, q, cat]);
  return (
    <div className="ad-tl">
      <div className="ad-tl-bar">
        <label className="dfx-search" style={{ minWidth: 200, flex: 1 }}>
          {Icon.search}
          <input placeholder="search activity…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}>
          {order === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => csv().then((b) => saveBlob(b, `${name}-activity.csv`))}>
          {Icon.download} Download
        </button>
      </div>
      <div className="ad-tl-chips">
        <div className="dfx-filter-row">
          {chips.map((c) => (
            <button key={c} type="button" className={`dfx-chip${chip === c ? ' active' : ''}`} onClick={() => setChip(c)}>
              {c}
            </button>
          ))}
        </div>
        <span>
          {items.length} of {t.data?.items.length ?? 0} events
        </span>
      </div>
      {t.isLoading && <BlockLoader label="Loading activity…" height={120} />}
      <div>
        {items.map((x, i) => {
          const c = cat(x.kind);
          return (
            <div key={i} className="ad-ev">
              <div className="rail">
                <span style={{ background: c[2], color: c[1] }}>{c[3]}</span>
                <i />
              </div>
              <div className="body">
                <div>
                  <b>{x.title}</b>
                  <em style={{ background: c[2], color: c[1] }}>{c[0]}</em>
                </div>
                {(x.description || (x.previous && x.value && x.previous !== x.value)) && (
                  <span>
                    {x.description}
                    {x.previous && x.value && x.previous !== x.value && (
                      <>
                        {' '}
                        <s>{x.previous}</s> → {x.value}
                      </>
                    )}
                  </span>
                )}
                <small>
                  <span>
                    {AI.clock}
                    {stamp(x.at)}
                  </span>
                  <span className="by">
                    {Icon.users}
                    {x.by ?? 'System'}
                  </span>
                </small>
                {x.note && <div className="note">{x.note}</div>}
              </div>
            </div>
          );
        })}
        {t.data && items.length === 0 && <div className="as-empty">No activity matches</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------- hardware

export function HardwareDrawer({ id, onClose, onEdit, toast }: { id: string; onClose: () => void; onEdit: (d: HwDetail) => void; toast: Done }) {
  const q = useQuery({ queryKey: ['assets', 'hw', id], queryFn: () => assetApi.hw(id) });
  const hexOf = useStatusHex();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState('details');
  const [dlg, setDlg] = useState<null | 'assign' | 'recover' | 'repair' | 'repaired' | 'retire'>(null);
  const [err, setErr] = useState<string | null>(null);
  const done: Done = (m) => {
    setDlg(null);
    toast(m);
  };
  const files = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<unknown>; busy: string }) => v.run(),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ['assets', 'hw', id] });
    },
    onError: (e) => setErr(errorText(e)),
  });
  const d = q.data;
  const w = d?.warranty;
  const fgOf = (s?: string) => (s === 'ACTIVE' ? 'var(--success)' : !s || s === 'NONE' ? 'var(--fg-3)' : WARRANTY[s as 'ENDING' | 'EXPIRED'][0]);
  const wFg = fgOf(w?.state);
  const iFg = fgOf(d?.insurance.state);
  const head = d ? (
    <Head
      icon={typeIcon(d.type.name)}
      code={d.tag}
      pills={
        <>
          <Pill c={statusColor(d.status.color, hexOf(d.status.id))}>{d.status.name}</Pill>
          {d.category && (
            <Pill c={tintOf(d.category.name)} dot={false}>
              {d.category.name}
            </Pill>
          )}
          <span className="dfx-type-chip">{d.ownership.name}</span>
        </>
      }
      title={d.model}
      sub={
        <>
          S/N <span className="mono">{d.serial}</span> · {d.location?.name ?? (d.holder ? (d.holder.department ?? 'With employee') : 'IT store')}
        </>
      }
      onClose={onClose}
      actions={
        <>
          {d.can.repair && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDlg('repair')}>
              Send for repair
            </button>
          )}
          {d.can.repaired && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDlg('repaired')}>
              Mark repaired
            </button>
          )}
          {d.can.recover && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDlg('recover')}>
              Recover
            </button>
          )}
          {d.can.assign && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setDlg('assign')}>
              Assign
            </button>
          )}
          {d.can.edit && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(d)}>
              {AI.edit} Edit
            </button>
          )}
        </>
      }
    />
  ) : (
    <Head icon={AI.box} code="" pills={null} title="Loading…" sub="" actions={null} onClose={onClose} />
  );
  const basic = d
    ? [
        { k: 'Category', v: d.category?.name ?? '—' },
        { k: 'Type', v: d.type.name },
        { k: 'Make & model', v: d.model },
        { k: 'Serial number', v: d.serial },
        { k: 'Asset tag', v: d.tag },
        { k: 'Ownership', v: d.ownership.name },
        { k: 'Location', v: d.location?.name ?? '—' },
        ...(d.purchaseCost !== undefined ? [{ k: 'Purchase cost', v: d.purchaseCost == null ? '—' : rupees(d.purchaseCost) }] : []),
        ...d.basic.filter((b) => ['Purchase date', 'Vendor', 'Invoice', 'Age'].includes(b.k)).map((b) => ({ k: b.k, v: val(b.v) })),
      ]
    : [];
  return (
    <Sheet
      onClose={onClose}
      head={head}
      tab={tab}
      setTab={setTab}
      tabs={[
        ['details', 'Details'],
        ['coverage', 'Coverage'],
        ['timeline', 'Timeline'],
      ]}
    >
      {q.isLoading && <BlockLoader label="Opening the asset…" height={240} />}
      {q.isError && <Alert>{errorText(q.error)}</Alert>}
      {err && <Alert>{err}</Alert>}
      {d && tab === 'details' && (
        <div className="ad-cols">
          <div>
            <Box icon={Icon.file} title="Basic information">
              <KV rows={basic} />
            </Box>
            {d.specs.length > 0 && (
              <Box icon={Icon.settings} title="Technical specifications">
                <KV rows={d.specs.map((s) => ({ k: s.k, v: val(s.v) }))} />
              </Box>
            )}
            <Box
              icon={AI.upload}
              title="Attachments"
              extra={
                d.can.edit && (
                  <label className="ad-upload">
                    {Icon.plus}Upload
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) files.mutate({ run: () => assetApi.hwUpload(id, file), busy: 'Uploading…' });
                      }}
                    />
                  </label>
                )
              }
            >
              <div className="ad-pad">
                {d.files.length ? (
                  <div className="ad-files">
                    {d.files.map((f) => (
                      <div key={f.id}>
                        <span className="fi">{Icon.file}</span>
                        <span>
                          <b>{f.name}</b>
                          <small>{fmtSize(f.size)}</small>
                        </span>
                        <button type="button" className="dfx-icon-btn" title="Download" onClick={() => assetApi.hwFile(id, f.id).then((b) => saveBlob(b, f.name), (e) => setErr(errorText(e)))}>
                          {Icon.download}
                        </button>
                        {d.can.edit && (
                          <button type="button" className="dfx-icon-btn" title="Remove" onClick={() => files.mutate({ run: () => assetApi.hwFileDelete(id, f.id), busy: 'Removing…' })}>
                            {Icon.trash}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ad-none">No attachments yet</div>
                )}
              </div>
            </Box>
          </div>
          <div>
            <Box icon={Icon.users} title="Assigned to">
              <div className="ad-pad">
                {d.holder ? (
                  <div className="ad-holder">
                    <div>
                      <Initials name={d.holder.name} initials={d.holder.initials} size={44} />
                      <span>
                        <b>{d.holder.name}</b>
                        <span>{[d.holder.title, d.holder.department].filter(Boolean).join(' · ')}</span>
                        {d.holder.since && <small>Since {fmtD(d.holder.since)}</small>}
                      </span>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => nav(`/employees/${d.holder!.id}`)}>
                      View profile
                    </button>
                  </div>
                ) : (
                  <div className="ad-holder none">
                    <span>{d.retiredOn ? `Retired ${fmtD(d.retiredOn)}${d.retireReason ? ` · ${d.retireReason.replace(/_/g, ' ').toLowerCase()}` : ''}` : 'Not assigned to anyone.'}</span>
                    {d.can.assign && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setDlg('assign')}>
                        Assign
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Box>
            <Box icon={Icon.check} title="Warranty">
              <div className="ad-pad ad-meter">
                {w && w.state !== 'NONE' ? (
                  <>
                    <div>
                      <StatusVal fg={wFg}>{W_LABEL[w.state]}</StatusVal>
                      <span>until {fmtD(w.until)}</span>
                    </div>
                    <span className="bar">
                      <i style={{ width: `${w.pctUsed ?? (w.state === 'EXPIRED' ? 100 : 50)}%`, background: wFg }} />
                    </span>
                    <div className="foot">
                      <span>{w.from ? fmtD(w.from) : ''}</span>
                      <span>{left(w.daysLeft)}</span>
                    </div>
                  </>
                ) : (
                  <span className="as-muted">No warranty recorded</span>
                )}
              </div>
            </Box>
            <Box icon={AI.clock} title="Admin activity">
              <div className="ad-pad ad-col">
                <KVStack
                  rows={[
                    { k: 'Last updated', v: stamp(d.admin.updatedAt ?? d.admin.createdAt) },
                    { k: 'Created on', v: stamp(d.admin.createdAt) },
                    ...(d.refreshDue ? [{ k: 'Refresh due', v: fmtD(d.refreshDue) }] : []),
                  ]}
                />
                <CreatedBy name={d.admin.createdBy} />
                {d.can.retire && (
                  <button type="button" className="btn btn-danger btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setDlg('retire')}>
                    Retire asset
                  </button>
                )}
              </div>
            </Box>
          </div>
        </div>
      )}
      {d && tab === 'coverage' && (
        <div className="ad-cov">
          <div className="full">
            <Box icon={Icon.users} title={`${d.ownership.name} ownership`} extra={<span className="dfx-type-chip">{d.ownership.name}</span>}>
              {d.ownership.fields.length || d.returnDue ? (
                <KV rows={[...d.ownership.fields.map((f) => ({ k: f.k, v: val(f.v) })), ...(d.returnDue ? [{ k: 'Return due', v: fmtD(d.returnDue) }] : [])]} />
              ) : (
                <div className="ad-none plain">No ownership details captured</div>
              )}
            </Box>
          </div>
          <Box icon={Icon.check} title="Warranty coverage">
            <KV
              rows={[
                { k: 'Warranty status', v: <StatusVal fg={wFg}>{W_LABEL[w?.state ?? 'NONE']}</StatusVal> },
                { k: 'Warranty expires', v: w?.until ? fmtD(w.until) : '—' },
                { k: 'Time remaining', v: w?.until ? left(w.daysLeft).replace(' remaining', '') : '—' },
              ]}
            />
          </Box>
          <Box icon={AI.building} title="Insurance coverage">
            <KV
              rows={[
                { k: 'Insurance status', v: <StatusVal fg={iFg}>{d.insurance.state === 'EXPIRED' ? 'Lapsed' : W_LABEL[d.insurance.state]}</StatusVal> },
                { k: 'Provider', v: d.insurance.insurer ?? '—' },
                { k: 'Policy number', v: d.insurance.policyNo ?? '—' },
                { k: 'Policy expires', v: d.insurance.until ? fmtD(d.insurance.until) : '—' },
              ]}
            />
          </Box>
        </div>
      )}
      {d && tab === 'timeline' && (
        <TimelineView name={d.tag} load={(order) => assetApi.hwTimeline(id, { order })} csv={() => assetApi.hwTimelineCsv(id)} cat={HW_CAT} chips={['ALL', 'GENERAL', 'OWNERSHIP', 'STATUS', 'ATTACHMENTS']} />
      )}
      {d && dlg === 'assign' && <AssignDialog asset={d} onClose={() => setDlg(null)} onDone={done} />}
      {d && dlg === 'recover' && <RecoverDialog asset={d} holder={d.holder?.name} onClose={() => setDlg(null)} onDone={done} />}
      {d && dlg === 'repair' && <RepairDialog asset={d} assigned={!!d.holder} onClose={() => setDlg(null)} onDone={done} />}
      {d && dlg === 'repaired' && <RepairedDialog asset={d} onClose={() => setDlg(null)} onDone={done} />}
      {d && dlg === 'retire' && <RetireDialog asset={d} onClose={() => setDlg(null)} onDone={done} />}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------------------- software

export function LicenseDrawer({ id, onClose, onEdit, toast }: { id: string; onClose: () => void; onEdit: (d: LicDetail) => void; toast: Done }) {
  const q = useQuery({ queryKey: ['assets', 'sw', id], queryFn: () => assetApi.sw(id) });
  const [tab, setTab] = useState('overview');
  const [seatQ, setSeatQ] = useState('');
  const seats = useQuery({ queryKey: ['assets', 'sw', id, 'seats', seatQ], queryFn: () => assetApi.swSeats(id, seatQ || undefined), enabled: tab === 'seats' });
  const [dlg, setDlg] = useState<null | 'assign' | 'add'>(null);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const nav = useNavigate();
  const act = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<unknown>; busy: string; done: string }) => v.run(),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast(v.done);
      setErr(null);
    },
    onError: (e) => setErr(errorText(e)),
  });
  const d = q.data;
  const done: Done = (m) => {
    setDlg(null);
    toast(m);
  };
  const monthly = d?.cost.billing.toUpperCase() === 'MONTHLY';
  const free = d?.free ?? null;
  const perYear = d ? (monthly ? d.cost.perSeat * 12 : d.cost.perSeat) : 0;
  const util = d?.utilPct ?? 0;
  const renewFg = d?.daysToRenew != null && d.daysToRenew <= 45 ? 'var(--warning)' : 'var(--fg-2)';
  const head = d ? (
    <Head
      icon={AI.apps}
      code={d.lid}
      pills={
        <>
          <Pill c={BADGE[d.state.badge] ?? BADGE.paused}>{d.state.label.charAt(0).toUpperCase() + d.state.label.slice(1)}</Pill>
          <Pill c={d.category.color} dot={false}>
            {d.category.name}
          </Pill>
          <span className="dfx-type-chip">{d.type.name}</span>
        </>
      }
      title={d.name}
      sub={`${d.vendor ?? '—'} · ${d.cost.billing} billing · ${d.type.unit.toLowerCase()}`}
      onClose={onClose}
      actions={
        <>
          {d.can.addSeats && d.seats != null && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDlg('add')}>
              {Icon.plus} Add seats
            </button>
          )}
          {d.can.assignSeat && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setDlg('assign')}>
              {Icon.userPlus} Assign seat
            </button>
          )}
          {d.can.edit && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(d)}>
              {AI.edit} Edit
            </button>
          )}
        </>
      }
    />
  ) : (
    <Head icon={AI.apps} code="" pills={null} title="Loading…" sub="" actions={null} onClose={onClose} />
  );
  return (
    <Sheet
      onClose={onClose}
      head={head}
      tab={tab}
      setTab={setTab}
      tabs={[
        ['overview', 'Overview'],
        ['seats', 'Seats'],
        ['timeline', 'Timeline'],
      ]}
    >
      {q.isLoading && <BlockLoader label="Opening the license…" height={240} />}
      {q.isError && <Alert>{errorText(q.error)}</Alert>}
      {err && <Alert>{err}</Alert>}
      {d && tab === 'overview' && (
        <div className="ad-cols">
          <div>
            <Box icon={Icon.file} title="License information">
              <KV
                rows={[
                  { k: 'Application', v: d.name },
                  { k: 'Vendor', v: d.vendor ?? '—' },
                  { k: 'Category', v: d.category.name },
                  { k: 'License type', v: d.type.name },
                  { k: 'Billing', v: d.cost.billing },
                  { k: 'Counted', v: d.type.unit },
                  { k: 'License ID', v: d.lid },
                  { k: 'Contract start', v: d.termStart ? fmtD(d.termStart) : '—' },
                  { k: 'License owner', v: d.owner?.name ?? '—' },
                ]}
              />
            </Box>
            <Box icon={Icon.settings} title={`${d.category.name} details`}>
              {d.specs.length ? <KV rows={d.specs.map((s) => ({ k: s.k, v: val(s.v) }))} /> : <div className="ad-none plain">No custom fields for this category</div>}
            </Box>
            <Box icon={AI.rupee} title="Cost">
              <KV
                rows={[
                  { k: 'Cost per seat', v: `${rupees(d.cost.perSeat)}${monthly ? ' / month' : ' / year'}` },
                  { k: 'Annual cost', v: rupees(d.cost.annual) },
                  { k: 'Monthly cost', v: rupees(d.cost.monthly) },
                  { k: 'Idle seat cost', v: free && free > 0 ? `${rupees(free * perYear)} / year` : '—' },
                ]}
              />
            </Box>
          </div>
          <div>
            <Box icon={Icon.users} title="Seat utilisation">
              <div className="ad-pad ad-meter">
                <div className="big">
                  <b>{d.used}</b>
                  <span>/ {d.seats ?? '∞'} seats</span>
                </div>
                <span className="bar lg">
                  <i style={{ width: `${d.seats == null ? 100 : util}%`, background: d.seats != null && util < 60 ? '#F59E0B' : 'var(--brand)' }} />
                </span>
                <div className="foot2">
                  <span>{d.seats == null ? 'Site-wide' : `${util}% utilised`}</span>
                  <b style={{ color: free === 0 ? 'var(--danger)' : 'var(--success)' }}>{free == null ? 'Unlimited' : free > 0 ? `${free} seat${free > 1 ? 's' : ''} free` : 'No free seats'}</b>
                </div>
              </div>
            </Box>
            <Box icon={Icon.cal} title="Renewal">
              <div className="ad-pad ad-meter">
                {d.renewal.date ? (
                  <>
                    <div>
                      <b>{fmtD(d.renewal.date)}</b>
                      <em style={{ color: renewFg }}>{d.renewal.daysLeft != null && d.renewal.daysLeft < 0 ? `Expired ${-d.renewal.daysLeft} days ago` : `${d.renewal.daysLeft} days left`}</em>
                    </div>
                    <span className="bar">
                      <i style={{ width: `${d.renewal.pctElapsed ?? 0}%` }} />
                    </span>
                    <div className="foot">
                      <span>{d.renewal.termStart ? fmtD(d.renewal.termStart) : ''}</span>
                      <span>{fmtD(d.renewal.date)}</span>
                    </div>
                  </>
                ) : (
                  <span className="as-muted">No renewal date (one-time or free license)</span>
                )}
                <div className="auto">
                  <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-checked={d.autoRenew}
                    disabled={!d.can.edit}
                    onClick={() => act.mutate({ run: () => assetApi.swAutoRenew(id, !d.autoRenew), busy: 'Saving…', done: d.autoRenew ? 'Auto-renew off' : 'Auto-renew on' })}
                  />
                  <span>{d.autoRenew ? 'Auto-renews' : 'Renews manually'}</span>
                  {d.can.renew && d.renewal.date && (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        act.mutate({ run: () => assetApi.swRenew(id), busy: 'Renewing…', done: `${d.name} renewed for another term` });
                      }}
                    >
                      Renew now
                    </a>
                  )}
                </div>
              </div>
            </Box>
            <Box icon={AI.clock} title="Admin activity">
              <div className="ad-pad ad-col">
                <KVStack
                  rows={[
                    { k: 'Last updated', v: stamp(d.admin.updatedAt ?? d.admin.createdAt) },
                    { k: 'Created on', v: stamp(d.admin.createdAt) },
                  ]}
                />
                <CreatedBy name={d.admin.createdBy} />
              </div>
            </Box>
          </div>
        </div>
      )}
      {d && tab === 'seats' && (
        <div className="ad-box">
          <div className="ad-seat-bar">
            <label className="dfx-search" style={{ minWidth: 200, flex: 1 }}>
              {Icon.search}
              <input placeholder="search seat holders…" value={seatQ} onChange={(e) => setSeatQ(e.target.value)} />
            </label>
            <span>
              {d.used} of {d.seats ?? '∞'} seats assigned
            </span>
            {d.can.assignSeat && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setDlg('assign')}>
                {Icon.plus} Assign seat
              </button>
            )}
          </div>
          <div className="as-thead" style={{ gridTemplateColumns: 'minmax(220px,1.4fr) minmax(120px,1fr) 120px 90px' }}>
            <span>Seat holder</span>
            <span>Department</span>
            <span>Assigned on</span>
            <span />
          </div>
          {seats.data?.map((h) => (
            <div key={h.id} className="as-trow" style={{ gridTemplateColumns: 'minmax(220px,1.4fr) minmax(120px,1fr) 120px 90px' }}>
              <button type="button" className="as-who" onClick={() => nav(`/employees/${h.id}`)}>
                <Initials name={h.name} initials={h.initials} />
                <span className="as-who-t">
                  <b>{h.name}</b>
                  <small>{h.title ?? h.code}</small>
                </span>
              </button>
              <span>{h.department ?? '—'}</span>
              <span>{fmtD(h.assignedOn)}</span>
              <span className="as-acts">
                {d.can.assignSeat && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ run: () => assetApi.swRevoke(id, h.id), busy: 'Revoking…', done: `Seat revoked from ${h.name}` })}>
                    Revoke
                  </button>
                )}
              </span>
            </div>
          ))}
          {seats.data?.length === 0 && <div className="as-empty">No seat holders</div>}
          {free != null && free > 0 && (
            <div className="ad-freerow">
              {free} unassigned seat{free > 1 ? 's' : ''} · {rupees(free * perYear)} / year idle
            </div>
          )}
        </div>
      )}
      {d && tab === 'timeline' && <TimelineView name={d.lid} load={() => assetApi.swTimeline(id, {})} csv={() => assetApi.swTimelineCsv(id)} cat={SW_CAT} chips={['ALL', 'GENERAL', 'SEATS', 'BILLING']} />}
      {d && dlg && <SeatDialog lic={{ ...d, perSeat: d.cost.perSeat, billing: d.cost.billing }} mode={dlg} onClose={() => setDlg(null)} onDone={done} />}
    </Sheet>
  );
}
