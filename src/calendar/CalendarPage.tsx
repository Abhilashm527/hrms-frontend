import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText } from '../lib/http';
import { calApi, type Item } from './api';
import { addD, AUTO, dayLabel, durL, fmtD, isoD, LAYER_COLOR, parseD, timeL, toM } from './util';
import { DeleteConfirm, EventDialog, EventForm, type FormSeed, RoomsDialog, SettingsDialog, SyncDialog } from './CalendarDialogs';

type View = 'day' | 'week' | 'month' | 'agenda';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const H0 = 8;
const H1 = 20;
const PX = 44;

export function CalendarPage() {
  const today = isoD(new Date());
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<View>(() => (localStorage.getItem('ivy-cal-view') as View) || 'month');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [layersOff, setLayersOff] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ivy-cal-layers') || '{}');
    } catch {
      return {};
    }
  });
  const [typesOff, setTypesOff] = useState<Record<string, boolean>>({});
  const [pendOnly, setPendOnly] = useState(false);
  const [form, setForm] = useState<FormSeed | null>(null);
  const [dlg, setDlg] = useState<null | 'settings' | 'sync' | 'rooms'>(null);
  const [delAsk, setDelAsk] = useState<{ id: string; title: string; repeats: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const open = sp.get('event') ? { id: sp.get('event')!, date: sp.get('date') ?? undefined } : null;
  const setOpen = (o: { id: string; date?: string } | null) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        if (o) {
          n.set('event', o.id);
          o.date ? n.set('date', o.date) : n.delete('date');
        } else {
          n.delete('event');
          n.delete('date');
        }
        return n;
      },
      { replace: true },
    );

  useEffect(() => {
    try {
      localStorage.setItem('ivy-cal-view', view);
      localStorage.setItem('ivy-cal-layers', JSON.stringify(layersOff));
    } catch {
      /* private mode */
    }
  }, [view, layersOff]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  // a link from a notification: show the event's month
  useEffect(() => {
    const d = sp.get('date');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setSel(d);
      setMonth(d.slice(0, 7));
    }
  }, []);

  // the visible days: a 6-week month grid and the week around the selected day
  const first = parseD(month + '-01');
  const gridStart = addD(month + '-01', -((first.getDay() + 6) % 7));
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addD(gridStart, i)), [gridStart]);
  const wk0 = addD(sel, -((parseD(sel).getDay() + 6) % 7));
  const wkDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addD(wk0, i)), [wk0]);
  const from = [days[0], wkDays[0]].sort()[0];
  const to = [days[41], wkDays[6]].sort()[1];

  const feed = useQuery({ queryKey: ['calendar', 'feed', from, to], queryFn: () => calApi.feed(from, to), placeholderData: keepPreviousData, staleTime: 30_000 });
  const me = feed.data?.me;
  const isAdmin = !!me?.admin;
  const layerInfo = useMemo(() => Object.fromEntries((me?.layers ?? []).map((l) => [l.key, l])), [me]);
  const items = feed.data?.items ?? [];
  const shown = items.filter((e) => !layersOff[e.layer] && !typesOff[e.type.key] && (!pendOnly || e.status === 'PENDING'));
  const byDay = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const e of shown) (m[e.date] ??= []).push(e);
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    return m;
  }, [shown]);
  const types = useMemo(() => {
    const m = new Map<string, Item['type']>();
    items.forEach((e) => e.type.key !== 'BUSY' && m.set(e.type.key, e.type));
    return [...m.values()];
  }, [items]);
  const visLayers = (me?.layers ?? []).filter((l) => l.see !== 'NONE' || l.key === 'MY' || items.some((e) => e.layer === l.key));
  const canAdd = (me?.layers ?? []).some((l) => l.add);
  const pending = feed.data?.pending ?? 0;
  // once the last pending event is decided, show everything again
  useEffect(() => {
    if (pendOnly && feed.data && feed.data.pending === 0) setPendOnly(false);
  }, [pendOnly, feed.data]);

  const nav = (n: number) => {
    if (view === 'month' || view === 'agenda') {
      const d = parseD(month + '-01');
      d.setMonth(d.getMonth() + n);
      setMonth(isoD(d).slice(0, 7));
      return;
    }
    const d = addD(sel, n * (view === 'week' ? 7 : 1));
    setSel(d);
    setMonth(d.slice(0, 7));
  };
  const title = view === 'day' ? dayLabel(sel) : view === 'week' ? `${fmtD(wkDays[0])} – ${fmtD(wkDays[6])}` : `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  const pick = (d: string) => {
    setSel(d);
    if (d.slice(0, 7) !== month && view !== 'month') setMonth(d.slice(0, 7));
  };
  const openItem = (e: Item) => {
    if (e.id) setOpen({ id: e.id, date: e.occurrence ?? e.date });
  };
  const newEvent = (date = sel) => setForm({ date });

  const pill = (e: Item, compact = false) => {
    const busy = e.vis === 'BUSY';
    const dashed = e.status !== 'LIVE';
    return (
      <span
        key={e.key}
        className={`cal-pill${e.id ? ' click' : ''}`}
        title={`${e.title}${e.start ? ' · ' + timeL(e) : ''}`}
        style={{ background: e.type.bg, color: e.type.fg, borderColor: dashed ? e.type.fg : 'transparent', borderStyle: dashed ? 'dashed' : 'solid', borderLeftColor: LAYER_COLOR[e.layer] }}
        onClick={(ev) => {
          ev.stopPropagation();
          openItem(e);
        }}
      >
        {!compact && e.start && <span className="t">{e.start}</span>}
        <span className="n">
          {busy ? 'Busy' : e.title}
          {e.status === 'PENDING' ? ' · pending' : e.status === 'REJECTED' ? ' · rejected' : ''}
        </span>
      </span>
    );
  };

  const col = (d: string) => {
    const L = byDay[d] ?? [];
    const allDay = L.filter((x) => !x.start);
    const lanes: number[] = [];
    const timed = L.filter((x) => x.start).map((x) => {
      const s = toM(x.start!);
      const e = x.end && toM(x.end) > s ? toM(x.end) : s + 30;
      let k = lanes.findIndex((end) => end <= s);
      if (k < 0) {
        k = lanes.length;
        lanes.push(0);
      }
      lanes[k] = e;
      return { x, s, e, lane: k };
    });
    const n = Math.max(1, lanes.length);
    const cap = (H1 - H0) * PX;
    return {
      allDay,
      timed: timed.map(({ x, s, e, lane }) => {
        const top = Math.min(cap - 22, Math.max(0, ((s - H0 * 60) / 60) * PX));
        const h = Math.max(22, Math.min(cap - top, ((e - Math.max(s, H0 * 60)) / 60) * PX) - 2);
        return { x, top, h, left: (lane / n) * 100, w: 100 / n };
      }),
    };
  };
  const gDays = view === 'day' ? [sel] : wkDays;
  const agenda = days.filter((d) => d.slice(0, 7) === month && (byDay[d] ?? []).length);
  const selItems = byDay[sel] ?? [];

  return (
    <div className="cal-page">
      <div className="cal-bar">
        <span className="cal-nav">
          <button type="button" className="dfx-icon-btn" aria-label="Previous" onClick={() => nav(-1)}>
            {Icon.chevL}
          </button>
          <button type="button" className="dfx-icon-btn" aria-label="Next" onClick={() => nav(1)}>
            {Icon.chevR}
          </button>
        </span>
        <h2 className="cal-title">{title}</h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setMonth(today.slice(0, 7));
            setSel(today);
          }}
        >
          Today
        </button>
        <span style={{ flex: 1 }} />
        {isAdmin && (pending > 0 || pendOnly) && (
          <button
            type="button"
            className={`cal-pend${pendOnly ? ' on' : ''}`}
            onClick={() => {
              if (pendOnly) return setPendOnly(false);
              setPendOnly(true);
              setView('agenda');
              const fp = feed.data?.firstPending;
              if (fp) {
                setMonth(fp.slice(0, 7));
                setSel(fp);
              }
            }}
          >
            {pendOnly ? 'Show all events' : `${pending} awaiting approval`}
          </button>
        )}
        <span className="lv-seg" role="group">
          {(
            [
              ['day', 'Day'],
              ['week', 'Week'],
              ['month', 'Month'],
              ['agenda', 'Agenda'],
            ] as [View, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
              {l}
            </button>
          ))}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDlg('sync')}>
          Sync
        </button>
        {isAdmin && (
          <button type="button" className="dfx-icon-btn" title="Meeting rooms" aria-label="Meeting rooms" onClick={() => setDlg('rooms')}>
            {Icon.pin}
          </button>
        )}
        <button type="button" className="dfx-icon-btn" title="My calendar settings" aria-label="My calendar settings" onClick={() => setDlg('settings')}>
          {Icon.settings}
        </button>
        {canAdd && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => newEvent()}>
            {Icon.plus} New event
          </button>
        )}
      </div>

      <div className="cal-filters">
        <div>
          <span className="cal-flbl">Calendars</span>
          {visLayers.map((l) => {
            const off = !!layersOff[l.key];
            return (
              <button key={l.key} type="button" className={`cal-chip${off ? ' off' : ''}`} title={l.description + (l.see === 'BUSY' ? ' · busy only' : '')} onClick={() => setLayersOff({ ...layersOff, [l.key]: !off })}>
                <span className="sq" style={{ borderColor: l.color, background: off ? 'transparent' : l.color }} />
                {l.name}
                {l.see === 'BUSY' && l.key !== 'MY' && <small>busy only</small>}
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          {me && <span className="cal-tz">Times in {me.timeZone.replace('_', ' ')}</span>}
        </div>
        {types.length > 0 && (
          <div>
            <span className="cal-flbl">Types</span>
            {types.map((t) => {
              const off = !!typesOff[t.key];
              return (
                <button key={t.key} type="button" className={`cal-chip${off ? ' off' : ''}`} onClick={() => setTypesOff({ ...typesOff, [t.key]: !off })}>
                  <span className="dot" style={{ borderColor: t.fg, background: off ? 'transparent' : t.fg }} />
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {feed.isError && !feed.data ? (
        <Alert>{errorText(feed.error)}</Alert>
      ) : !feed.data ? (
        <BlockLoader label="Loading the calendar…" fill />
      ) : (
        <div className="cal-body">
          <div className={`cal-main${feed.isFetching ? ' fetching' : ''}`}>
            {view === 'month' && (
              <>
                <div className="cal-wkhead">
                  {WD.map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
                <div className="cal-month">
                  {days.map((d) => {
                    const L = byDay[d] ?? [];
                    const wd = parseD(d).getDay();
                    return (
                      <div
                        key={d}
                        className={`cal-cell${d === sel ? ' sel' : ''}${wd === 0 || wd === 6 ? ' wk' : ''}${d.slice(0, 7) !== month ? ' out' : ''}`}
                        onClick={() => pick(d)}
                        onDoubleClick={() => canAdd && newEvent(d)}
                      >
                        <span className={`cal-n${d === today ? ' today' : ''}`}>{parseD(d).getDate()}</span>
                        {L.slice(0, 3).map((e) => pill(e))}
                        {L.length > 3 && <span className="cal-more">+{L.length - 3} more</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {(view === 'week' || view === 'day') && (
              <div className="cal-grid">
                <div className="cal-ghead">
                  <span className="cal-gut" />
                  {gDays.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={d === sel ? 'sel' : ''}
                      style={{ color: d === today ? 'var(--brand)' : undefined }}
                      onClick={() => {
                        setSel(d);
                        setView('day');
                      }}
                    >
                      {WD[(parseD(d).getDay() + 6) % 7]} {parseD(d).getDate()}
                    </button>
                  ))}
                </div>
                <div className="cal-allday">
                  <span className="cal-gut">All day</span>
                  {gDays.map((d) => (
                    <div key={d}>{col(d).allDay.map((e) => pill(e, true))}</div>
                  ))}
                </div>
                <div className="cal-hours">
                  <div className="cal-gut">
                    {Array.from({ length: H1 - H0 }, (_, i) => (
                      <span key={i}>{String(H0 + i).padStart(2, '0')}:00</span>
                    ))}
                  </div>
                  {gDays.map((d) => (
                    <div key={d} className="cal-colm" style={{ height: (H1 - H0) * PX }} onDoubleClick={() => canAdd && newEvent(d)}>
                      {d === today && <span className="cal-now" style={{ top: Math.max(0, Math.min((H1 - H0) * PX, ((new Date().getHours() * 60 + new Date().getMinutes() - H0 * 60) / 60) * PX)) }} />}
                      {col(d).timed.map(({ x, top, h, left, w }) => (
                        <div
                          key={x.key}
                          className={`cal-block${x.id ? ' click' : ''}`}
                          title={x.title}
                          style={{ top, height: h, left: `${left}%`, width: `calc(${w}% - 3px)`, background: x.type.bg, color: x.type.fg, borderColor: x.status !== 'LIVE' ? x.type.fg : 'transparent', borderStyle: x.status !== 'LIVE' ? 'dashed' : 'solid', borderLeftColor: LAYER_COLOR[x.layer] }}
                          onClick={() => openItem(x)}
                        >
                          <b>{x.vis === 'BUSY' ? 'Busy' : x.title}</b>
                          <span>{timeL(x)}</span>
                          {h >= 54 && x.vis !== 'BUSY' && (x.room || x.where) && <span>{[x.room?.name, x.where].filter(Boolean).join(' · ')}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {view === 'agenda' && (
              <div className="cal-agenda">
                {agenda.length === 0 && <div className="cal-empty">{pendOnly ? 'Nothing waiting for approval this month' : 'Nothing scheduled this month'}</div>}
                {agenda.map((d) => (
                  <div key={d} className="cal-aday" onClick={() => pick(d)}>
                    <div className="cal-adate" style={{ color: d === today ? 'var(--brand)' : undefined }}>
                      <b>{parseD(d).getDate()}</b>
                      <small>
                        {WD[(parseD(d).getDay() + 6) % 7]}
                        {d === today ? ' · Today' : ''}
                      </small>
                    </div>
                    <div className="cal-aitems">
                      {(byDay[d] ?? []).map((e) => (
                        <div
                          key={e.key}
                          className={`cal-aitem${e.id ? ' click' : ''}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            pick(d);
                            openItem(e);
                          }}
                        >
                          <span className="tm">{timeL(e)}</span>
                          <span className="bd" style={{ borderLeftColor: LAYER_COLOR[e.layer] }}>
                            <b>
                              {e.vis === 'BUSY' ? 'Busy' : e.title}
                              {e.status === 'PENDING' && <em className="cal-st pend">Pending</em>}
                              {e.status === 'REJECTED' && <em className="cal-st rej">Rejected</em>}
                            </b>
                            {e.vis !== 'BUSY' && (e.room || e.where) && <small>{[e.room?.name, e.where].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ')}</small>}
                          </span>
                          <span className="cal-kind" style={{ background: e.type.bg, color: e.type.fg }}>
                            {e.type.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="cal-side">
            <div className="cal-side-head">
              <span>
                <b>{dayLabel(sel).split(',')[0]}</b>
                <small>{fmtD(sel)}</small>
              </span>
              {canAdd && (
                <button type="button" className="dfx-icon-btn" aria-label="Add event on this day" title="Add event on this day" onClick={() => newEvent(sel)}>
                  {Icon.plus}
                </button>
              )}
            </div>
            {selItems.length === 0 && <div className="cal-empty sm">Nothing scheduled</div>}
            <div className="cal-side-list">
              {selItems.map((e) => {
                const busy = e.vis === 'BUSY';
                const meta = [layerInfo[e.layer]?.name, durL(e.start, e.end), e.audienceLabel, e.repeat === 'WEEKLY' ? 'Weekly' : e.repeat === 'MONTHLY' ? 'Monthly' : ''].filter(Boolean).join(' · ');
                return (
                  <div key={e.key} className={`cal-sitem${e.id ? ' click' : ''}`} onClick={() => openItem(e)}>
                    <span className="bar" style={{ background: LAYER_COLOR[e.layer] }} />
                    <div>
                      <b>
                        {busy ? 'Busy' : e.title}
                        {e.status === 'PENDING' && <em className="cal-st pend">Pending</em>}
                        {e.status === 'REJECTED' && <em className="cal-st rej">Rejected</em>}
                      </b>
                      <span className="row">
                        <span className="tm">{timeL(e)}</span>
                        <span className="cal-kind" style={{ background: busy ? 'var(--bg-3)' : e.type.bg, color: busy ? 'var(--fg-2)' : e.type.fg }}>
                          {busy ? 'Busy' : e.type.name}
                        </span>
                      </span>
                      {!busy && (e.room || e.where) && <small>{[e.room?.name, e.where].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ')}</small>}
                      {!busy && meta && <small>{meta}</small>}
                      {e.tzNote && <small>Organiser’s time · {e.tzNote}</small>}
                      <small className="org">{busy ? 'Details are private' : e.organiser ? `Organised by ${e.organiser.name}` : e.auto ? AUTO[e.source] : ''}</small>
                    </div>
                    {e.canEdit && e.id && (
                      <button
                        type="button"
                        className="cal-del"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setDelAsk({ id: e.id!, title: e.title, repeats: !!e.repeat && e.repeat !== 'NONE' });
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {open && (
        <EventDialog
          id={open.id}
          date={open.date}
          layers={layerInfo}
          onClose={() => setOpen(null)}
          onEdit={(d) => {
            setOpen(null);
            setForm({ edit: d });
          }}
          onDelete={(d) => setDelAsk({ id: d.id!, title: d.title, repeats: !!d.repeat && d.repeat !== 'NONE' })}
          toast={setToast}
        />
      )}
      {form && (
        <EventForm
          seed={form}
          onClose={() => setForm(null)}
          onSaved={(d, msg) => {
            setForm(null);
            setToast(msg);
            setSel(d.startsOn);
            setMonth(d.startsOn.slice(0, 7));
          }}
        />
      )}
      {delAsk && (
        <DeleteConfirm
          ask={delAsk}
          onClose={() => setDelAsk(null)}
          onDone={() => {
            setDelAsk(null);
            setOpen(null);
            setToast('Event deleted');
          }}
        />
      )}
      {dlg === 'settings' && me && <SettingsDialog onClose={() => setDlg(null)} toast={setToast} />}
      {dlg === 'sync' && <SyncDialog from={view === 'month' || view === 'agenda' ? days[0] : gDays[0]} to={view === 'month' || view === 'agenda' ? days[41] : gDays[gDays.length - 1]} onClose={() => setDlg(null)} toast={setToast} />}
      {dlg === 'rooms' && <RoomsDialog onClose={() => setDlg(null)} toast={setToast} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
