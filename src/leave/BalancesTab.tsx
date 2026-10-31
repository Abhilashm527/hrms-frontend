import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { useDepartments, useLocations } from '../onboarding/shared';
import { TYPE_COLORS, leaveApi, type Balance } from './api';
import { Grid, Pager, Row, Who } from './ui';

export function BalancesTab({ openLedger }: { openLedger: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [dept, setDept] = useState('');
  const [loc, setLoc] = useState('');
  const [f, setF] = useState('all');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const depts = useDepartments();
  const locs = useLocations();
  useEffect(() => {
    const t = setTimeout(() => (setQd(q.trim()), setPage(0)), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [dept, loc, f, size]);
  const params = { q: qd, departmentId: dept, locationId: loc, filter: f, page, size };
  const board = useQuery({ queryKey: ['leave', 'balances', params], queryFn: () => leaveApi.balances(params), placeholderData: keepPreviousData });
  const b = board.data;
  const cols = `minmax(200px,1.6fr) repeat(${b?.types.length ?? 6},80px)`;
  const hasFlt = !!(q || dept || loc || f !== 'all');

  return (
    <div className="lv-stack">
      <PermissionsNotice errors={[board.error]} />
      <div className="lv-bar">
        <label className="dfx-search">
          {Icon.search}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search employees…" />
        </label>
        <span className="grow" />
        <select className="sel" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className="sel" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {locs.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className="sel" value={f} onChange={(e) => setF(e.target.value)} aria-label="Balance filter">
          <option value="all">All balances</option>
          <option value="low">Low balance · CL/SL/EL ≤ 2</option>
          <option value="hiel">High EL · 10+ days</option>
        </select>
        {hasFlt && (
          <button type="button" className="link-btn" onClick={() => (setQ(''), setDept(''), setLoc(''), setF('all'))}>
            Clear
          </button>
        )}
      </div>
      {board.isLoading && <BlockLoader height={300} label="Loading balances…" />}
      {b && (
        <>
          <Grid
            cols={cols}
            minWidth={260 + b.types.length * 92}
            head={[
              'Available / quota',
              ...b.types.map((t) => (
                <span key={t.code} title={t.name}>
                  {t.code}
                </span>
              )),
            ]}
            empty={b.items.length === 0 && <div className="lv-empty">No employees match your search or filters</div>}
          >
            <div style={{ opacity: board.isPlaceholderData ? 0.6 : 1 }}>
              {b.items.map((p) => (
                <Row key={p.id} cols={cols} onClick={() => openLedger(p.id)}>
                  <Who p={p} sub={[p.code, p.department?.name].filter(Boolean).join(' · ')} size={28} />
                  {p.cells.map((c) =>
                    'available' in c ? (
                      <BalCell key={c.code} c={c} />
                    ) : (
                      <span key={c.code} className="muted" title="Not eligible">
                        —
                      </span>
                    ),
                  )}
                </Row>
              ))}
            </div>
          </Grid>
          <Pager page={page} size={size} total={b.total} onPage={setPage} onSize={setSize} sizes={[20, 50, 100]} noun="people" />
        </>
      )}
    </div>
  );
}

function BalCell({ c }: { c: Balance }) {
  const low = ['CL', 'SL', 'EL'].includes(c.code) && Number(c.available) <= 2;
  const [fg] = TYPE_COLORS[c.color] ?? TYPE_COLORS[9];
  return (
    <span className="lv-bal" title={`${c.name}: ${c.available} available of ${c.quota}${c.pending ? ` · ${c.pending} pending` : ''}`}>
      <b style={{ color: low ? 'var(--danger-fg)' : Number(c.available) > 0 ? fg : 'var(--fg-3)' }}>{c.available}</b>
      <small> / {c.quota}</small>
    </span>
  );
}
