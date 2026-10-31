import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { ApiError, errorText, fieldErrors } from '../lib/http';
import { Modal } from '../leave/ui';
import { PersonPicker, useLocations } from '../onboarding/shared';
import { calApi, type Detail, type EventBody, type Layer, type LayerKey, REMIND, type Remind, type Room, type Rsvp, ZONES, zoneLabel } from './api';
import { dayLabel, durL, fmtD, LAYER_COLOR, timeL } from './util';

const AUTO_NOTE = 'In-app reminder to everyone invited';
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['calendar'] });
};
const save = (blob: Blob, name: string) => {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};
const stamp = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// -------------------------------------------------------------------------------------------------------------- event details

export function EventDialog({ id, date, layers, onClose, onEdit, onDelete, toast }: { id: string; date?: string; layers: Record<string, Layer>; onClose: () => void; onEdit: (d: Detail) => void; onDelete: (d: Detail) => void; toast: (t: string) => void }) {
  const q = useQuery({ queryKey: ['calendar', 'event', id, date ?? ''], queryFn: () => calApi.event(id, date), retry: false });
  const inval = useInvalidate();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const act = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<unknown>; busy: string; done: string }) => v.run(),
    onSuccess: (_r, v) => {
      inval();
      toast(v.done);
      setRejecting(false);
      setErr(null);
    },
    onError: (e) => setErr(errorText(e)),
  });
  const ics = useMutation({
    meta: { busy: 'Preparing the calendar file…' },
    mutationFn: () => calApi.eventIcs(id, date),
    onSuccess: (b) => {
      save(b, (q.data?.title || 'event').replace(/[^\w]+/g, '-').toLowerCase() + '.ics');
      toast('Calendar file downloaded');
    },
    onError: (e) => setErr(errorText(e)),
  });
  const d = q.data;
  const busy = d?.vis === 'BUSY';
  const layerName = (k: LayerKey) => layers[k]?.name ?? k;
  const rows: [string, string, string?][] = !d
    ? []
    : busy
      ? [
          ['When', dayLabel(d.date), timeL(d)],
          ['Calendar', layerName(d.layer)],
        ]
      : ([
          ['When', dayLabel(d.date), [timeL(d), durL(d.start, d.end), zoneLabel(d.viewerZone)].filter(Boolean).join(' · ') + (d.tzNote ? ` (${d.tzNote})` : '')],
          d.repeat && d.repeat !== 'NONE' ? ['Repeats', d.repeat === 'WEEKLY' ? `Every ${dayLabel(d.startsOn).split(',')[0]}` : `Monthly on day ${Number(d.startsOn.slice(8))}`, d.until ? `Until ${fmtD(d.until)}` : 'No end date'] : null,
          d.room ? ['Room', d.room.name, [d.room.capacity ? `${d.room.capacity} seats` : '', d.room.location].filter(Boolean).join(' · ')] : null,
          d.where && d.where !== d.room?.name ? ['Where', d.where] : null,
          ['Calendar', layerName(d.layer), d.private ? 'Private · others see “Busy”' : d.sensitive ? 'Sensitive · HR, organiser and invitees only' : ''],
          ['Who’s invited', d.audienceLabel ?? '', d.audience.type === 'PEOPLE' ? d.audience.people.map((p) => p.name).join(', ') : `${d.invitedCount} ${d.invitedCount === 1 ? 'person' : 'people'}`],
          ['Organiser', d.organiser?.name ?? '—'],
          d.remind && d.remind !== 'NONE' ? ['Reminder', REMIND.find(([k]) => k === d.remind)?.[1] ?? '', AUTO_NOTE] : null,
          d.status === 'PENDING' ? ['Status', 'Awaiting HR approval', 'Not visible to invitees yet'] : d.status === 'REJECTED' ? ['Status', 'Rejected by HR', d.canEdit ? 'Edit it to send it for approval again' : ''] : null,
          d.notes ? ['Notes', d.notes] : null,
        ].filter(Boolean) as [string, string, string?][]);
  const rsvp = (a: Rsvp) => act.mutate({ run: () => calApi.rsvp(id, a), busy: 'Sending your reply…', done: a === 'YES' ? 'You’re going' : a === 'MAYBE' ? 'Marked as maybe' : 'Declined · organiser notified' });

  return (
    <Modal
      width={540}
      title={
        <span className="cal-dtitle">
          <span className="bar" style={{ background: d ? LAYER_COLOR[d.layer] : 'var(--border)' }} />
          <span>
            {d && (
              <span className="cal-kind" style={{ background: busy ? 'var(--bg-3)' : d.type.bg, color: busy ? 'var(--fg-2)' : d.type.fg }}>
                {busy ? 'Busy' : d.type.name}
              </span>
            )}
            <b>{d ? (busy ? 'Busy' : d.title) : 'Event'}</b>
          </span>
        </span>
      }
      onClose={onClose}
      foot={
        d ? (
          <>
            {d.canDelete && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(d)}>
                {Icon.trash} Delete
              </button>
            )}
            {d.canEdit && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(d)}>
                Edit
              </button>
            )}
            <span style={{ flex: 1 }} />
            {!busy && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => ics.mutate()}>
                {Icon.download} Add to my calendar
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {q.isLoading && <BlockLoader label="Opening the event…" height={200} />}
      {q.isError && <Alert>{q.error instanceof ApiError && q.error.status === 404 ? 'This event was removed, or you can’t see it any more.' : errorText(q.error)}</Alert>}
      {err && <Alert>{err}</Alert>}
      {d && (
        <div className="cal-detail">
          {d.canApprove && (
            <div className="cal-appr">
              {!rejecting ? (
                <>
                  <span>Awaiting your approval. Invitees won’t see it until it’s approved.</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(true)}>
                    Reject
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => act.mutate({ run: () => calApi.approve(id), busy: 'Approving the event…', done: 'Approved · now visible to invitees' })}>
                    Approve
                  </button>
                </>
              ) : (
                <>
                  <input className="input sm" autoFocus placeholder="Reason (the organiser sees this)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>
                    Back
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => act.mutate({ run: () => calApi.reject(id, note), busy: 'Rejecting the event…', done: 'Rejected · organiser notified' })}>
                    Reject
                  </button>
                </>
              )}
            </div>
          )}
          <div className="cal-rows">
            {rows.map(([k, v, sub]) => (
              <div key={k}>
                <span>{k}</span>
                <span>
                  <b>{v}</b>
                  {sub && <small>{sub}</small>}
                </span>
              </div>
            ))}
            {busy && <div className="cal-busynote">The organiser marked this event private, or your role sees this calendar as busy only.</div>}
          </div>
          {d.canRsvp && !busy && (
            <div className="cal-rsvp">
              <span>Going?</span>
              {(
                [
                  ['YES', 'Going'],
                  ['MAYBE', 'Maybe'],
                  ['NO', 'Can’t go'],
                ] as [Rsvp, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" className={d.myRsvp === k ? (k === 'NO' ? 'on no' : 'on') : ''} onClick={() => rsvp(k)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {d.responses && (
            <div className="cal-resp">
              <span>Responses</span>
              <b>
                {d.responses.yes} going · {d.responses.maybe} maybe · {d.responses.no} declined · {d.responses.none} no reply
              </b>
              {d.responses.list.length > 0 && (
                <small>
                  {d.responses.list
                    .slice(0, 12)
                    .map((r) => `${r.name} (${r.answer === 'YES' ? 'going' : r.answer === 'NO' ? 'declined' : 'maybe'})`)
                    .join(', ')}
                  {d.responses.list.length > 12 ? ` +${d.responses.list.length - 12}` : ''}
                </small>
              )}
            </div>
          )}
          {d.log.length > 0 && (
            <div className="cal-log">
              <span>History</span>
              {d.log.map((l, i) => (
                <div key={i}>
                  <small>{stamp(l.at)}</small>
                  <span>
                    {l.action} · {l.by}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------------------------------------------------- new / edit

export type FormSeed = { date?: string; edit?: Detail };

const audienceOf = (d: Detail) => {
  const a = d.audience;
  if (a.type === 'ALL' || a.type === 'ME' || a.type === 'PEOPLE') return a.type;
  if (a.type === 'ROLE') return `ROLE:${a.roles.join(',')}`;
  return `${a.type}:${a.ref}`;
};

export function EventForm({ seed, onClose, onSaved }: { seed: FormSeed; onClose: () => void; onSaved: (d: Detail, msg: string) => void }) {
  const opts = useQuery({ queryKey: ['calendar', 'options'], queryFn: calApi.options, staleTime: 60_000 });
  const inval = useInvalidate();
  const e = seed.edit;
  const [f, setF] = useState<EventBody | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>(e?.audience.people.filter((p) => p.id !== e.organiser?.id) ?? []);
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});

  // first fill once the options are known
  useEffect(() => {
    if (f || !opts.data) return;
    const o = opts.data;
    if (e) {
      setF({
        editId: e.id!,
        title: e.title,
        layer: e.layer,
        typeId: e.typeId,
        date: e.startsOn,
        allDay: !e.startTime,
        start: e.startTime ?? '10:00',
        end: e.endTime ?? '10:30',
        timeZone: e.timeZone === o.timeZone ? '' : e.timeZone,
        where: e.where ?? '',
        roomId: e.room?.id ?? '',
        audience: audienceOf(e),
        people: [],
        private: !!e.private,
        sensitive: !!e.sensitive,
        repeat: e.repeat ?? 'NONE',
        until: e.until ?? '',
        remind: e.remind ?? 'NONE',
        notes: e.notes ?? '',
      });
      return;
    }
    const layer = o.layers.find((l) => l.key === 'MY') ? (o.layers.length > 1 && o.layers.some((l) => l.key === 'TEAM') ? 'TEAM' : 'MY') : o.layers[0]?.key;
    const L = o.layers.find((l) => l.key === layer);
    setF({
      title: '',
      layer: layer ?? 'MY',
      typeId: o.types.find((t) => t.key === 'MEETING')?.id ?? o.types[0]?.id ?? '',
      date: seed.date ?? new Date().toISOString().slice(0, 10),
      allDay: false,
      start: '10:00',
      end: '10:30',
      timeZone: '',
      where: '',
      roomId: '',
      audience: L?.audiences[0]?.value ?? 'ME',
      people: [],
      private: layer === 'MY',
      sensitive: false,
      repeat: 'NONE',
      until: '',
      remind: o.remind ?? '15M',
      notes: '',
    });
  }, [opts.data, f, e, seed.date]);

  const body = useMemo<EventBody | null>(() => (f ? { ...f, people: people.map((p) => p.id), timeZone: f.timeZone || undefined } : null), [f, people]);
  const [check, setCheck] = useState<{ errors: { field: string; message: string }[]; warnings: string[]; needsApproval: boolean } | null>(null);
  useEffect(() => {
    if (!body) return;
    const t = setTimeout(() => {
      calApi
        .check(body)
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [body]);

  const mut = useMutation({
    meta: { busy: e ? 'Saving the event…' : 'Adding the event…' },
    mutationFn: (b: EventBody) => (e ? calApi.update(e.id!, b, e.version) : calApi.create(b)),
    onSuccess: (d) => {
      inval();
      const solo = d.audience.type === 'ME';
      onSaved(d, d.status === 'PENDING' && !e ? 'Sent to HR for approval' : e ? 'Event updated' + (solo || d.status !== 'LIVE' ? '' : ' · invitees notified') : 'Event added' + (solo ? '' : ' · invites sent'));
    },
    onError: (x) => {
      setFe(fieldErrors(x));
      setErr(errorText(x));
    },
  });

  if (opts.isError) return <Modal title="New event" onClose={onClose} foot={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}><Alert>{errorText(opts.error)}</Alert></Modal>;
  const o = opts.data;
  const L = o?.layers.find((l) => l.key === f?.layer);
  const set = <K extends keyof EventBody>(k: K, v: EventBody[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const errs = check?.errors ?? [];
  const firstErr = errs.find((x) => x.field !== 'roomId');
  const roomErr = errs.find((x) => x.field === 'roomId');
  const errOf = (k: string) => (tried ? (fe[k] ?? errs.find((x) => x.field === k)?.message) : fe[k]);
  const needsAppr = L?.needsApproval && !(e && e.status === 'LIVE' && e.layer === f?.layer);
  const zones = o && !ZONES.some(([z]) => z === o.timeZone) ? [[o.timeZone, o.timeZone] as [string, string], ...ZONES] : ZONES;
  const submit = () => {
    setTried(true);
    if (!body || errs.length) return;
    setErr(null);
    setFe({});
    mut.mutate(body);
  };

  return (
    <Modal
      width={640}
      title={e ? 'Edit event' : 'New event'}
      sub={L ? (o?.layers.length ? (L.needsApproval ? `${L.name} · needs HR approval` : L.name) : '') : undefined}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!f || mut.isPending} onClick={submit}>
            {e ? 'Save changes' : needsAppr ? 'Send for approval' : 'Add event'}
          </button>
        </>
      }
    >
      {!f || !o ? (
        <BlockLoader label="Getting the form ready…" height={260} />
      ) : (
        <div className="cal-form">
          {tried && firstErr && <Alert>{firstErr.message}</Alert>}
          {err && !Object.keys(fe).length && <Alert>{err}</Alert>}
          <label className="lv-field">
            <span>Title</span>
            <input className="input sm" autoFocus value={f.title} aria-invalid={!!errOf('title')} placeholder="e.g. Team offsite" onChange={(x) => set('title', x.target.value)} />
          </label>
          <div className="lv-two-col">
            <label className="lv-field">
              <span>Calendar</span>
              <select
                className="input sm"
                value={f.layer}
                onChange={(x) => {
                  const k = x.target.value as LayerKey;
                  const nl = o.layers.find((l) => l.key === k);
                  setF({ ...f, layer: k, audience: nl?.audiences[0]?.value ?? 'ME', sensitive: k === 'HR' ? f.sensitive : false, private: k === 'MY' ? true : f.layer === 'MY' ? false : f.private });
                  setPeople([]);
                }}
              >
                {o.layers.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="lv-field">
              <span>Visible to</span>
              <select className="input sm" value={f.audience} aria-invalid={!!errOf('audience')} onChange={(x) => set('audience', x.target.value)}>
                {L?.audiences.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {f.audience === 'PEOPLE' && (
            <div className="cal-people">
              <PersonPicker value={null} invalid={!!errOf('people')} onChange={(p) => p && !people.some((x) => x.id === p.id) && setPeople([...people, { id: p.id, name: p.name }])} />
              <div>
                {people.length === 0 && <small>Add the people to invite. You’re included as the organiser.</small>}
                {people.map((p) => (
                  <span key={p.id} className="cal-tag">
                    {p.name}
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPeople(people.filter((x) => x.id !== p.id))}>
                      {Icon.close}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="lv-field">
            <span>Type</span>
            <div className="cal-types">
              {o.types.map((t) => (
                <button key={t.id} type="button" aria-pressed={f.typeId === t.id} style={f.typeId === t.id ? { background: t.bg, color: t.fg, borderColor: t.fg } : undefined} onClick={() => set('typeId', t.id)}>
                  <span className="dot" style={{ background: t.fg }} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="cal-when">
            <label className="lv-field">
              <span>Date</span>
              <input className="input sm" type="date" value={f.date} aria-invalid={!!errOf('date')} onChange={(x) => set('date', x.target.value)} />
            </label>
            {!f.allDay && (
              <>
                <label className="lv-field">
                  <span>Start</span>
                  <input className="input sm" type="time" value={f.start} onChange={(x) => set('start', x.target.value)} />
                </label>
                <label className="lv-field">
                  <span>End</span>
                  <input className="input sm" type="time" value={f.end} aria-invalid={!!errOf('end')} onChange={(x) => set('end', x.target.value)} />
                </label>
              </>
            )}
            <span className="cal-tg">
              <button type="button" className="switch" role="switch" aria-checked={f.allDay} onClick={() => setF({ ...f, allDay: !f.allDay, roomId: !f.allDay ? '' : f.roomId })} />
              All day
            </span>
          </div>
          {!f.allDay && (
            <label className="lv-field">
              <span>Time zone</span>
              <select className="input sm" value={f.timeZone || ''} onChange={(x) => set('timeZone', x.target.value)}>
                <option value="">My time zone · {zoneLabel(o.timeZone)}</option>
                {zones
                  .filter(([z]) => z !== o.timeZone)
                  .map(([z, l]) => (
                    <option key={z} value={z}>
                      {l}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="cal-when">
            <span className="lv-seg" role="group">
              {(
                [
                  ['NONE', 'Doesn’t repeat'],
                  ['WEEKLY', 'Weekly'],
                  ['MONTHLY', 'Monthly'],
                ] as ['NONE' | 'WEEKLY' | 'MONTHLY', string][]
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={f.repeat === k} onClick={() => set('repeat', k)}>
                  {l}
                </button>
              ))}
            </span>
            {f.repeat !== 'NONE' && (
              <label className="lv-field cal-until">
                <span>Until</span>
                <input className="input sm" type="date" value={f.until} aria-invalid={!!errOf('until')} onChange={(x) => set('until', x.target.value)} />
              </label>
            )}
          </div>
          <div className="lv-two-col">
            {!f.allDay && (
              <label className="lv-field">
                <span>Room</span>
                <select className="input sm" value={f.roomId} aria-invalid={!!roomErr} onChange={(x) => set('roomId', x.target.value)}>
                  <option value="">No room</option>
                  {o.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.capacity ? ` · ${r.capacity} seats` : ''}
                      {r.location ? ` · ${r.location}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="lv-field">
              <span>Location or link</span>
              <input className="input sm" value={f.where} placeholder="Address or meeting link" onChange={(x) => set('where', x.target.value)} />
            </label>
          </div>
          <div className="lv-two-col">
            <label className="lv-field">
              <span>Reminder</span>
              <select className="input sm" value={f.remind} onChange={(x) => set('remind', x.target.value as Remind)}>
                {REMIND.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="cal-flags">
              {f.layer !== 'MY' && (
                <span className="cal-tg">
                  <button type="button" className="switch" role="switch" aria-checked={f.private} onClick={() => set('private', !f.private)} />
                  Private · others see “Busy”
                </span>
              )}
              {f.layer === 'HR' && (
                <span className="cal-tg">
                  <button type="button" className="switch" role="switch" aria-checked={f.sensitive} onClick={() => set('sensitive', !f.sensitive)} />
                  Sensitive · HR and invitees only
                </span>
              )}
              {f.layer === 'MY' && <small className="cal-hint">Only you see events on My calendar.</small>}
            </div>
          </div>
          <label className="lv-field">
            <span>Notes</span>
            <textarea className="input sm" rows={2} value={f.notes} placeholder="Agenda, what to bring…" onChange={(x) => set('notes', x.target.value)} />
          </label>
          {roomErr && <div className="cal-errs">{roomErr.message}</div>}
          {(check?.warnings.length ?? 0) > 0 && (
            <div className="cal-warn">
              {check!.warnings.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
          )}
          {needsAppr && <span className="cal-hint">This calendar needs HR approval. Invitees see the event once it’s approved.</span>}
        </div>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------------------------------------------------- delete

export function DeleteConfirm({ ask, onClose, onDone }: { ask: { id: string; title: string; repeats: boolean }; onClose: () => void; onDone: () => void }) {
  const inval = useInvalidate();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    meta: { busy: 'Deleting the event…' },
    mutationFn: () => calApi.remove(ask.id),
    onSuccess: () => (inval(), onDone()),
    onError: (e) => setErr(errorText(e)),
  });
  return (
    <Modal
      width={420}
      title={`Delete “${ask.title}”?`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => m.mutate()}>
            Delete
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <p className="cal-p">{(ask.repeats ? 'This deletes every occurrence in the series. ' : '') + 'Invitees are notified. This can’t be undone.'}</p>
    </Modal>
  );
}

// -------------------------------------------------------------------------------------------------------------- my settings

export function SettingsDialog({ onClose, toast }: { onClose: () => void; toast: (t: string) => void }) {
  const q = useQuery({ queryKey: ['calendar', 'settings'], queryFn: calApi.settings });
  const inval = useInvalidate();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    meta: { busy: 'Saving your settings…' },
    mutationFn: (p: Parameters<typeof calApi.saveSettings>[0]) => calApi.saveSettings(p),
    onSuccess: () => (inval(), toast('Settings saved')),
    onError: (e) => setErr(errorText(e)),
  });
  const s = q.data;
  const zones = s && !ZONES.some(([z]) => z === s.timeZone) ? [[s.timeZone, s.timeZone] as [string, string], ...ZONES] : ZONES;
  return (
    <Modal
      width={440}
      title="My calendar settings"
      onClose={onClose}
      foot={
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Done
        </button>
      }
    >
      {!s ? (
        <BlockLoader label="Loading your settings…" height={160} />
      ) : (
        <div className="cal-form">
          {err && <Alert>{err}</Alert>}
          <div className="cal-setrow">
            <span>
              <b>Show my birthday</b>
              <small>Colleagues see the day, never the year</small>
            </span>
            <button type="button" className="switch" role="switch" aria-checked={!s.bdayOptOut} onClick={() => m.mutate({ bdayOptOut: !s.bdayOptOut })} />
          </div>
          <label className="lv-field">
            <span>Default reminder</span>
            <select className="input sm" value={s.remind} onChange={(e) => m.mutate({ remind: e.target.value as Remind })}>
              {REMIND.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <small>Used for new events you add</small>
          </label>
          <label className="lv-field">
            <span>Time zone</span>
            <select className="input sm" value={s.myTimeZone ?? ''} onChange={(e) => m.mutate({ timeZone: e.target.value || null })}>
              <option value="">Follow my office{!s.myTimeZone ? ` · ${zoneLabel(s.timeZone)}` : ''}</option>
              {zones.map(([z, l]) => (
                <option key={z} value={z}>
                  {l}
                </option>
              ))}
            </select>
            <small>Events from other time zones are converted.</small>
          </label>
        </div>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------------------------------------------------- sync

export function SyncDialog({ from, to, onClose, toast }: { from: string; to: string; onClose: () => void; toast: (t: string) => void }) {
  const q = useQuery({ queryKey: ['calendar', 'settings'], queryFn: calApi.settings });
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sub = useMutation({
    meta: { busy: 'Creating your private link…' },
    mutationFn: calApi.subscribe,
    onSuccess: (r) => {
      setLink(window.location.origin + '/api/v1' + r.path.replace(/^\/api\/v1/, ''));
      qc.invalidateQueries({ queryKey: ['calendar', 'settings'] });
    },
    onError: (e) => setErr(errorText(e)),
  });
  const unsub = useMutation({
    meta: { busy: 'Turning the link off…' },
    mutationFn: calApi.unsubscribe,
    onSuccess: () => {
      setLink(null);
      qc.invalidateQueries({ queryKey: ['calendar', 'settings'] });
      toast('Link turned off');
    },
    onError: (e) => setErr(errorText(e)),
  });
  const ics = useMutation({
    meta: { busy: 'Preparing the calendar file…' },
    mutationFn: () => calApi.exportIcs(from, to),
    onSuccess: (b) => (save(b, `ihrms-${from}.ics`), toast('Calendar file downloaded')),
    onError: (e) => setErr(errorText(e)),
  });
  const copy = () => link && navigator.clipboard?.writeText(link).then(() => toast('Link copied'));
  const s = q.data;
  return (
    <Modal
      width={520}
      title="Sync & subscribe"
      sub="Read-only: changes are made here in iHRMS"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => ics.mutate()}>
            {Icon.download} Download {fmtD(from)} – {fmtD(to)}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <div className="cal-form">
        <div className="cal-sync-head">
          <b>Your private subscription link</b>
          <small>Google Calendar, Outlook and Apple Calendar refresh it every few hours. It includes only the events you can see; private ones show as “Busy”. Anyone with the link can read it, so keep it to yourself.</small>
        </div>
        {link ? (
          <div className="cal-link">
            <code>{link}</code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
              {Icon.copy} Copy
            </button>
          </div>
        ) : s?.subscribed ? (
          <div className="cal-link off">
            <span>A link is on{s.subscribedAt ? ` since ${fmtD(s.subscribedAt.slice(0, 10))}` : ''}. For safety it’s shown only once — make a new one to copy it again.</span>
          </div>
        ) : (
          <div className="cal-link off">
            <span>No link yet.</span>
          </div>
        )}
        <div className="cal-sync-btns">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => sub.mutate()}>
            {s?.subscribed || link ? 'Make a new link' : 'Create link'}
          </button>
          {(s?.subscribed || link) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => unsub.mutate()}>
              Turn off
            </button>
          )}
        </div>
        <div className="cal-apps">
          <div>
            <span>
              <b>Google Calendar</b>
              <small>Other calendars → From URL, then paste the link</small>
            </span>
            <a className="btn btn-secondary btn-sm" href="https://calendar.google.com/calendar/r/settings/addbyurl" target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
          <div>
            <span>
              <b>Outlook</b>
              <small>Add calendar → Subscribe from web, then paste the link</small>
            </span>
            <a className="btn btn-secondary btn-sm" href="https://outlook.office.com/calendar/addcalendar" target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------------------------------------------------- rooms

export function RoomsDialog({ onClose, toast }: { onClose: () => void; toast: (t: string) => void }) {
  const q = useQuery({ queryKey: ['calendar', 'rooms', 'all'], queryFn: () => calApi.rooms(true) });
  const locs = useLocations();
  const inval = useInvalidate();
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; capacity: string; locationId: string } | null>(null);
  const m = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<unknown>; busy: string; done: string }) => v.run(),
    onSuccess: (_r, v) => (inval(), toast(v.done), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const upd = (r: Room, p: Partial<Room>, done: string) => m.mutate({ run: () => calApi.saveRoom(r.id, p), busy: 'Saving the room…', done });
  return (
    <Modal
      width={600}
      title="Meeting rooms"
      sub="Rooms people can book on calendar events"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!draft} onClick={() => setDraft({ name: '', capacity: '', locationId: '' })}>
            {Icon.plus} Add room
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      {!q.data ? (
        <BlockLoader label="Loading rooms…" height={160} />
      ) : (
        <div className="cal-rooms">
          <div className="cal-rhead">
            <span>Room</span>
            <span>Seats</span>
            <span>Office</span>
            <span>On</span>
            <span />
          </div>
          {q.data.length === 0 && !draft && <div className="cal-empty sm">No rooms yet</div>}
          {q.data.map((r) => (
            <div key={r.id} className={`cal-rrow${r.active ? '' : ' off'}`}>
              <input className="input sm" defaultValue={r.name} onBlur={(e) => e.target.value.trim() !== r.name && upd(r, { name: e.target.value }, 'Room renamed')} />
              <input className="input sm" inputMode="numeric" defaultValue={r.capacity || ''} onBlur={(e) => Number(e.target.value || 0) !== r.capacity && upd(r, { capacity: e.target.value as unknown as number }, 'Seats saved')} />
              <select className="input sm" value={r.locationId ?? ''} onChange={(e) => upd(r, { locationId: e.target.value || null }, 'Office saved')}>
                <option value="">Any office</option>
                {locs.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button type="button" className="switch" role="switch" aria-checked={r.active} title={r.active ? 'Bookable' : 'Switched off'} onClick={() => upd(r, { active: !r.active }, r.active ? `${r.name} switched off` : `${r.name} switched on`)} />
              <button type="button" className="dfx-icon-btn" title={r.used ? `Used by ${r.used} event${r.used === 1 ? '' : 's'}` : 'Remove'} aria-label={`Remove ${r.name}`} onClick={() => m.mutate({ run: () => calApi.removeRoom(r.id), busy: 'Removing the room…', done: `${r.name} removed` })}>
                {Icon.trash}
              </button>
            </div>
          ))}
          {draft && (
            <div className="cal-rrow">
              <input className="input sm" autoFocus placeholder="e.g. Huddle 2" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <input className="input sm" inputMode="numeric" placeholder="0" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} />
              <select className="input sm" value={draft.locationId} onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}>
                <option value="">Any office</option>
                {locs.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  m.mutate(
                    { run: () => calApi.addRoom({ name: draft.name, capacity: draft.capacity as unknown as number, locationId: draft.locationId || null }), busy: 'Adding the room…', done: `${draft.name.trim() || 'Room'} added` },
                    { onSuccess: () => setDraft(null) },
                  )
                }
              >
                Add
              </button>
              <button type="button" className="dfx-icon-btn" aria-label="Cancel" onClick={() => setDraft(null)}>
                {Icon.close}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
