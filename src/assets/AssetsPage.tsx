import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { Pager } from '../leave/ui';
import { type AReq, ago, assetApi, type HwDetail, type HwRow, type Kpi, type LicDetail, type LicRow, type Mode, rupees, SLOT } from './api';
import { AssignDialog, DecideDialog, HandOverDialog, ImportDialog, RecoverDialog, RepairedDialog, SeatDialog } from './Dialogs';
import { HardwareDrawer, LicenseDrawer } from './Drawers';
import { Bars, Card, Donut, Kpis, StateBadge, StatusBadge, TypeChip, Usage, Warranty, Who } from './ui';
import { HardwareWizard, SoftwareWizard } from './Wizards';

type Tab = 'dashboard' | 'inventory' | 'available' | 'requests';
const ic = {
  box: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>,
  app: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
};
/** Money KPIs come in paise; the sub line carries a bare number too. */
const kpiFmt = (k: Kpi): Kpi =>
  k.key === 'value' || k.key === 'cost'
    ? { ...k, value: rupees(Number(k.value)), sub: k.sub.replace(/^(\d+)/, (m) => rupees(Number(m))) }
    : k;

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

  const reqs = useQuery({ queryKey: ['assets', 'requests', 'PENDING'], queryFn: () => assetApi.requests(undefined, 'PENDING'), staleTime: 30_000 });
  const pendKind = (k: 'HARDWARE' | 'SOFTWARE') => (reqs.data?.items ?? []).filter((r) => r.kind === k && r.status === 'PENDING' && r.canDecide).length;
  const hw = mode === 'hardware';
  const tabs: [Tab, string, number][] = [
    ['dashboard', 'Dashboard', 0],
    ['inventory', hw ? 'Inventory' : 'Licenses', 0],
    ['available', hw ? 'Available' : 'Available seats', 0],
    ['requests', 'Requests', pendKind(hw ? 'HARDWARE' : 'SOFTWARE')],
  ];
  const open = (id: string) => set({ open: id });

  return (
    <div className="as-page">
      <div className="as-top">
        <span className="lv-seg as-modes" role="group">
          <button type="button" aria-pressed={hw} onClick={() => set({ mode: null, tab: null, open: null })}>
            {ic.box} Hardware
          </button>
          <button type="button" aria-pressed={!hw} onClick={() => set({ mode: 'software', tab: null, open: null })}>
            {ic.app} Software
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
        {tabs.map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dfx-tab${tab === k ? ' active' : ''}`} onClick={() => set({ tab: k === 'dashboard' ? null : k })}>
            {l}
            {n > 0 && <span className="dfx-count red">{n}</span>}
          </button>
        ))}
      </div>

      {hw && tab === 'dashboard' && <HwDashboard open={open} toast={setToast} goInventory={() => set({ tab: 'inventory' })} />}
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

// ------------------------------------------------------------------------------------------------------------- hardware

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
  if (!items.length) return <div className="as-empty sm">No activity yet</div>;
  return (
    <div className="as-activity">
      {items.map((a, i) => (
        <div key={i}>
          <span className="av">{a.initials}</span>
          <span>
            <b>{a.who}</b> {a.text.charAt(0).toLowerCase() + a.text.slice(1)}
          </span>
          <small>{ago(a.at)}</small>
        </div>
      ))}
    </div>
  );
}
function Alerts({ items }: { items: { title: string; sub: string; at: string }[] }) {
  if (!items.length) return <div className="as-empty sm">No new alerts</div>;
  return (
    <div className="as-alerts">
      {items.map((a, i) => (
        <div key={i}>
          <span className="dot" />
          <span>
            <b>{a.title}</b>
            <small>{a.sub}</small>
          </span>
          <small>{ago(a.at)}</small>
        </div>
      ))}
    </div>
  );
}

function HwDashboard({ open, toast, goInventory }: { open: (id: string) => void; toast: (m: string) => void; goInventory: () => void }) {
  const q = useQuery({ queryKey: ['assets', 'hw-dash'], queryFn: assetApi.hwDash });
  const [act, setAct] = useState<Act>(null);
  if (q.isLoading) return <BlockLoader label="Loading the dashboard…" height={320} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  return (
    <div className="as-dash">
      <Kpis items={d.kpis.map(kpiFmt)} icons={[ic.box, Icon.users, Icon.laptop, Icon.wallet]} />
      <div className="as-dgrid">
        <Card title="Hardware by status">
          <Donut data={d.byStatus.map((s) => ({ label: s.label, n: s.n, color: SLOT[s.color]?.[0] }))} centerLabel="assets" legendTitle="Status" />
        </Card>
        <Card title="Allocation by department">
          <Bars data={d.deptAllocation.map((x) => ({ label: x.department ?? 'No department', n: x.n }))} />
        </Card>
        <Card title="System alerts">
          <Alerts items={d.alerts} />
        </Card>
        <Card title="Hardware by type">
          <Donut data={d.byType} centerLabel="in use" legendTitle="Type" />
        </Card>
        <Card
          title="Available in stock"
          extra={
            <button type="button" className="btn btn-ghost btn-sm" onClick={goInventory}>
              View all
            </button>
          }
        >
          {d.stock.length === 0 && <div className="as-empty sm">Nothing in stock</div>}
          <div className="as-stock">
            {d.stock.map((s) => (
              <div key={s.id} onClick={() => open(s.id)}>
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
        <Card title="Recent activity">
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
  const cols = '150px minmax(0,1.6fr) 110px minmax(0,1.4fr) 100px 150px 120px 150px';
  return (
    <>
      <div className="dfx-toolbar as-toolbar">
        <label className="dfx-search">
          {Icon.search}
          <input placeholder="search tag, model, serial or person…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="as-chips">
          <button type="button" className={`dfx-chip${!typeId ? ' active' : ''}`} onClick={() => (setTypeId(''), setPage(0))}>
            All types
          </button>
          {facets.data?.facets.types.map((t) => (
            <button key={t.id} type="button" className={`dfx-chip${typeId === t.id ? ' active' : ''}`} onClick={() => (setTypeId(t.id), setPage(0))}>
              {t.name} · {t.n}
            </button>
          ))}
          <span className="dfx-ghead-sep" />
          <button type="button" className={`dfx-chip${!statusId ? ' active' : ''}`} onClick={() => (setStatusId(''), setPage(0))}>
            All statuses
          </button>
          {facets.data?.facets.statuses.map((t) => (
            <button key={t.id} type="button" className={`dfx-chip${statusId === t.id ? ' active' : ''}`} onClick={() => (setStatusId(t.id), setPage(0))}>
              {t.name} · {t.n}
            </button>
          ))}
        </div>
      </div>
      <div className="as-tbl">
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
              <small>S/N {a.serial}</small>
            </span>
            <span>
              <TypeChip name={a.type.name} color={a.type.color} />
            </span>
            <span>{a.holder ? <Who p={a.holder} sub={a.holder.department ?? a.holder.code} onClick={() => nav(`/employees/${a.holder!.id}`)} /> : <span className="as-muted">—</span>}</span>
            <span>{a.since ? new Date(a.since + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</span>
            <span>
              <Warranty w={a.warranty} />
            </span>
            <span>
              <StatusBadge s={a.status} />
            </span>
            <RowActs r={a} setAct={setAct} />
          </div>
        ))}
        {list.data && list.data.items.length === 0 && <div className="as-empty">No hardware matches these filters</div>}
        {list.data && list.data.total > 0 && <Pager page={page} size={size} total={list.data.total} onPage={setPage} onSize={(s) => (setSize(s), setPage(0))} sizes={[10, 25, 50, 100]} noun="assets" />}
      </div>
      <HwActs act={act} setAct={setAct} toast={toast} />
    </>
  );
}

function HwAvailable({ open, toast }: { open: (id: string) => void; toast: (m: string) => void }) {
  const q = useQuery({ queryKey: ['assets', 'avail'], queryFn: assetApi.hwAvail });
  const [act, setAct] = useState<Act>(null);
  if (q.isLoading) return <BlockLoader label="Loading stock…" height={240} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  return (
    <>
      <div className="as-sum">
        {d.summary.map((s) => (
          <div key={s.type.id} className="as-sumcard">
            <TypeChip name={s.type.name} color={s.type.color} />
            <b>{s.available} available</b>
            <small>
              {[s.endingWarranty ? `${s.endingWarranty} ending warranty` : '', s.openRequests ? `${s.openRequests} open request${s.openRequests > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || 'Ready to assign'}
            </small>
          </div>
        ))}
      </div>
      {d.groups.length === 0 && d.inRepair.length === 0 && <div className="as-empty">No hardware in stock</div>}
      {d.groups.map((g) => (
        <div key={g.type.id} className="as-group">
          <header>
            <b>{g.type.name}</b>
            <span className="dfx-count green">{g.available}</span>
          </header>
          {g.items.map((it) => (
            <div key={it.id} className="as-gitem" onClick={() => open(it.id)}>
              <span className="as-mono">{it.tag}</span>
              <span className="as-two">
                <b>{it.model}</b>
                <small>
                  S/N {it.serial} · <Warranty w={it.warranty} />
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
              <span className="as-mono">{it.tag}</span>
              <span className="as-two">
                <b>{it.model}</b>
                <small>
                  S/N {it.serial}
                  {it.holder ? ` · ${it.holder.name}` : ''}
                </small>
              </span>
              <RowActs r={it} setAct={setAct} />
            </div>
          ))}
        </div>
      )}
      <HwActs act={act} setAct={setAct} toast={toast} />
    </>
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
  const picker = (
    <select className="input sm as-picker" value={cat} onChange={(e) => setCat(e.target.value)}>
      <option value="">All categories</option>
      {cfg.data?.categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="as-dash">
      <Kpis items={d.kpis.map(kpiFmt)} icons={[ic.app, Icon.users, Icon.wallet, Icon.cal]} />
      <div className="as-dgrid">
        <Card title="Licenses by category" extra={picker}>
          <Donut data={d.byCategory} centerLabel="licenses" legendTitle="Category" />
        </Card>
        <Card title="License usage · last 6 months">
          <Usage data={d.usage} />
        </Card>
        <Card title="System alerts">
          <Alerts items={d.alerts} />
        </Card>
        <Card title="Licenses by health">
          <Donut data={d.byState.map((s) => ({ ...s, label: s.label.charAt(0).toUpperCase() + s.label.slice(1) }))} centerLabel="licenses" legendTitle="Health" />
        </Card>
        <Card title="Underutilised licenses">
          <div className="as-save">
            <small>Potential annual savings</small>
            <b>{rupees(d.underused.annualSavings)}</b>
          </div>
          {d.underused.top.length === 0 && <div className="as-empty sm">Every license is well used</div>}
          {d.underused.top.map((u) => (
            <div key={u.id} className="as-under" onClick={() => open(u.id)}>
              <span>
                <b>{u.name}</b>
                <small>
                  {u.used} / {u.seats} seats used
                </small>
              </span>
              <span className="as-meter sm">
                <i style={{ width: `${u.seats ? (u.used / u.seats) * 100 : 0}%` }} />
              </span>
              <b>{rupees(u.saving)}</b>
            </div>
          ))}
        </Card>
        <Card title="Recent activity">
          <Activity items={d.activity} />
        </Card>
      </div>
    </div>
  );
}

const STATES: [string, string][] = [
  ['', 'All'],
  ['ACTIVE', 'Active'],
  ['RENEWAL_DUE', 'Renewal due'],
  ['FULLY_USED', 'Fully used'],
  ['UNDERUSED', 'Underused'],
  ['EXPIRED', 'Expired'],
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
  const cols = 'minmax(0,2fr) 120px 130px 110px 110px 110px 130px 130px';
  return (
    <>
      <div className="dfx-toolbar as-toolbar">
        <label className="dfx-search">
          {Icon.search}
          <input placeholder="search application, vendor, owner or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input sm as-picker" value={cat} onChange={(e) => (setCat(e.target.value), setPage(0))}>
          <option value="">All categories</option>
          {cfg.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="as-chips">
          {STATES.map(([k, l]) => (
            <button key={k} type="button" className={`dfx-chip${state === k ? ' active' : ''}`} onClick={() => (setState(k), setPage(0))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="as-tbl">
        <div className="as-thead" style={{ gridTemplateColumns: cols }}>
          <span>Application</span>
          <span>Category</span>
          <span>License type</span>
          <span>Seats used</span>
          <span>Cost / year</span>
          <span>Renews</span>
          <span>Status</span>
          <span />
        </div>
        {list.isLoading && <BlockLoader label="Loading licenses…" height={180} />}
        {list.isError && <Alert>{errorText(list.error)}</Alert>}
        {list.data?.items.map((l) => (
          <div key={l.id} className="as-trow click" style={{ gridTemplateColumns: cols }} onClick={() => open(l.id)}>
            <span className="as-two">
              <b>{l.name}</b>
              <small>
                {l.lid}
                {l.owner ? ` · ${l.owner.name}` : ''}
              </small>
            </span>
            <span>
              <TypeChip name={l.category.name} color={l.category.color} />
            </span>
            <span>{l.type.name}</span>
            <span className="as-two">
              <b>
                {l.used} / {l.seats ?? '∞'}
              </b>
              {l.seats != null && (
                <span className="as-meter sm">
                  <i style={{ width: `${l.utilPct ?? 0}%` }} />
                </span>
              )}
            </span>
            <span>{rupees(l.annualCost)}</span>
            <span>{l.renewsOn ? new Date(l.renewsOn + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</span>
            <span>
              <StateBadge s={l.state} />
            </span>
            <span className="as-acts" onClick={(e) => e.stopPropagation()}>
              {l.actions.assignSeat ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSeat({ lic: l, mode: 'assign' })}>
                  Assign seat
                </button>
              ) : l.seats != null ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeat({ lic: l, mode: 'add' })}>
                  Add seats
                </button>
              ) : null}
            </span>
          </div>
        ))}
        {list.data && list.data.items.length === 0 && <div className="as-empty">No licenses match these filters</div>}
        {list.data && list.data.total > 0 && <Pager page={page} size={size} total={list.data.total} onPage={setPage} onSize={(s) => (setSize(s), setPage(0))} sizes={[10, 25, 50, 100]} noun="licenses" />}
      </div>
      {seat && <SeatDialog lic={seat.lic} mode={seat.mode} onClose={() => setSeat(null)} onDone={(m) => (setSeat(null), toast(m))} />}
    </>
  );
}

function SwAvailable({ open, toast }: { open: (id: string) => void; toast: (m: string) => void }) {
  const q = useQuery({ queryKey: ['assets', 'sw-avail'], queryFn: assetApi.swAvail });
  const [seat, setSeat] = useState<SeatAct>(null);
  if (q.isLoading) return <BlockLoader label="Loading free seats…" height={240} />;
  if (q.isError || !q.data) return <Alert>{errorText(q.error)}</Alert>;
  const d = q.data;
  return (
    <>
      <div className="as-sum">
        {d.summary.map((s) => (
          <div key={s.category.id} className="as-sumcard">
            <TypeChip name={s.category.name} />
            <b>{s.freeSeats} free seats</b>
            <small>{s.idle ? `${s.idle} idle` : 'Ready to assign'}</small>
          </div>
        ))}
      </div>
      {d.groups.length === 0 && d.fullyAllocated.length === 0 && <div className="as-empty">No free seats on any license</div>}
      {d.groups.map((g) => (
        <div key={g.category.id} className="as-group">
          <header>
            <b>{g.category.name}</b>
            <span className="dfx-count green">{g.freeSeats}</span>
          </header>
          {g.items.map((it) => (
            <div key={it.id} className="as-gitem" onClick={() => open(it.id)}>
              <span className="as-two">
                <b>{it.name}</b>
                <small>{it.lid}</small>
              </span>
              <span className="as-two">
                <b>{it.free == null ? 'Unlimited' : `${it.free} free`}</b>
                <small>
                  {it.used} of {it.seats ?? '∞'} used{it.renewsOn ? ` · renews ${new Date(it.renewsOn + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
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
            <div key={it.id} className="as-gitem" onClick={() => open(it.id)}>
              <span className="as-two">
                <b>{it.name}</b>
                <small>
                  {it.lid} · {it.used} of {it.seats} used
                </small>
              </span>
              <span />
              <span className="as-acts" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeat({ lic: it, mode: 'add' })}>
                  {Icon.plus} Add seats
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {seat && <SeatDialog lic={seat.lic} mode={seat.mode} onClose={() => setSeat(null)} onDone={(m) => (setSeat(null), toast(m))} />}
    </>
  );
}

// ------------------------------------------------------------------------------------------------------------- requests

const RSTATUS: Record<AReq['status'], [string, string]> = {
  PENDING: ['Pending', 'degraded'],
  APPROVED: ['Approved · to hand over', 'info'],
  FULFILLED: ['Fulfilled', 'healthy'],
  REJECTED: ['Rejected', 'failed'],
  CANCELLED: ['Cancelled', 'paused'],
};
function Requests({ kind, toast }: { kind: 'HARDWARE' | 'SOFTWARE'; toast: (m: string) => void }) {
  const nav = useNavigate();
  const [status, setStatus] = useState('PENDING');
  const q = useQuery({ queryKey: ['assets', 'requests', kind, status], queryFn: () => assetApi.requests(kind, status || undefined) });
  const [dec, setDec] = useState<{ req: AReq; approve: boolean } | null>(null);
  const [hand, setHand] = useState<AReq | null>(null);
  const cols = 'minmax(0,1.6fr) minmax(0,2fr) 100px 110px 170px 170px';
  return (
    <>
      <div className="as-chips">
        {(
          [
            ['PENDING', 'Waiting'],
            ['APPROVED', 'Approved'],
            ['FULFILLED', 'Fulfilled'],
            ['REJECTED', 'Rejected'],
            ['', 'All'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" className={`dfx-chip${status === k ? ' active' : ''}`} onClick={() => setStatus(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="as-tbl">
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
        {q.data?.items.map((r) => (
          <div key={r.id} className="as-trow" style={{ gridTemplateColumns: cols }}>
            <Who p={r.requester} sub={r.requester.department ?? r.requester.code} onClick={() => nav(`/employees/${r.requester.id}`)} />
            <span className="as-two">
              <b>{r.item.name}</b>
              <small title={r.fields.map((f) => `${f.k}: ${f.v}`).join('\n')}>
                {r.reason}
                {r.source !== 'EMPLOYEE' ? ` · ${r.source.toLowerCase()}` : ''}
                {r.dueOn ? ` · due ${new Date(r.dueOn + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
              </small>
            </span>
            <span>{r.kind === 'HARDWARE' ? 'Hardware' : 'Software'}</span>
            <span>{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
            <span>
              <StateBadge s={{ label: RSTATUS[r.status][0] + (r.status === 'PENDING' && r.step > 1 ? ` · step ${r.step}` : ''), badge: RSTATUS[r.status][1] }} />
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
        {q.data && q.data.items.length === 0 && <div className="as-empty">{status === 'PENDING' ? 'Nothing waiting for approval' : 'No requests here'}</div>}
      </div>
      {hand && <HandOverDialog req={hand} onClose={() => setHand(null)} onDone={(m) => (setHand(null), toast(m))} />}
      {dec && <DecideDialog req={dec.req} approve={dec.approve} onClose={() => setDec(null)} onDone={(m) => (setDec(null), toast(m))} />}
    </>
  );
}
