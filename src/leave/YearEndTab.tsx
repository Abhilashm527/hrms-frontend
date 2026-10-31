import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { leaveApi } from './api';
import { Grid, Kpi, Modal, Pager, Row, Who, fmtDate, inr } from './ui';

const COLS = 'minmax(130px,1.6fr) repeat(4,minmax(46px,1fr)) minmax(76px,1fr)';

export function YearEndTab({ openLedger }: { openLedger: (id: string, year: number) => void }) {
  const qc = useQueryClient();
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now);
  const [type, setType] = useState('');
  const [page, setPage] = useState(0);
  const [run, setRun] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setPage(0), [year, type]);
  const q = useQuery({ queryKey: ['leave', 'year-end', year, type, page], queryFn: () => leaveApi.yearEnd(year, type, page), placeholderData: keepPreviousData });
  const y = q.data;
  const reopen = useMutation({
    meta: { busy: `Reopening ${year}…` },
    mutationFn: () => leaveApi.reopenYear(year),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['leave'] }), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const t = y?.type;
  const rule = t ? `${t.name}: carry forward ${t.carry === 'ALL' ? 'all unused' : t.carry === 'UPTO' ? `up to ${t.carryMax} days` : 'none'}${t.encashable ? ` · encash up to ${Number(t.encashMax) || 'all'} days of the excess` : ' · not encashable'} · rest lapses` : '';

  return (
    <div className="lv-stack">
      <PermissionsNotice errors={[q.error]} />
      <div className="lv-bar">
        <select className="sel" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
          {(y?.years ?? [now, now - 1, now - 2]).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <div className="lv-chips">
          {y?.types.map((x) => (
            <button key={x.code} type="button" className={`lv-fchip${(type || t?.code) === x.code ? ' on' : ''}`} onClick={() => setType(x.code)}>
              {x.code} · {x.short}
            </button>
          ))}
        </div>
        <span className="grow" />
        {y?.canManage && !y.closed && (
          <button type="button" className="btn btn-primary btn-sm" disabled={!y.canClose} title={y.canClose ? undefined : 'A year can be closed from December onwards'} onClick={() => setRun(true)}>
            Run year-end
          </button>
        )}
        {y?.canManage && y.closed && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => confirm(`Reopen ${year}? Carry forward, lapses and year-end encashments posted by the close are removed.`) && reopen.mutate()}>
            Reopen year
          </button>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      {y && (
        <div className={`lv-banner ${y.closed ? 'done' : 'open'}`}>
          {y.closed
            ? `Closed on ${fmtDate(y.closed.closedAt)} by ${y.closed.closedByPerson?.name ?? 'HR'} · balances carried into ${year + 1}`
            : `Projected from balances as of ${fmtDate(new Date().toISOString())} · runs on 31 Dec ${year}`}
        </div>
      )}
      {rule && <span className="field-hint">{rule}</span>}
      {q.isLoading && <BlockLoader height={300} label="Working out the year-end…" />}
      {y && (
        <>
          <div className="lv-kpis five">
            <Kpi label="People" value={y.people} />
            <Kpi label="Closing balance" value={`${y.summary.closing} days`} />
            <Kpi label="Carry forward" value={`${y.summary.carry} days`} />
            <Kpi label={y.closed ? 'Encashed' : 'Encash (eligible)'} value={`${y.summary.encash} days · ${inr(y.summary.encashAmount)}`} />
            <Kpi label="Lapse" value={`${y.summary.lapse} days`} />
          </div>
          <Grid cols={COLS} minWidth={640} head={['Person', 'Closing', 'Carry fwd', 'Encash', 'Lapse', 'Encash amount']} empty={y.items.length === 0 && <div className="lv-empty">Nobody has a {t?.code} balance for {year}</div>}>
            <div style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
              {y.items.map((r) => (
                <Row key={r.id} cols={COLS} onClick={() => openLedger(r.id, year)}>
                  <Who p={r} sub={[r.code, r.department?.name].filter(Boolean).join(' · ')} size={26} />
                  <span className="num">{r.closing}</span>
                  <span className="num">{r.carry}</span>
                  <span className="num">{r.encash}</span>
                  <span className="num" style={{ color: Number(r.lapse) > 0 ? 'var(--danger-fg)' : undefined }}>
                    {r.lapse}
                  </span>
                  <span className="num">{Number(r.encashAmount) ? inr(r.encashAmount) : '—'}</span>
                </Row>
              ))}
            </div>
          </Grid>
          <Pager page={page} size={y.size} total={y.total} onPage={setPage} noun="people" />
        </>
      )}
      {run && y && <RunModal year={year} people={y.people} types={y.types.length} encashable={y.encashableTypes} onClose={() => setRun(false)} onDone={() => (setRun(false), qc.invalidateQueries({ queryKey: ['leave'] }))} />}
    </div>
  );
}

function RunModal({ year, people, types, encashable, onClose, onDone }: { year: number; people: number; types: number; encashable: string[]; onClose: () => void; onDone: () => void }) {
  const [encash, setEncash] = useState(encashable.length > 0);
  const go = useMutation({ meta: { busy: `Closing ${year}…` }, mutationFn: () => leaveApi.closeYear(year, encash), onSuccess: onDone });
  return (
    <Modal
      title={`Run year-end for ${year}`}
      sub="Closes the leave year and carries balances forward"
      onClose={onClose}
      width={460}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => go.mutate()}>
            Close year
          </button>
        </>
      }
    >
      {go.isError && <Alert>{errorText(go.error)}</Alert>}
      <span className="lv-text">
        Close {year} for {people} employees across {types} leave types. Balances above the carry-forward limit lapse.
      </span>
      {encashable.length > 0 && (
        <label className="lv-inline">
          <button type="button" className="switch" role="switch" aria-checked={encash} onClick={() => setEncash(!encash)} />
          Create encashment for eligible {encashable.join(', ')} balances (sent to payroll)
        </label>
      )}
    </Modal>
  );
}
