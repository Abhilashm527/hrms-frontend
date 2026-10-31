import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { leaveApi, type HolidayYear } from './api';
import { fmtDate } from './ui';

const COLS = '124px 44px minmax(0,1fr) 120px 90px 32px';
const dow = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const day = (d: string) => (d ? dow.format(new Date(`${d}T00:00:00`)) : '');

export function HolidaysTab() {
  const qc = useQueryClient();
  const cals = useQuery({ queryKey: ['leave', 'calendars'], queryFn: leaveApi.calendars, staleTime: 10 * 60_000 });
  const [cal, setCal] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [nd, setNd] = useState({ date: '', name: '', typeId: '' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!cal && cals.data?.length) setCal((cals.data.find((c) => !c.state) ?? cals.data[0]).id);
  }, [cals.data, cal]);
  const q = useQuery({ queryKey: ['leave', 'holidays', cal, year], queryFn: () => leaveApi.holidayYear(cal, year), enabled: !!cal });
  const h = q.data;
  useEffect(() => {
    if (h && !nd.typeId && h.types.length) setNd((n) => ({ ...n, typeId: h.types[0].id }));
  }, [h, nd.typeId]);
  useEffect(() => (setAdding(false), setErr(null)), [cal, year]);
  const put = (r: HolidayYear) => {
    qc.setQueryData(['leave', 'holidays', cal, year], r);
    qc.invalidateQueries({ queryKey: ['attendance'] });
    setErr(null);
  };
  const m = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<HolidayYear>; busy: string }) => v.run(),
    onSuccess: put,
    onError: (e) => (setErr(errorText(e)), qc.invalidateQueries({ queryKey: ['leave', 'holidays', cal, year] })),
  });
  const locked = !!h?.closed;
  const editable = !!h?.canEdit && !locked;
  const typeOf = (id: string) => h?.types.find((t) => t.id === id);
  const now = new Date().getFullYear();

  return (
    <div className="lv-stack">
      <PermissionsNotice errors={[cals.error, q.error]} />
      <div className="lv-bar">
        {cals.data && cals.data.length > 1 && (
          <select className="sel" value={cal} onChange={(e) => setCal(e.target.value)} aria-label="Holiday calendar">
            {cals.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="lv-yearnav">
          <button type="button" className="dfx-icon-btn" title="Previous year" onClick={() => setYear(year - 1)}>
            {Icon.chevL}
          </button>
          <select className="sel" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {[now - 2, now - 1, now, now + 1, now + 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button type="button" className="dfx-icon-btn" title="Next year" onClick={() => setYear(year + 1)}>
            {Icon.chevR}
          </button>
        </div>
        {h && (
          <div className="lv-chips">
            {h.types.map((t) => {
              const n = h.holidays.filter((x) => x.typeId === t.id).length;
              return (
                <span key={t.id} className="lv-stat">
                  <i style={{ background: t.fg }} />
                  {n} {t.name.toLowerCase()}
                </span>
              );
            })}
          </div>
        )}
        <span className="grow" />
        {editable && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => confirm(`Close ${year}? Holidays become read-only until it is reopened.`) && m.mutate({ run: () => leaveApi.closeHolidayYear(cal, year), busy: `Closing ${year}…` })}>
              Close {year}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              {Icon.plus} Add holiday
            </button>
          </>
        )}
        {h?.canEdit && locked && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => m.mutate({ run: () => leaveApi.reopenHolidayYear(cal, year), busy: `Reopening ${year}…` })}>
            Reopen {year}
          </button>
        )}
      </div>
      {locked && h?.closed && (
        <div className="lv-banner done">
          {Icon.check} {year} calendar closed on {fmtDate(h.closed.closedAt)} by {h.closed.closedBy ?? 'HR'} · holidays are read-only
        </div>
      )}
      {err && <Alert>{err}</Alert>}
      {(q.isLoading || cals.isLoading) && <BlockLoader height={300} label="Loading holidays…" />}
      {h && (
        <div className="lv-tbl">
          <div style={{ minWidth: 620 }}>
            <div className="lv-head" style={{ gridTemplateColumns: COLS }}>
              {['Date', 'Day', 'Holiday', 'Type', 'Status', ''].map((x, i) => (
                <span key={i}>{x}</span>
              ))}
            </div>
            {h.holidays.map((x) => {
              const t = typeOf(x.typeId);
              const ro = !editable || x.inherited;
              const past = x.date < new Date().toISOString().slice(0, 10);
              return (
                <div key={`${x.id}|${x.date}|${x.name}|${x.typeId}`} className="lv-row" style={{ gridTemplateColumns: COLS, opacity: past ? 0.6 : 1 }}>
                  <input
                    type="date"
                    className="input sm"
                    defaultValue={x.date}
                    min={`${year}-01-01`}
                    max={`${year}-12-31`}
                    disabled={ro}
                    onChange={(e) => e.target.value && e.target.value !== x.date && m.mutate({ run: () => leaveApi.updateHoliday(cal, x.id, { date: e.target.value }), busy: 'Saving holiday…' })}
                  />
                  <span className="muted">{day(x.date)}</span>
                  <input
                    className="input sm"
                    defaultValue={x.name}
                    disabled={ro}
                    placeholder="Holiday name"
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== x.name && m.mutate({ run: () => leaveApi.updateHoliday(cal, x.id, { name: e.target.value.trim() }), busy: 'Saving holiday…' })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  <select
                    className="input sm lv-holtype"
                    value={x.typeId}
                    disabled={ro}
                    style={t ? { color: t.fg, backgroundColor: t.bg, borderColor: 'transparent' } : undefined}
                    onChange={(e) => m.mutate({ run: () => leaveApi.updateHoliday(cal, x.id, { typeId: e.target.value }), busy: 'Saving holiday…' })}
                  >
                    {h.types.map((ty) => (
                      <option key={ty.id} value={ty.id}>
                        {ty.name}
                      </option>
                    ))}
                  </select>
                  <span className="muted ell" title={x.inherited ? 'From the national calendar · edit it there' : undefined}>
                    {x.inherited ? 'National' : past ? 'Past' : t?.dayOff ? 'Day off' : 'Working day'}
                  </span>
                  {editable && !x.inherited ? (
                    <button type="button" className="dfx-icon-btn" title="Delete holiday" onClick={() => confirm(`Delete ${x.name}?`) && m.mutate({ run: () => leaveApi.deleteHoliday(cal, x.id), busy: 'Deleting holiday…' })}>
                      {Icon.trash}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
            {h.holidays.length === 0 && !adding && <div className="lv-empty">No holidays defined for {year} yet.{editable ? ' Click Add holiday to create one.' : ''}</div>}
            {adding && (
              <>
                <div className="lv-row add" style={{ gridTemplateColumns: COLS }}>
                  <input type="date" className="input sm" autoFocus value={nd.date} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setNd({ ...nd, date: e.target.value })} />
                  <span className="muted">{day(nd.date)}</span>
                  <input
                    className="input sm"
                    value={nd.name}
                    onChange={(e) => setNd({ ...nd, name: e.target.value })}
                    placeholder="New holiday name"
                    onKeyDown={(e) => e.key === 'Enter' && document.getElementById('lv-hol-save')?.click()}
                  />
                  <select className="input sm" value={nd.typeId} onChange={(e) => setNd({ ...nd, typeId: e.target.value })}>
                    {h.types.map((ty) => (
                      <option key={ty.id} value={ty.id}>
                        {ty.name}
                      </option>
                    ))}
                  </select>
                  <span className="muted">{typeOf(nd.typeId)?.dayOff ? 'Day off' : 'Working day'}</span>
                  <span />
                </div>
                <div className="lv-add-foot">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setAdding(false), setNd({ date: '', name: '', typeId: nd.typeId }))}>
                    Cancel
                  </button>
                  <button
                    id="lv-hol-save"
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!nd.date || !nd.name.trim()}
                    onClick={() =>
                      m.mutate(
                        { run: () => leaveApi.addHoliday(cal, { date: nd.date, name: nd.name.trim(), typeId: nd.typeId }), busy: 'Adding holiday…' },
                        { onSuccess: () => (setAdding(false), setNd({ date: '', name: '', typeId: nd.typeId })) },
                      )
                    }
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <span className="field-hint">Day-off holiday types (such as national and regional) are excluded from leave day counts. Working-day types (such as optional holidays) are listed for employees but still count as working days.</span>
    </div>
  );
}
