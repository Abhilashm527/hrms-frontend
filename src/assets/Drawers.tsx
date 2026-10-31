import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { Drawer } from '../onboarding/shared';
import { assetApi, fmtD, type HwDetail, type LicDetail, rupees, saveBlob, type Timeline, val, WARRANTY } from './api';
import { AssignDialog, RecoverDialog, RepairDialog, RepairedDialog, RetireDialog, SeatDialog } from './Dialogs';
import { fmtSize, StateBadge, StatusBadge, TypeChip, Who } from './ui';

type Done = (msg: string) => void;
const stamp = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function Section({ icon, title, extra, children }: { icon: React.ReactNode; title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="as-sec">
      <header>
        <span className="ic">{icon}</span>
        <b>{title}</b>
        {extra}
      </header>
      {children}
    </section>
  );
}
function Rows({ rows }: { rows: { k: string; v: unknown }[] }) {
  return (
    <dl className="as-dl">
      {rows.map((r) => (
        <div key={r.k}>
          <dt>{r.k}</dt>
          <dd>{val(r.v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TimelineView({ load, csv, chips, name }: { load: (f: { q?: string; kind?: string; order?: string }) => Promise<Timeline>; csv: () => Promise<Blob>; chips: [string, string][]; name: string }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const t = useQuery({ queryKey: ['assets', 'timeline', name, q, kind, order], queryFn: () => load({ q: q || undefined, kind: kind || undefined, order }) });
  return (
    <div className="as-tl">
      <div className="as-tl-bar">
        <label className="dfx-search">
          {Icon.search}
          <input placeholder="search activity…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}>
          {order === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => csv().then((b) => saveBlob(b, `${name}-timeline.csv`))}>
          {Icon.download} Download
        </button>
      </div>
      <div className="as-chips">
        {chips.map(([k, l]) => (
          <button key={k} type="button" className={`dfx-chip${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>
            {l}
          </button>
        ))}
        <span className="as-muted">{t.data ? `${t.data.count} event${t.data.count === 1 ? '' : 's'}` : ''}</span>
      </div>
      {t.isLoading && <BlockLoader label="Loading activity…" height={120} />}
      <ol className="as-tl-list">
        {t.data?.items.map((x, i) => (
          <li key={i}>
            <span className={`dot k-${x.kind.toLowerCase()}`} />
            <div>
              <b>
                {x.title}
                <em>{x.kind.replace(/_/g, ' ').toLowerCase()}</em>
              </b>
              {(x.description || (x.previous && x.value && x.previous !== x.value)) && (
                <span>
                  {x.description}
                  {x.previous && x.value && x.previous !== x.value ? ` ${x.previous} → ${x.value}` : ''}
                </span>
              )}
              <small>
                {stamp(x.at)} · {x.by ?? 'System'}
              </small>
              {x.note && <q>{x.note}</q>}
            </div>
          </li>
        ))}
      </ol>
      {t.data && t.data.items.length === 0 && <div className="as-empty sm">No activity matches</div>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------- hardware

export function HardwareDrawer({ id, onClose, onEdit, toast }: { id: string; onClose: () => void; onEdit: (d: HwDetail) => void; toast: Done }) {
  const q = useQuery({ queryKey: ['assets', 'hw', id], queryFn: () => assetApi.hw(id) });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<'details' | 'coverage' | 'timeline'>('details');
  const [dlg, setDlg] = useState<null | 'assign' | 'recover' | 'repair' | 'repaired' | 'retire'>(null);
  const [err, setErr] = useState<string | null>(null);
  const done: Done = (m) => {
    setDlg(null);
    toast(m);
  };
  const files = useMutation({
    meta: { busy: (v: unknown) => ((v as { busy: string }).busy) },
    mutationFn: (v: { run: () => Promise<unknown>; busy: string }) => v.run(),
    onSuccess: () => (setErr(null), qc.invalidateQueries({ queryKey: ['assets', 'hw', id] })),
    onError: (e) => setErr(errorText(e)),
  });
  const d = q.data;
  const w = d?.warranty;
  return (
    <Drawer
      width={760}
      title={
        d ? (
          <span className="as-dh">
            <b>{d.tag}</b>
            <StatusBadge s={d.status} />
            {d.category && <span className="as-muted">{d.category.name}</span>}
            <TypeChip name={d.ownership.name} />
          </span>
        ) : (
          'Asset'
        )
      }
      sub={d ? `${d.model} · S/N ${d.serial}${d.location ? ` · ${d.location.name}` : ''}` : undefined}
      onClose={onClose}
      actions={
        d && (
          <span className="as-dacts">
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
                Edit
              </button>
            )}
          </span>
        )
      }
    >
      {q.isLoading && <BlockLoader label="Opening the asset…" height={240} />}
      {q.isError && <Alert>{errorText(q.error)}</Alert>}
      {err && <Alert>{err}</Alert>}
      {d && (
        <>
          <div className="dfx-tabbar" role="tablist">
            {(
              [
                ['details', 'Details'],
                ['coverage', 'Coverage'],
                ['timeline', 'Timeline'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === 'details' && (
            <div className="as-grid2">
              <Section icon={Icon.file} title="Basic information">
                <Rows rows={d.basic.map((r) => ({ k: r.k, v: r.k === 'Purchase cost' && r.v != null ? rupees(Number(r.v)) : r.v }))} />
              </Section>
              <Section icon={Icon.users} title="Assigned to">
                {d.holder ? (
                  <div className="as-holder">
                    <Who p={d.holder} sub={`${[d.holder.title, d.holder.department].filter(Boolean).join(' · ')}${d.holder.since ? ` · since ${fmtD(d.holder.since)}` : ''}`} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => nav(`/employees/${d.holder!.id}`)}>
                      View profile
                    </button>
                  </div>
                ) : (
                  <div className="as-holder">
                    <span className="as-muted">{d.retiredOn ? `Retired ${fmtD(d.retiredOn)}${d.retireReason ? ` · ${d.retireReason.replace(/_/g, ' ').toLowerCase()}` : ''}` : 'Not assigned to anyone.'}</span>
                    {d.can.assign && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setDlg('assign')}>
                        Assign
                      </button>
                    )}
                  </div>
                )}
              </Section>
              {d.specs.length > 0 && (
                <Section icon={Icon.settings} title="Technical specifications">
                  <Rows rows={d.specs} />
                </Section>
              )}
              <Section icon={Icon.check} title="Warranty">
                {w && w.state !== 'NONE' ? (
                  <div className="as-war">
                    <span style={{ color: WARRANTY[w.state][0] }}>
                      <b>{w.state === 'EXPIRED' ? 'Expired' : w.state === 'ENDING' ? 'Ending soon' : 'Active'}</b> until {fmtD(w.until)}
                    </span>
                    {w.pctUsed != null && (
                      <span className="as-meter">
                        <i style={{ width: `${w.pctUsed}%`, background: WARRANTY[w.state][0] }} />
                      </span>
                    )}
                    <small>
                      {w.from ? `From ${fmtD(w.from)} · ` : ''}
                      {w.daysLeft != null && w.daysLeft >= 0 ? `${w.daysLeft} days left` : 'Expired'}
                    </small>
                  </div>
                ) : (
                  <span className="as-muted">No warranty recorded</span>
                )}
              </Section>
              <Section
                icon={Icon.file}
                title="Attachments"
                extra={
                  d.can.edit && (
                    <label className="btn btn-ghost btn-sm as-up">
                      {Icon.plus} Upload
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
                {d.files.length === 0 && <span className="as-muted">No attachments yet</span>}
                {d.files.map((f) => (
                  <div key={f.id} className="as-file">
                    {Icon.file}
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
              </Section>
              <Section icon={Icon.refresh} title="Admin activity">
                <Rows
                  rows={[
                    { k: 'Created', v: stamp(d.admin.createdAt) },
                    { k: 'Created by', v: d.admin.createdBy },
                    { k: 'Last updated', v: stamp(d.admin.updatedAt) },
                    { k: 'Updated by', v: d.admin.updatedBy },
                    ...(d.refreshDue ? [{ k: 'Refresh due', v: d.refreshDue }] : []),
                  ]}
                />
                {d.can.retire && (
                  <button type="button" className="btn btn-danger btn-sm as-retire" onClick={() => setDlg('retire')}>
                    Retire asset
                  </button>
                )}
              </Section>
            </div>
          )}
          {tab === 'coverage' && (
            <div className="as-grid2">
              <Section icon={Icon.users} title={`${d.ownership.name} ownership`}>
                {d.ownership.fields.length ? <Rows rows={d.ownership.fields} /> : <span className="as-muted">No ownership details captured</span>}
                {d.returnDue && <Rows rows={[{ k: 'Return due', v: d.returnDue }]} />}
              </Section>
              <Section icon={Icon.check} title="Warranty coverage">
                <Rows
                  rows={[
                    { k: 'Status', v: w?.state === 'NONE' ? 'Not covered' : w?.state === 'EXPIRED' ? 'Expired' : w?.state === 'ENDING' ? 'Ending soon' : 'Active' },
                    { k: 'From', v: w?.from },
                    { k: 'Until', v: w?.until },
                  ]}
                />
              </Section>
              <Section icon={Icon.shield} title="Insurance coverage">
                <Rows
                  rows={[
                    { k: 'Status', v: d.insurance.state === 'NONE' ? 'Not insured' : d.insurance.state === 'EXPIRED' ? 'Expired' : d.insurance.state === 'ENDING' ? 'Ending soon' : 'Active' },
                    { k: 'Insurer', v: d.insurance.insurer },
                    { k: 'Policy number', v: d.insurance.policyNo },
                    { k: 'Insured until', v: d.insurance.until },
                  ]}
                />
              </Section>
            </div>
          )}
          {tab === 'timeline' && (
            <TimelineView
              name={d.tag}
              load={(f) => assetApi.hwTimeline(id, f)}
              csv={() => assetApi.hwTimelineCsv(id)}
              chips={[
                ['', 'All'],
                ['ASSIGNMENT', 'Assignment'],
                ['STATUS', 'Status'],
                ['REPAIR', 'Repair'],
                ['EDIT', 'Edit'],
                ['FILE', 'File'],
              ]}
            />
          )}
          {dlg === 'assign' && <AssignDialog asset={d} onClose={() => setDlg(null)} onDone={done} />}
          {dlg === 'recover' && <RecoverDialog asset={d} holder={d.holder?.name} onClose={() => setDlg(null)} onDone={done} />}
          {dlg === 'repair' && <RepairDialog asset={d} assigned={!!d.holder} onClose={() => setDlg(null)} onDone={done} />}
          {dlg === 'repaired' && <RepairedDialog asset={d} onClose={() => setDlg(null)} onDone={done} />}
          {dlg === 'retire' && <RetireDialog asset={d} onClose={() => setDlg(null)} onDone={done} />}
        </>
      )}
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------------------------- software

export function LicenseDrawer({ id, onClose, onEdit, toast }: { id: string; onClose: () => void; onEdit: (d: LicDetail) => void; toast: Done }) {
  const q = useQuery({ queryKey: ['assets', 'sw', id], queryFn: () => assetApi.sw(id) });
  const [tab, setTab] = useState<'overview' | 'seats' | 'timeline'>('overview');
  const [seatQ, setSeatQ] = useState('');
  const seats = useQuery({ queryKey: ['assets', 'sw', id, 'seats', seatQ], queryFn: () => assetApi.swSeats(id, seatQ || undefined), enabled: tab === 'seats' });
  const [dlg, setDlg] = useState<null | 'assign' | 'add'>(null);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const nav = useNavigate();
  const act = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<unknown>; busy: string; done: string }) => v.run(),
    onSuccess: (_r, v) => (qc.invalidateQueries({ queryKey: ['assets'] }), toast(v.done), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const d = q.data;
  const done: Done = (m) => (setDlg(null), toast(m));
  return (
    <Drawer
      width={760}
      title={
        d ? (
          <span className="as-dh">
            <b>{d.lid}</b>
            <StateBadge s={d.state} />
            <span className="as-muted">{d.category.name}</span>
            <TypeChip name={d.type.name} />
          </span>
        ) : (
          'License'
        )
      }
      sub={d ? `${d.name}${d.vendor ? ` · ${d.vendor}` : ''}${d.owner ? ` · owned by ${d.owner.name}` : ''}` : undefined}
      onClose={onClose}
      actions={
        d && (
          <span className="as-dacts">
            {d.can.addSeats && d.seats != null && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDlg('add')}>
                {Icon.plus} Add seats
              </button>
            )}
            {d.can.assignSeat && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setDlg('assign')}>
                Assign seat
              </button>
            )}
            {d.can.edit && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(d)}>
                Edit
              </button>
            )}
          </span>
        )
      }
    >
      {q.isLoading && <BlockLoader label="Opening the license…" height={240} />}
      {q.isError && <Alert>{errorText(q.error)}</Alert>}
      {err && <Alert>{err}</Alert>}
      {d && (
        <>
          <div className="dfx-tabbar" role="tablist">
            {(
              [
                ['overview', 'Overview'],
                ['seats', `Seats · ${d.used}`],
                ['timeline', 'Timeline'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === 'overview' && (
            <div className="as-grid2">
              <Section icon={Icon.file} title="License information">
                <Rows
                  rows={[
                    { k: 'License ID', v: d.lid },
                    { k: 'Application', v: d.name },
                    { k: 'Vendor', v: d.vendor },
                    { k: 'Category', v: d.category.name },
                    { k: 'License type', v: `${d.type.name} · ${d.type.unit}` },
                    { k: 'Owner', v: d.owner?.name },
                    { k: 'Status', v: d.status?.name ?? d.state.label.charAt(0).toUpperCase() + d.state.label.slice(1) },
                  ]}
                />
              </Section>
              <Section icon={Icon.users} title="Seat utilisation">
                <div className="as-util">
                  <b>
                    {d.used}
                    <small> / {d.seats ?? '∞'} seats</small>
                  </b>
                  {d.seats != null && (
                    <span className="as-meter">
                      <i style={{ width: `${d.utilPct ?? 0}%` }} />
                    </span>
                  )}
                  <small>{d.seats == null ? 'Site-wide license · unlimited seats' : `${d.utilPct ?? 0}% used · ${d.free} free`}</small>
                </div>
              </Section>
              <Section icon={Icon.wallet} title="Cost">
                <Rows
                  rows={[
                    { k: 'Per seat', v: `${rupees(d.cost.perSeat)} · ${d.cost.billing.toLowerCase()}` },
                    { k: 'Monthly', v: rupees(d.cost.monthly) },
                    { k: 'Annual', v: rupees(d.cost.annual) },
                  ]}
                />
              </Section>
              <Section icon={Icon.cal} title="Renewal">
                {d.renewal.date ? (
                  <div className="as-war">
                    <span>
                      <b>{fmtD(d.renewal.date)}</b> · {d.renewal.daysLeft != null && d.renewal.daysLeft >= 0 ? `${d.renewal.daysLeft} days left` : 'expired'}
                    </span>
                    {d.renewal.pctElapsed != null && (
                      <span className="as-meter">
                        <i style={{ width: `${d.renewal.pctElapsed}%` }} />
                      </span>
                    )}
                    <small>
                      {d.renewal.termStart ? `${fmtD(d.renewal.termStart)} → ${fmtD(d.renewal.date)}` : ''}
                    </small>
                    <span className="as-renew">
                      <span className="cal-tg">
                        <button
                          type="button"
                          className="switch"
                          role="switch"
                          aria-checked={d.autoRenew}
                          disabled={!d.can.edit}
                          onClick={() => act.mutate({ run: () => assetApi.swAutoRenew(id, !d.autoRenew), busy: 'Saving…', done: d.autoRenew ? 'Auto-renew off' : 'Auto-renew on' })}
                        />
                        {d.autoRenew ? 'Renews automatically' : 'Renews manually'}
                      </span>
                      {d.can.renew && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ run: () => assetApi.swRenew(id), busy: 'Renewing…', done: `${d.name} renewed for another term` })}>
                          Renew now
                        </button>
                      )}
                    </span>
                  </div>
                ) : (
                  <span className="as-muted">No renewal date (one-time or free license)</span>
                )}
              </Section>
              {d.specs.length > 0 && (
                <Section icon={Icon.settings} title={`${d.category.name} details`}>
                  <Rows rows={d.specs} />
                </Section>
              )}
              <Section icon={Icon.refresh} title="Admin activity">
                <Rows
                  rows={[
                    { k: 'Created', v: stamp(d.admin.createdAt) },
                    { k: 'Created by', v: d.admin.createdBy },
                    { k: 'Last updated', v: stamp(d.admin.updatedAt) },
                    { k: 'Updated by', v: d.admin.updatedBy },
                  ]}
                />
              </Section>
            </div>
          )}
          {tab === 'seats' && (
            <div className="as-seats">
              <div className="as-tl-bar">
                <label className="dfx-search">
                  {Icon.search}
                  <input placeholder="search seat holders…" value={seatQ} onChange={(e) => setSeatQ(e.target.value)} />
                </label>
                <span className="as-muted">
                  {d.used} of {d.seats ?? '∞'} seats used
                </span>
                {d.can.assignSeat && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setDlg('assign')}>
                    {Icon.plus} Assign seat
                  </button>
                )}
              </div>
              <div className="as-tbl">
                <div className="as-thead" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 120px 80px' }}>
                  <span>Seat holder</span>
                  <span>Department</span>
                  <span>Assigned on</span>
                  <span />
                </div>
                {seats.data?.map((h) => (
                  <div key={h.id} className="as-trow" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 120px 80px' }}>
                    <Who p={h} sub={h.title ?? h.code} onClick={() => nav(`/employees/${h.id}`)} />
                    <span>{h.department ?? '—'}</span>
                    <span>{fmtD(h.assignedOn)}</span>
                    {d.can.assignSeat ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => act.mutate({ run: () => assetApi.swRevoke(id, h.id), busy: 'Revoking…', done: `Seat revoked from ${h.name}` })}>
                        Revoke
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
                {seats.data?.length === 0 && <div className="as-empty sm">No seat holders</div>}
                {d.free != null && d.free > 0 && <div className="as-free">{d.free} free seat{d.free > 1 ? 's' : ''}</div>}
              </div>
            </div>
          )}
          {tab === 'timeline' && (
            <TimelineView
              name={d.lid}
              load={(f) => assetApi.swTimeline(id, f)}
              csv={() => assetApi.swTimelineCsv(id)}
              chips={[
                ['', 'All'],
                ['SEAT', 'Seats'],
                ['RENEWAL', 'Renewal'],
                ['EDIT', 'Edit'],
              ]}
            />
          )}
          {dlg && <SeatDialog lic={{ ...d, perSeat: d.cost.perSeat, billing: d.cost.billing }} mode={dlg} onClose={() => setDlg(null)} onDone={done} />}
        </>
      )}
    </Drawer>
  );
}
