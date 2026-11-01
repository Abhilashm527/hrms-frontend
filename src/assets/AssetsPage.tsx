import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { Pager } from '../leave/ui';
import { type AReq, ago, assetApi, type HwDetail, type HwRow, type LicDetail, type LicRow, type Mode, rupees, statusColor, WARRANTY } from './api';
import { AssignDialog, DecideDialog, HandOverDialog, ImportDialog, RecoverDialog, RepairedDialog, SeatDialog } from './Dialogs';
import { HardwareDrawer, LicenseDrawer } from './Drawers';
import { AI, Bars, BLUES, Card, CatPill, Donut, Initials, Kpis, StateBadge, StatusBadge, TypeChip, typeIcon, Usage, useStatusHex } from './ui';
import { HardwareWizard, SoftwareWizard } from './Wizards';

type Tab = 'dashboard' | 'inventory' | 'available' | 'requests';
const short = (s?: string | null) => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
/** Money in KPIs comes in paise; the sub line of the cost KPI carries a bare number too. */
const kpiFmt = <K extends { key: string; value: number | string; sub: string }>(k: K): K =>
  k.key === 'value' || k.key === 'cost' ? { ...k, value: rupees(Number(k.value)), sub: k.sub.replace(/^(\d+)/, (m) => rupees(Number(m))) } : k;

export function AssetsPage() {
  const [sp, setSp] = useSearchParams();
  const mode = (sp.get('mode') as Mode) || 'hardware';
  const tab = (sp.get('tab') as Tab) || 'dashboard';
  const openId = sp.get('open');
  const [wizard, setWizard] = useState<null | { edit?: HwDetail | LicDetail }>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const set = (p: Record<string, string | null>) =>
    setSp((cur) => {
      const n = new URLSearchParams(cur);
      for (const [k, v] of Object.entries(p)) (v == null ? n.delete(k) : n.set(k, v));
      return n;
    });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const hw = mode === 'hardware';
  const reqs = useQuery({ queryKey: ['assets', 'requests', 'PENDING'], queryFn: () => assetApi.requests(undefined, 'PENDING'), staleTime: 30_000 });
  const hwAvail = useQuery({ queryKey: ['assets', 'avail'], queryFn: assetApi.hwAvail, enabled: hw, staleTime: 30_000 });
  const swAvail = useQuery({ queryKey: ['assets', 'sw-avail'], queryFn: assetApi.swAvail, enabled: !hw, staleTime: 30_000 });
  const pendN = (reqs.data?.items ?? []).filter((r) => r.kind === (hw ? 'HARDWARE' : 'SOFTWARE') && r.status === 'PENDING' && r.canDecide).length;
  const availN = hw ? (hwAvail.data?.groups.reduce((a, g) => a + g.available, 0) ?? 0) : (swAvail.data?.summary.reduce((a, s) => a + s.freeSeats, 0) ?? 0);
  const tabs: [Tab, string, number, 'green' | 'red'][] = [
    ['dashboard', 'Dashboard', 0, 'red'],
    ['inventory', hw ? 'Inventory' : 'Licenses', 0, 'red'],
    ['available', 'Available', availN, 'green'],
    ['requests', 'Requests', pendN, 'red'],
  ];
  const open = (id: string) => set({ open: id });

  return (
    <div className="as-page">
      <div className="as-top">
        <span className="as-modes" role="group">
          <button type="button" aria-pressed={hw} onClick={() => set({ mode: null, tab: null, open: null })}>
            {AI.monitor} Hardware
          </button>
          <button type="button" aria-pressed={!hw} onClick={() => set({ mode: 'software', tab: null, open: null })}>
            {AI.apps} Software
          </button>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setImporting(true)}>
          {Icon.download} Import
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setWizard({})}>
          {Icon.plus} Create
        </button>
      </div>
      <div className="dfx-tabbar" role="tablist">
        {tabs.map(([k, l, n, cls]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => set({ tab: k === 'dashboard' ? null : k })}>
            {l}
            {n > 0 && <span className={`dfx-count ${cls}`}>{n}</span>}
          </button>
        ))}
      </div>

      {hw && tab === 'dashboard' && <HwDashboard toast={setToast} />}
      {hw && tab === 'inventory' && <Inventory open={open} toast={setToast} />}
      {hw && tab === 'available' && <HwAvailable open={open} toast={setToast} />}
      {!hw && tab === 'dashboard' && <SwDashboard open={open} />}
      {!hw && tab === 'inventory' && <Licenses open={open} toast={setToast} />}
      {!hw && tab === 'available' && <SwAvailable open={open} toast={setToast} />}
      {tab === 'requests' && <Requests kind={hw ? 'HARDWARE' : 'SOFTWARE'} toast={setToast} />}

      {openId && hw && <HardwareDrawer id={openId} onClose={() => set({ open: null })} onEdit={(d) => setWizard({ edit: d })} toast={setToast} />}
      {openId && !hw && <LicenseDrawer id={openId} onClose={() => set({ open: null })} onEdit={(d) => setWizard({ edit: d })} toast={setToast} />}
      {wizard && hw && (
        <HardwareWizard
          edit={wizard.edit as HwDetail | undefined}
          onClose={() => setWizard(null)}
          onDone={(m, id) => {
            setWizard(null);
            setToast(m);
            if (id) open(id);
          }}
        />
      )}
      {wizard && !hw && (
        <SoftwareWizard
          edit={wizard.edit as LicDetail | undefined}
          onClose={() => setWizard(null)}
          onDone={(m, id) => {
            setWizard(null);
            setToast(m);
            if (id) open(id);
          }}
        />
      )}
      {importing && <ImportDialog mode={mode} onClose={() => setImporting(false)} onDone={(m) => (setImporting(false), setToast(m))} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------- shared

type Act = { kind: 'assign' | 'recover' | 'repaired'; row: { id: string; tag: string; model: string; holder?: string } } | null;
function HwActs({ act, setAct, toast }: { act: Act; setAct: (a: Act) => void; toast: (m: string) => void }) {
  if (!act) return null;
  const done = (m: string) => (setAct(null), toast(m));
  if (act.kind === 'assign') return <AssignDialog asset={act.row} onClose={() => setAct(null)} onDone={done} />;
  if (act.kind === 'recover') return <RecoverDialog asset={act.row} holder={act.row.holder} onClose={() => setAct(null)} onDone={done} />;
  return <RepairedDialog asset={act.row} onClose={() => setAct(null)} onDone={done} />;
}
function RowActs({ r, setAct }: { r: { id: string; tag: string; model: string; actions: HwRow['actions']; holder?: { name: string } | null }; setAct: (a: Act) => void }) {
  const row = { id: r.id, tag: r.tag, model: r.model, holder: r.holder?.name };
  return (
    <span className="as-acts" onClick={(e) => e.stopPropagation()}>
      {r.actions.assign && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAct({ kind: 'assign', row })}>
          Assign
        </button>
      )}
      {r.actions.recover && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAct({ kind: 'recover', row })}>
          Recover
        </button>
      )}
      {r.actions.repaired && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAct({ kind: 'repaired', row })}>
          Repaired
        </button>
      )}
    </span>
  );
}

function Activity({ items }: { items: { who: string; initials: string; text: string; at: string }[] }) {
  if (!items.length) return <div className="as-empty">No activity yet</div>;
  return (
    <div className="as-activity">
      {items.map((a, i) => (
        <div key={i}>
          <Initials name={a.who} initials={a.initials} />
          <span>
            <span>
              <b>{a.who}</b> {a.text.charAt(0).toLowerCase() + a.text.slice(1)}
            </span>
            <small>{ago(a.at)}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function AlertsCard({ items }: { items: { id: number; title: string; sub: string; at: string; severity?: string }[] }) {
  const qc = useQueryClient();
  const read = useMutation({
    meta: { silent: true },
    mutationFn: () => assetApi.markAlertsRead(items.map((a) => a.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
  return (
    <Card
      title="System alerts"
      flush
      extra={
        items.length > 0 && (
          <a href="#" className="as-link" onClick={(e) => (e.preventDefault(), read.mutate())}>
            Mark as read
          </a>
        )
      }
    >
      <div className="as-alerts">
        {items.map((a) => (
          <div key={a.id}>
            <i style={{ background: a.severity === 'danger' ? 'var(--danger)' : a.severity === 'info' ? 'var(--brand)' : 'var(--warning)' }} />
            <span>
              <b>{a.title}</b>
              <small>{a.sub}</small>
            </span>
            <em>{ago(a.at)}</em>
          </div>
        ))}
        {items.length === 0 && <div className="as-empty">No new alerts</div>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------------------- hardware

const KPI_ICONS = { total: AI.monitor, assigned: Icon.users, value: AI.rupee, warranty: AI.clock, cost: AI.rupee, renewals: AI.clock };

function HwDashboard({ toast }: { toast: (m: string) => void }) {
  const q = useQuery({ queryKey: ['assets', 'hw-dash'], queryFn: assetApi.hwDash });
  const [act, setAct] = useState<Act>(null);
  const hexOf = useStatusHex();
  if (q.isLoading) return <BlockLoader label="Loading the dashboard…" height={320} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  const total = d.types.reduce((a, t) => a + t.total, 0);
  const assigned = d.types.reduce((a, t) => a + t.assigned, 0);
  const money = d.types.some((t) => t.value != null);
  const value = d.types.reduce((a, t) => a + (t.value ?? 0), 0);
  return (
    <div className="as-dash">
      <Kpis items={d.kpis.map(kpiFmt)} icons={{ ...KPI_ICONS, total: AI.monitor }} />
      <div className="as-dgrid">
        <Card title="Assets by type">
          <Donut
            data={d.types.map((t, i) => ({ label: t.label, n: t.total, v: `${t.assigned} / ${t.total}`, color: BLUES[(i * 2 + 1) % BLUES.length] }))}
            centerLabel="Assigned"
            centerValue={`${assigned} / ${total}`}
            legendTitle="Assigned / total"
          />
        </Card>
        <Card title="Allocation by department">
          <Bars data={d.deptAllocation.map((x) => ({ label: x.department ?? 'No department', n: x.n }))} />
        </Card>
        <AlertsCard items={d.alerts} />
        <Card title={money ? 'Asset value by type' : 'Assets by status'}>
          {money ? (
            <Donut data={d.types.map((t, i) => ({ label: t.label, n: t.value ?? 0, v: rupees(t.value ?? 0), color: BLUES[(i * 2 + 1) % BLUES.length] }))} centerLabel="Total value" centerValue={rupees(value)} legendTitle="Type" />
          ) : (
            <Donut data={d.byStatus.map((s) => ({ label: s.label, n: s.n, color: statusColor(s.color, hexOf(s.label))[0] }))} centerLabel="Assets" centerValue={total} legendTitle="Status" />
          )}
        </Card>
        <Card title="Available in stock" flush>
          {d.stock.length === 0 && <div className="as-empty">Nothing in stock</div>}
          <div className="as-stock">
            {d.stock.map((s) => (
              <div key={s.id}>
                <TypeChip name={s.type} />
                <span>
                  <b>{s.model}</b>
                  <small>
                    {s.tag} · {s.status}
                  </small>
                </span>
                <RowActs r={s} setAct={setAct} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recent activity" flush>
          <Activity items={d.activity} />
        </Card>
      </div>
      <HwActs act={act} setAct={setAct} toast={toast} />
    </div>
  );
}

function Inventory({ open, toast }: { open: (id: string) => void; toast: (m: string) => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [typeId, setTypeId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [act, setAct] = useState<Act>(null);
  useEffect(() => {
    const t = setTimeout(() => (setDq(q.trim()), setPage(0)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({
    queryKey: ['assets', 'hw-list', dq, typeId, statusId, page, size],
    queryFn: () => assetApi.hwList({ q: dq || undefined, typeId: typeId || undefined, statusId: statusId || undefined, page: page + 1, size }),
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({ queryKey: ['assets', 'hw-facets'], queryFn: () => assetApi.hwList({ page: 1, size: 1 }) });
  const cols = '90px minmax(200px,1.5fr) 90px minmax(170px,1.2fr) 100px 100px 100px 90px';
  return (
    <div className="as-stack">
      <div className="dfx-toolbar">
        <label className="dfx-search">
          {Icon.search}
          <input placeholder="search tag, model, serial or person…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="dfx-filter-row">
          <button type="button" className={`dfx-chip${!typeId ? ' active' : ''}`} onClick={() => (setTypeId(''), setPage(0))}>
            ALL
          </button>
          {facets.data?.facets.types.map((t) => (
            <button key={t.id} type="button" className={`dfx-chip${typeId === t.id ? ' active' : ''}`} onClick={() => (setTypeId(t.id), setPage(0))}>
              {t.name.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="dfx-ghead-sep" />
        <div className="dfx-filter-row">
          <button type="button" className={`dfx-chip${!statusId ? ' active' : ''}`} onClick={() => (setStatusId(''), setPage(0))}>
            ALL
          </button>
          {facets.data?.facets.statuses.map((t) => (
            <button key={t.id} type="button" className={`dfx-chip${statusId === t.id ? ' active' : ''}`} onClick={() => (setStatusId(t.id), setPage(0))}>
              {t.name.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="as-tbl">
        <div style={{ minWidth: 960 }}>
          <div className="as-thead" style={{ gridTemplateColumns: cols }}>
            <span>Tag</span>
            <span>Model</span>
            <span>Type</span>
            <span>Assigned to</span>
            <span>Since</span>
            <span>Warranty</span>
            <span>Status</span>
            <span />
          </div>
          {list.isLoading && <BlockLoader label="Loading inventory…" height={180} />}
          {list.isError && <Alert>{errorText(list.error)}</Alert>}
          {list.data?.items.map((a) => (
            <div key={a.id} className="as-trow click" style={{ gridTemplateColumns: cols }} onClick={() => open(a.id)}>
              <span className="as-mono">{a.tag}</span>
              <span className="as-two">
                <b>{a.model}</b>
                <small className="mono">S/N {a.serial}</small>
              </span>
              <span>
                <TypeChip name={a.type.name} color={a.type.color} />
              </span>
              <span>
                {a.holder ? (
                  <button
                    type="button"
                    className="as-who"
                    onClick={(e) => {
                      e.stopPropagation();
                      nav(`/employees/${a.holder!.id}`);
                    }}
                  >
                    <Initials name={a.holder.name} initials={a.holder.initials} size={24} />
                    <b className="as-who-n">{a.holder.name}</b>
                  </button>
                ) : (
                  <span className="as-muted">—</span>
                )}
              </span>
              <span>{a.since ? short(a.since) : '—'}</span>
              <span style={{ color: a.warranty.state === 'NONE' || a.warranty.state === 'ACTIVE' ? 'var(--fg-2)' : WARRANTY[a.warranty.state][0] }}>{a.warranty.until ? short(a.warranty.until) : '—'}</span>
              <span>
                <StatusBadge s={a.status} />
              </span>
              <RowActs r={a} setAct={setAct} />
            </div>
          ))}
          {list.data && list.data.items.length === 0 && <div className="as-empty">No hardware matches these filters</div>}
        </div>
        {list.data && list.data.total > 0 && <Pager page={page} size={size} total={list.data.total} onPage={setPage} onSize={(s) => (setSize(s), setPage(0))} sizes={[10, 25, 50, 100]} noun="assets" />}
      </div>
      <HwActs act={act} setAct={setAct} toast={toast} />
    </div>
  );
}

function HwAvailable({ open, toast }: { open: (id: string) => void; toast: (m: string) => void }) {
  const q = useQuery({ queryKey: ['assets', 'avail'], queryFn: assetApi.hwAvail });
  const dash = useQuery({ queryKey: ['assets', 'hw-dash'], queryFn: assetApi.hwDash });
  const [act, setAct] = useState<Act>(null);
  if (q.isLoading) return <BlockLoader label="Loading stock…" height={240} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  const totalOf = (name: string) => dash.data?.types.find((t) => t.label === name)?.total;
  const wFg = (it: HwRow) => (it.warranty.state === 'ENDING' || it.warranty.state === 'EXPIRED' ? 'var(--warning)' : 'var(--fg-3)');
  return (
    <div className="as-stack lg">
      <div className="as-sum">
        {d.summary.map((s) => {
          const tot = totalOf(s.type.name);
          const fg = s.available === 0 ? 'var(--danger)' : s.available === 1 ? 'var(--warning)' : 'var(--success)';
          return (
            <div key={s.type.id} className="as-sumcard">
              <span className="tile">{typeIcon(s.type.name)}</span>
              <div>
                <small>{s.type.name}</small>
                <b>
                  {s.available}
                  <em> available</em>
                </b>
                <span style={{ color: fg }}>{s.available === 0 ? 'Out of stock' : tot ? `${s.available} of ${tot} free` : 'Ready to assign'}</span>
                {s.openRequests > 0 && (
                  <span style={{ color: 'var(--brand)' }}>
                    {s.openRequests} pending request{s.openRequests > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="as-groups">
        {d.groups.map((g) => (
          <div key={g.type.id} className="as-group">
            <header>
              <span className="gi">{typeIcon(g.type.name)}</span>
              <b>{g.type.name}</b>
              <span className="dfx-count green">{g.available}</span>
            </header>
            {g.items.map((it) => (
              <div key={it.id} className="as-gitem" onClick={() => open(it.id)}>
                <span className="as-mono w96">{it.tag}</span>
                <span className="as-two">
                  <b>{it.model}</b>
                  <small style={{ color: wFg(it) }}>
                    S/N {it.serial} · {it.warranty.until ? `Warranty ${short(it.warranty.until)}` : 'No warranty'}
                  </small>
                </span>
                <RowActs r={it} setAct={setAct} />
              </div>
            ))}
          </div>
        ))}
        {d.inRepair.length > 0 && (
          <div className="as-group">
            <header>
              <b>In repair</b>
              <span className="dfx-count red">{d.inRepair.length}</span>
            </header>
            {d.inRepair.map((it) => (
              <div key={it.id} className="as-gitem" onClick={() => open(it.id)}>
                <span className="as-mono w96">{it.tag}</span>
                <span className="as-two">
                  <b>{it.model}</b>
                  <small style={{ color: wFg(it) }}>
                    S/N {it.serial} · {it.warranty.until ? `Warranty ${short(it.warranty.until)}` : 'No warranty'}
                  </small>
                </span>
                <RowActs r={it} setAct={setAct} />
              </div>
            ))}
          </div>
        )}
      </div>
      {d.groups.length === 0 && d.inRepair.length === 0 && <div className="as-empty boxed">No hardware in stock</div>}
      <HwActs act={act} setAct={setAct} toast={toast} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------- software

function SwDashboard({ open }: { open: (id: string) => void }) {
  const [cat, setCat] = useState('');
  const cfg = useQuery({ queryKey: ['assets', 'config', 'software'], queryFn: () => assetApi.config('software'), staleTime: 60_000 });
  const q = useQuery({ queryKey: ['assets', 'sw-dash', cat], queryFn: () => assetApi.swDash(cat || undefined), placeholderData: keepPreviousData });
  if (q.isLoading) return <BlockLoader label="Loading the dashboard…" height={320} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  const cu = d.categoryUsage;
  const used = cu.items.reduce((a, l) => a + l.used, 0);
  const seats = cu.items.reduce((a, l) => a + (l.seats ?? 0), 0);
  const spend = d.spendByCategory ?? [];
  const spendTotal = spend.reduce((a, s) => a + s.annual, 0);
  return (
    <div className="as-dash">
      <Kpis items={d.kpis.map(kpiFmt)} icons={{ ...KPI_ICONS, total: AI.apps }} />
      <div className="as-dgrid">
        <Card
          title="License usage by category"
          extra={
            <select className="as-pick-cat" value={cat || cu.categoryId || ''} onChange={(e) => setCat(e.target.value)}>
              {cfg.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          }
        >
          <Donut data={cu.items.map((l) => ({ label: l.name, n: l.used, v: `${l.used} / ${l.seats ?? '∞'}` }))} centerLabel="Licenses used" centerValue={`${used} / ${seats}`} legendTitle={`Category: ${cu.category ?? '—'}`} />
        </Card>
        <Card
          title="License usage · last 6 months"
          extra={
            <span className="as-usage-key">
              <i style={{ background: '#8B5CF6' }} />
              Total
              <i style={{ background: '#3B82F6' }} />
              Used
            </span>
          }
        >
          <Usage data={d.usage} />
        </Card>
        <AlertsCard items={d.alerts} />
        <Card title="Top spend by category">
          <Donut data={spend.map((s) => ({ label: s.label, n: s.annual, v: rupees(s.annual) }))} centerLabel="Annual cost" centerValue={rupees(spendTotal)} legendTitle="Category" />
        </Card>
        <Card title="Underutilised licenses">
          <div className="as-save">
            <small>Potential annual savings</small>
            <b>{rupees(d.underused.annualSavings)}</b>
          </div>
          {d.underused.top.length === 0 && <div className="as-empty sm">Every license is well used</div>}
          {d.underused.top.map((u) => (
            <div key={u.id} className="as-under" onClick={() => open(u.id)}>
              <div>
                <b>{u.name}</b>
                <span>
                  {u.used} / {u.seats} used
                </span>
              </div>
              <span className="bar">
                <i style={{ width: `${u.seats ? Math.round((u.used / u.seats) * 100) : 0}%` }} />
              </span>
              <small>Savings: {rupees(u.saving)}</small>
            </div>
          ))}
        </Card>
        <Card title="Recent activity" flush>
          <Activity items={d.activity} />
        </Card>
      </div>
    </div>
  );
}

const STATES: [string, string][] = [
  ['', 'ALL'],
  ['ACTIVE', 'ACTIVE'],
  ['RENEWAL_DUE', 'RENEWAL DUE'],
  ['UNDERUSED', 'UNDERUSED'],
  ['FULLY_USED', 'FULLY USED'],
];
type SeatAct = { lic: LicRow; mode: 'assign' | 'add' } | null;

function Licenses({ open, toast }: { open: (id: string) => void; toast: (m: string) => void }) {
  const cfg = useQuery({ queryKey: ['assets', 'config', 'software'], queryFn: () => assetApi.config('software'), staleTime: 60_000 });
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [cat, setCat] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [seat, setSeat] = useState<SeatAct>(null);
  useEffect(() => {
    const t = setTimeout(() => (setDq(q.trim()), setPage(0)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({
    queryKey: ['assets', 'sw-list', dq, cat, state, page, size],
    queryFn: () => assetApi.swList({ q: dq || undefined, categoryId: cat || undefined, state: state || undefined, page: page + 1, size }),
    placeholderData: keepPreviousData,
  });
  const cols = 'minmax(220px,1.5fr) 120px 150px minmax(150px,1fr) 100px 100px 110px 104px';
  return (
    <div className="as-stack">
      <div className="dfx-toolbar">
        <label className="dfx-search">
          {Icon.search}
          <input placeholder="search application, vendor, owner or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="as-sel" value={cat} onChange={(e) => (setCat(e.target.value), setPage(0))}>
          <option value="">All categories</option>
          {cfg.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="dfx-ghead-sep" />
        <div className="dfx-filter-row">
          {STATES.map(([k, l]) => (
            <button key={k} type="button" className={`dfx-chip${state === k ? ' active' : ''}`} onClick={() => (setState(k), setPage(0))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="as-tbl">
        <div style={{ minWidth: 1080 }}>
          <div className="as-thead" style={{ gridTemplateColumns: cols }}>
            <span>Application</span>
            <span>Category</span>
            <span>License type</span>
            <span>Seats used</span>
            <span style={{ textAlign: 'right' }}>Cost / year</span>
            <span>Renews</span>
            <span>Status</span>
            <span />
          </div>
          {list.isLoading && <BlockLoader label="Loading licenses…" height={180} />}
          {list.isError && <Alert>{errorText(list.error)}</Alert>}
          {list.data?.items.map((l) => {
            const util = l.utilPct ?? 0;
            return (
              <div key={l.id} className="as-trow click" style={{ gridTemplateColumns: cols }} onClick={() => open(l.id)}>
                <span className="as-two">
                  <b>{l.name}</b>
                  <small>
                    <span className="mono">{l.lid}</span>
                    {l.owner ? ` · ${l.owner.name}` : ''}
                  </small>
                </span>
                <span>
                  <CatPill name={l.category.name} color={l.category.color} />
                </span>
                <span>{l.type.name}</span>
                <span className="as-seatcell">
                  <span className="bar">
                    <i style={{ width: `${l.seats == null ? 100 : util}%`, background: l.seats != null && util < 60 ? '#F59E0B' : 'var(--brand)' }} />
                  </span>
                  <b>
                    {l.used} / {l.seats ?? '∞'}
                  </b>
                </span>
                <span style={{ textAlign: 'right' }}>{rupees(l.annualCost)}</span>
                <span style={{ color: l.daysToRenew != null && l.daysToRenew <= 45 ? 'var(--warning)' : 'var(--fg-2)' }}>{l.renewsOn ? short(l.renewsOn) : '—'}</span>
                <span>
                  <StateBadge s={l.state} />
                </span>
                <span className="as-acts" onClick={(e) => e.stopPropagation()}>
                  {l.free == null || l.free > 0 ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSeat({ lic: l, mode: 'assign' })}>
                      Assign seat
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeat({ lic: l, mode: 'add' })}>
                      Add seats
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {list.data && list.data.items.length === 0 && <div className="as-empty">No licenses match these filters</div>}
        </div>
        {list.data && list.data.total > 0 && <Pager page={page} size={size} total={list.data.total} onPage={setPage} onSize={(s) => (setSize(s), setPage(0))} sizes={[10, 25, 50, 100]} noun="licenses" />}
      </div>
      {seat && <SeatDialog lic={seat.lic} mode={seat.mode} onClose={() => setSeat(null)} onDone={(m) => (setSeat(null), toast(m))} />}
    </div>
  );
}

function SwAvailable({ open, toast }: { open: (id: string) => void; toast: (m: string) => void }) {
  const q = useQuery({ queryKey: ['assets', 'sw-avail'], queryFn: assetApi.swAvail });
  const [seat, setSeat] = useState<SeatAct>(null);
  if (q.isLoading) return <BlockLoader label="Loading free seats…" height={240} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  return (
    <div className="as-stack lg">
      <div className="as-sum">
        {d.summary.map((s) => (
          <div key={s.category.id} className="as-sumcard">
            <span className="tile">{AI.apps}</span>
            <div>
              <small>{s.category.name}</small>
              <b>
                {s.freeSeats}
                <em> free seats</em>
              </b>
              <span style={{ color: s.freeSeats ? 'var(--success)' : 'var(--danger)' }}>{s.freeSeats ? 'Ready to assign' : 'Fully allocated'}</span>
              {s.idle > 0 && <span style={{ color: 'var(--warning)' }}>{s.idle} idle for 90 days</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="as-groups wide">
        {d.groups.map((g) => (
          <div key={g.category.id} className="as-group">
            <header>
              <span className="gi">{AI.apps}</span>
              <b>{g.category.name}</b>
              <span className="dfx-count green">{g.freeSeats}</span>
            </header>
            {g.items.map((it) => (
              <div key={it.id} className="as-gitem sw" onClick={() => open(it.id)}>
                <span className="as-swi">
                  <span>
                    <b>{it.name}</b>
                    <span className="mono">{it.lid}</span>
                  </span>
                  <span>
                    <span className="bar">
                      <i style={{ width: `${it.seats ? Math.round((it.used / it.seats) * 100) : 100}%` }} />
                    </span>
                    <em>{it.free == null ? 'Unlimited seats' : `${it.free} seat${it.free === 1 ? '' : 's'} free`}</em>
                  </span>
                  <small style={{ color: it.daysToRenew != null && it.daysToRenew <= 45 ? 'var(--warning)' : 'var(--fg-3)' }}>
                    {it.used} of {it.seats ?? '∞'} used{it.renewsOn ? ` · renews ${short(it.renewsOn)}` : ''}
                  </small>
                </span>
                <span className="as-acts" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSeat({ lic: it, mode: 'assign' })}>
                    Assign seat
                  </button>
                </span>
              </div>
            ))}
          </div>
        ))}
        {d.fullyAllocated.length > 0 && (
          <div className="as-group">
            <header>
              <b>Fully allocated</b>
              <span className="dfx-count red">{d.fullyAllocated.length}</span>
            </header>
            {d.fullyAllocated.map((it) => (
              <div key={it.id} className="as-gitem sw" onClick={() => open(it.id)}>
                <span className="as-two">
                  <b>{it.name}</b>
                  <small>
                    {it.used} of {it.seats} seats used · {it.lid}
                  </small>
                </span>
                <span className="as-acts" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeat({ lic: it, mode: 'add' })}>
                    {Icon.plus} Add seats
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {d.groups.length === 0 && d.fullyAllocated.length === 0 && <div className="as-empty boxed">No free seats on any license</div>}
      {seat && <SeatDialog lic={seat.lic} mode={seat.mode} onClose={() => setSeat(null)} onDone={(m) => (setSeat(null), toast(m))} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------- requests

const RSTATUS: Record<AReq['status'], [string, string]> = {
  PENDING: ['Pending', 'degraded'],
  APPROVED: ['Approved', 'info'],
  FULFILLED: ['Fulfilled', 'healthy'],
  REJECTED: ['Rejected', 'failed'],
  CANCELLED: ['Cancelled', 'paused'],
};
function Requests({ kind, toast }: { kind: 'HARDWARE' | 'SOFTWARE'; toast: (m: string) => void }) {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['assets', 'requests', kind, status], queryFn: () => assetApi.requests(kind, status || undefined) });
  const [dec, setDec] = useState<{ req: AReq; approve: boolean } | null>(null);
  const [hand, setHand] = useState<AReq | null>(null);
  const cols = 'minmax(200px,1.3fr) minmax(200px,1.4fr) 120px 90px 100px 150px';
  const rows = [...(q.data?.items ?? [])].sort((a, b) => (a.status === 'PENDING' ? 0 : 1) - (b.status === 'PENDING' ? 0 : 1) || b.date.localeCompare(a.date));
  return (
    <div className="as-stack">
      <div className="dfx-filter-row">
        {(
          [
            ['', 'ALL'],
            ['PENDING', 'PENDING'],
            ['APPROVED', 'APPROVED'],
            ['FULFILLED', 'FULFILLED'],
            ['REJECTED', 'REJECTED'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" className={`dfx-chip${status === k ? ' active' : ''}`} onClick={() => setStatus(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="as-tbl">
        <div style={{ minWidth: 860 }}>
          <div className="as-thead" style={{ gridTemplateColumns: cols }}>
            <span>Requested by</span>
            <span>Item</span>
            <span>Kind</span>
            <span>Date</span>
            <span>Status</span>
            <span />
          </div>
          {q.isLoading && <BlockLoader label="Loading requests…" height={160} />}
          {q.isError && <Alert>{errorText(q.error)}</Alert>}
          {rows.map((r) => (
            <div key={r.id} className="as-trow" style={{ gridTemplateColumns: cols }}>
              <button type="button" className="as-who" onClick={() => nav(`/employees/${r.requester.id}`)}>
                <Initials name={r.requester.name} initials={r.requester.initials} />
                <span className="as-who-t">
                  <b>{r.requester.name}</b>
                  <small>{r.requester.department ?? r.requester.code}</small>
                </span>
              </button>
              <span className="as-two wrap">
                <b>{r.item.name}</b>
                <small title={r.fields.map((f) => `${f.k}: ${f.v}`).join('\n')}>
                  {r.reason}
                  {r.source !== 'EMPLOYEE' ? ` · ${r.source.toLowerCase()}` : ''}
                  {r.dueOn ? ` · due ${short(r.dueOn)}` : ''}
                </small>
              </span>
              <span>{r.kind === 'HARDWARE' ? 'Hardware' : 'Software'}</span>
              <span>{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <span>
                <StateBadge s={{ label: RSTATUS[r.status][0], badge: RSTATUS[r.status][1] }} />
              </span>
              <span className="as-acts">
                {r.canDecide && r.status === 'PENDING' && (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDec({ req: r, approve: false })}>
                      Reject
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setDec({ req: r, approve: true })}>
                      Approve
                    </button>
                  </>
                )}
                {r.status === 'APPROVED' && r.canDecide && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHand(r)}>
                    Hand over
                  </button>
                )}
              </span>
            </div>
          ))}
          {q.data && rows.length === 0 && <div className="as-empty">No requests here</div>}
        </div>
      </div>
      {hand && <HandOverDialog req={hand} onClose={() => setHand(null)} onDone={(m) => (setHand(null), toast(m))} />}
      {dec && <DecideDialog req={dec.req} approve={dec.approve} onClose={() => setDec(null)} onDone={(m) => (setDec(null), toast(m))} />}
    </div>
  );
}

