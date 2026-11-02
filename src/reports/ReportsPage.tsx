import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { Kpi } from '../leave/ui';
import { blob, errorText, get } from '../lib/http';
import { save } from '../payroll/api';

type Col = { key: string; label: string; type: 'text' | 'number' | 'date' | 'money' | 'pct' };
type Catalog = {
  reports: { key: string; name: string; category: string; description: string; period: boolean }[];
  kpis: Partial<Record<'headcount' | 'joined30' | 'left30' | 'attrition12' | 'onLeaveToday' | 'openJobs', number>>;
};
type Result = { key: string; name: string; description: string; period: boolean; from: string; to: string; columns: Col[]; rows: (string | number | null)[][] };

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const dfmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
function fmt(v: string | number | null, t: Col['type']) {
  if (v == null || v === '') return '—';
  if (t === 'money') return `₹${money.format(Number(v))}`;
  if (t === 'pct') return `${Number(v)}%`;
  if (t === 'date') return dfmt.format(new Date(`${v}T00:00:00`));
  if (t === 'number') return Number(v).toLocaleString('en-IN');
  return String(v);
}
const num = (t: Col['type']) => t === 'number' || t === 'money' || t === 'pct';

/** Ready-made reports across modules, each limited to what the viewer's role can see. */
export function ReportsPage() {
  const [sp, setSp] = useSearchParams();
  const cat = useQuery({ queryKey: ['reports'], queryFn: () => get<Catalog>('/reports') });
  const key = sp.get('r') ?? cat.data?.reports[0]?.key ?? null;
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) }).toString();
  const run = useQuery({ queryKey: ['reports', key, qs], queryFn: () => get<Result>(`/reports/${key}${qs ? `?${qs}` : ''}`), enabled: !!key });
  const rows = useMemo(() => {
    const r = run.data;
    if (!r) return [];
    let list = text ? r.rows.filter((row) => row.some((v) => v != null && String(v).toLowerCase().includes(text.toLowerCase()))) : r.rows;
    if (sort) {
      const t = r.columns[sort.i].type;
      list = [...list].sort((a, b) => {
        const x = a[sort.i];
        const y = b[sort.i];
        if (x == null) return 1;
        if (y == null) return -1;
        return (num(t) ? Number(x) - Number(y) : String(x).localeCompare(String(y))) * sort.dir;
      });
    }
    return list;
  }, [run.data, sort, text]);

  if (cat.isLoading) return <BlockLoader page label="Loading reports…" />;
  if (cat.isError || !cat.data) return <Alert>{errorText(cat.error)}</Alert>;
  const groups = Array.from(new Set(cat.data.reports.map((r) => r.category)));
  const k = cat.data.kpis;
  const pick = (r: string) => {
    setSp({ r }, { replace: true });
    setRange({ from: '', to: '' });
    setSort(null);
    setText('');
    setErr(null);
  };
  const download = async () => {
    try {
      setErr(null);
      await save(await blob(`/reports/${key}/csv${qs ? `?${qs}` : ''}`), `${key}-${run.data?.from}-to-${run.data?.to}.csv`);
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const r = run.data;
  const totals = r && rows.length > 1 ? r.columns.map((c, i) => (c.type === 'number' || c.type === 'money' ? rows.reduce((s, row) => s + Number(row[i] ?? 0), 0) : null)) : null;

  return (
    <div className="py-page">
      <div className="ml-top">
        <span>
          <h1>Reports</h1>
          <small>Ready-made reports you can filter, sort and download</small>
        </span>
      </div>
      {Object.keys(k).length > 0 && (
        <div className="lv-kpis six">
          {k.headcount != null && <Kpi label="Headcount" value={k.headcount} sub="active and on notice" />}
          {k.joined30 != null && <Kpi label="Joined" value={k.joined30} sub="last 30 days" />}
          {k.left30 != null && <Kpi label="Left" value={k.left30} sub="last 30 days" />}
          {k.attrition12 != null && <Kpi label="Attrition" value={`${k.attrition12}%`} sub="last 12 months" />}
          {k.onLeaveToday != null && <Kpi label="On leave today" value={k.onLeaveToday} />}
          {k.openJobs != null && <Kpi label="Open jobs" value={k.openJobs} />}
        </div>
      )}
      {cat.data.reports.length === 0 ? (
        <div className="py-empty">
          <b>No reports for your role</b>
          <span>Reports follow module access — ask an admin for View on the modules you need.</span>
        </div>
      ) : (
        <div className="rp-wrap">
          <nav className="rp-list" aria-label="Reports">
            {groups.map((g) => (
              <div key={g}>
                <span className="py-sec">{g}</span>
                {cat.data.reports
                  .filter((x) => x.category === g)
                  .map((x) => (
                    <button key={x.key} type="button" className={`rp-item${x.key === key ? ' on' : ''}`} aria-current={x.key === key} onClick={() => pick(x.key)}>
                      {x.name}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <section className="py-run rp-main">
            {!r ? (
              run.isError ? (
                <Alert>{errorText(run.error)}</Alert>
              ) : (
                <BlockLoader label="Running the report…" height={200} />
              )
            ) : (
              <>
                <div className="py-run-head">
                  <span>
                    <b>{r.name}</b>
                    <small>{r.description}</small>
                  </span>
                </div>
                <div className="rp-bar">
                  {r.period && (
                    <>
                      <label>
                        From
                        <input className="input sm" type="date" value={range.from || r.from} max={range.to || r.to} onChange={(e) => setRange((o) => ({ ...o, from: e.target.value }))} />
                      </label>
                      <label>
                        To
                        <input className="input sm" type="date" value={range.to || r.to} onChange={(e) => setRange((o) => ({ ...o, to: e.target.value }))} />
                      </label>
                    </>
                  )}
                  <input className="input sm rp-find" placeholder="Filter rows…" value={text} onChange={(e) => setText(e.target.value)} />
                  <span className="ml-muted">
                    {rows.length} row{rows.length === 1 ? '' : 's'}
                    {run.isFetching ? ' · updating…' : ''}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={download} disabled={!r.rows.length}>
                    {Icon.download} Download CSV
                  </button>
                </div>
                {err && <Alert>{err}</Alert>}
                <div className="rp-table">
                  <table>
                    <thead>
                      <tr>
                        {r.columns.map((c, i) => (
                          <th key={c.key} className={num(c.type) ? 'n' : ''} aria-sort={sort?.i === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                            <button type="button" onClick={() => setSort((s) => (s?.i === i ? (s.dir === 1 ? { i, dir: -1 } : null) : { i, dir: 1 }))}>
                              {c.label}
                              {sort?.i === i ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={r.columns.length} className="rp-empty">
                            Nothing for this {r.period ? 'period' : 'report'} yet.
                          </td>
                        </tr>
                      )}
                      {rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((v, i) => (
                            <td key={i} className={num(r.columns[i].type) ? 'n' : ''}>
                              {fmt(v, r.columns[i].type)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {totals && totals.some((x) => x != null) && (
                      <tfoot>
                        <tr>
                          {totals.map((t, i) => (
                            <td key={i} className={t != null ? 'n' : ''}>
                              {i === 0 && t == null ? 'Total' : t != null ? fmt(Math.round(t * 100) / 100, r.columns[i].type) : ''}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
