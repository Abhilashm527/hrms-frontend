import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { errorText, fieldErrors } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { Drawer, FieldShell, PersonPicker } from '../onboarding/shared';
import type { Person } from '../onboarding/api';
import { settingsApi, type Location, type LocationMeta } from './api';
import { SettingsHead } from './SettingsLayout';
import { Toggle } from './cells';
import { BlockLoader } from '../components/Splash';

export function LocationsPage() {
  const q = useQuery({ queryKey: ['settings', 'locations'], queryFn: settingsApi.locations });
  const meta = useQuery({ queryKey: ['settings', 'locations', 'meta'], queryFn: settingsApi.locationMeta, staleTime: 30 * 60_000 });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Location | 'new' | null>(null);

  const list = (q.data ?? []).filter((l) => {
    const s = search.trim().toLowerCase();
    return !s || [l.name, l.code, l.address.city, l.address.state].some((x) => x?.toLowerCase().includes(s));
  });
  const active = q.data?.filter((l) => l.active) ?? [];
  const states = new Set(active.map((l) => l.address.state)).size;
  const people = active.reduce((n, l) => n + (l.stats?.headcount ?? 0), 0);

  return (
    <>
      <SettingsHead title="Locations" sub="Offices, geofences and attendance methods." />
      <PermissionsNotice errors={[q.error, meta.error]} />
      <div className="toolbar">
        <label className="search-in">
          {Icon.search}
          <input placeholder="search name, code, city or state…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {q.data && (
          <span className="field-hint">
            {active.length} active · {states} state{states === 1 ? '' : 's'} · {people} employees
          </span>
        )}
        <span className="grow" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')} disabled={!meta.data}>
          + Add location
        </button>
      </div>
      {q.isLoading && <BlockLoader page label="Loading locations…" />}
      {q.data?.length === 0 && <div className="card card-empty">No locations yet. Add your head office to start.</div>}
      <div className="loc-grid">
        {list.map((l) => (
          <LocationCard key={l.id} l={l} meta={meta.data} onOpen={() => setEditing(l)} />
        ))}
      </div>
      {editing && meta.data && <LocationDrawer loc={editing === 'new' ? null : editing} meta={meta.data} onClose={() => setEditing(null)} />}
    </>
  );
}

function LocationCard({ l, meta, onOpen }: { l: Location; meta?: LocationMeta; onOpen: () => void }) {
  const t = meta?.types.find((x) => x.value === l.type);
  const util = l.stats?.utilisation;
  return (
    <button type="button" className="card loc-card" onClick={onOpen} style={{ opacity: l.active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span className="kpi-ic" style={{ width: 36, height: 36, background: 'var(--brand-tint)', color: 'var(--brand)' }}>
          {Icon.pin}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 15, color: 'var(--fg-1)' }}>{l.name}</b>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>
            {l.code} · {l.address.city}, {l.address.state}
          </span>
        </span>
        <span className="pill no-dot" style={{ background: t?.bg, color: t?.fg }}>
          {l.typeLabel}
        </span>
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--fg-2)', textAlign: 'left' }}>
        {l.address.line}
        {l.address.postalCode ? ` ${l.address.postalCode}` : ''}
      </span>
      <div className="loc-stats">
        <span>
          <small>Headcount</small>
          <b>{l.stats?.headcount ?? '—'}</b>
        </span>
        <span>
          <small>Seats</small>
          <b>{l.seatCapacity ?? '—'}</b>
        </span>
        <span>
          <small>Hours</small>
          <b>
            {l.schedule.start}–{l.schedule.end}
          </b>
        </span>
      </div>
      {util != null && (
        <>
          <div className="progress">
            <i style={{ width: `${Math.min(100, Math.round(util * 100))}%` }} />
          </div>
          <span className="field-hint" style={{ textAlign: 'left' }}>
            {Math.round(util * 100)}% of seats in use · {l.stats?.free ?? 0} free
          </span>
        </>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="pill no-dot pill-muted">{l.schedule.weekLabel}</span>
        {l.statutory.ptLabel && <span className="pill no-dot pill-muted">{l.statutory.ptLabel}</span>}
        {l.holidayCalendar && <span className="pill no-dot pill-muted">{l.holidayCalendar.name}</span>}
        <span className="grow" style={{ flex: 1 }} />
        <span className={`pill ${l.active ? 'pill-ok' : 'pill-muted'}`}>{l.active ? 'Active' : 'Inactive'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--fg-2)' }}>
        <span>{l.head?.name ?? 'No location head'}</span>
        <span>{l.attendance.methods.map((m) => meta?.methods.find((x) => x.value === m)?.label ?? m).join(' · ')}</span>
      </div>
    </button>
  );
}

type Form = {
  name: string;
  code: string;
  type: string;
  headEmployeeId: string;
  headName: string;
  active: boolean;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timezone: string;
  phone: string;
  email: string;
  weekPattern: string;
  startTime: string;
  endTime: string;
  graceMinutes: string;
  holidayCalendarId: string;
  attendanceMethods: string[];
  wfhAllowed: boolean;
  geoRadiusM: string;
  latitude: string;
  longitude: string;
  seatCapacity: string;
  assetStore: boolean;
  lwfApplicable: boolean;
  esiNotified: boolean;
  shopsEstabRegNo: string;
  gstin: string;
};

const fromLocation = (l: Location | null, meta: LocationMeta): Form => ({
  name: l?.name ?? '',
  code: l?.code ?? '',
  type: l?.type ?? meta.types.find((t) => t.value === 'BRANCH_OFFICE')?.value ?? meta.types[0]?.value ?? '',
  headEmployeeId: l?.head?.employeeId ?? '',
  headName: l?.head?.name ?? '',
  active: l?.active ?? true,
  addressLine: l?.address.line ?? '',
  city: l?.address.city ?? '',
  state: l?.address.state ?? '',
  postalCode: l?.address.postalCode ?? '',
  country: l?.address.country ?? 'India',
  timezone: l?.timezone ?? meta.timezones.find((z) => z.id === 'Asia/Kolkata')?.id ?? meta.timezones[0]?.id ?? '',
  phone: l?.phone ?? '',
  email: l?.email ?? '',
  weekPattern: l?.schedule.weekPattern ?? meta.weekPatterns[0]?.value ?? 'MON_FRI',
  startTime: l?.schedule.start ?? '09:30',
  endTime: l?.schedule.end ?? '18:30',
  graceMinutes: String(l?.schedule.graceMinutes ?? 15),
  holidayCalendarId: l?.holidayCalendar?.id ?? '',
  attendanceMethods: l?.attendance.methods ?? ['WEB'],
  wfhAllowed: l?.attendance.wfhAllowed ?? true,
  geoRadiusM: l?.attendance.geoRadiusM != null ? String(l.attendance.geoRadiusM) : '',
  latitude: l?.attendance.latitude != null ? String(l.attendance.latitude) : '',
  longitude: l?.attendance.longitude != null ? String(l.attendance.longitude) : '',
  seatCapacity: l?.seatCapacity != null ? String(l.seatCapacity) : '',
  assetStore: l?.assetStore ?? false,
  lwfApplicable: l?.statutory.lwf ?? false,
  esiNotified: l?.statutory.esiNotified ?? true,
  shopsEstabRegNo: l?.statutory.shopsEstabRegNo ?? '',
  gstin: l?.statutory.gstin ?? '',
});

const NUM = new Set(['graceMinutes', 'geoRadiusM', 'latitude', 'longitude', 'seatCapacity']);

/** The API body: numbers as numbers, blanks as null, and only what changed when editing. */
function toBody(f: Form, orig: Form | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  (Object.keys(f) as (keyof Form)[]).forEach((k) => {
    if (k === 'headName') return;
    if (orig && JSON.stringify(f[k]) === JSON.stringify(orig[k])) return;
    const v = f[k];
    out[k] = typeof v === 'string' ? (v.trim() === '' ? null : NUM.has(k) ? Number(v) : v.trim()) : v;
  });
  return out;
}

function LocationDrawer({ loc, meta, onClose }: { loc: Location | null; meta: LocationMeta; onClose: () => void }) {
  const qc = useQueryClient();
  const orig = useMemo(() => fromLocation(loc, meta), [loc, meta]);
  const [f, setF] = useState<Form>(orig);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((o) => ({ ...o, [k]: v }));
    setErrs((e) => ({ ...e, [k]: '' }));
    setErr(null);
  };
  const state = meta.states.find((s) => s.name === f.state);
  const calendars = meta.holidayCalendars.filter((c) => !c.state || !f.state || c.state === f.state || c.state === state?.code);
  const gps = f.attendanceMethods.includes('MOBILE_GPS');
  const [lwfTouched, setLwfTouched] = useState(!!loc);
  const pt = useQuery({
    queryKey: ['settings', 'locations', 'statutory', f.state, loc?.id ?? ''],
    queryFn: () => settingsApi.statutoryPreview(f.state, loc?.id),
    enabled: !!f.state,
    staleTime: 10 * 60_000,
  });
  // A new location takes the state's labour-welfare default until someone sets it by hand.
  useEffect(() => {
    if (pt.data && !lwfTouched) setF((o) => ({ ...o, lwfApplicable: pt.data.lwfDefault }));
  }, [pt.data, lwfTouched]);
  const stateChanged = !!loc && f.state !== orig.state;

  const done = () => {
    qc.invalidateQueries({ queryKey: ['settings', 'locations'] });
    qc.invalidateQueries({ queryKey: ['lookup', 'locations'] });
    onClose();
  };
  const save = useMutation({
    meta: { busy: loc ? 'Saving location…' : 'Adding location…' },
    mutationFn: () => (loc ? settingsApi.updateLocation(loc.id, toBody(f, orig), loc.version) : settingsApi.createLocation(toBody(f, null))),
    onSuccess: done,
    onError: (e) => {
      const fe = fieldErrors(e);
      setErrs(fe);
      setErr(Object.keys(fe).length ? 'Fix the highlighted fields.' : errorText(e));
    },
  });
  const remove = useMutation({ meta: { busy: 'Deleting location…' }, mutationFn: () => settingsApi.deleteLocation(loc!.id), onSuccess: done, onError: (e) => setErr(`${errorText(e)} You can switch it to inactive instead.`) });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Name is required';
    if (!/^[A-Za-z0-9-]{2,12}$/.test(f.code.trim())) e.code = 'Code must be 2–12 letters, digits or dashes';
    if (!f.addressLine.trim()) e.addressLine = 'Address is required';
    if (!f.city.trim()) e.city = 'City is required';
    if (!f.state) e.state = 'State is required';
    if (f.country === 'India' && !/^\d{6}$/.test(f.postalCode.trim())) e.postalCode = 'PIN code must be 6 digits';
    if (!f.holidayCalendarId) e.holidayCalendarId = 'Choose a holiday calendar';
    if (gps && !(Number(f.geoRadiusM) >= 25 && Number(f.geoRadiusM) <= 5000)) e.geoRadiusM = 'Mobile GPS needs a radius of 25–5000 metres';
    if (f.startTime === f.endTime) e.endTime = 'End time must differ from start time';
    setErrs(e);
    if (Object.keys(e).length) return setErr('Fix the highlighted fields.');
    save.mutate();
  };

  const text = (k: keyof Form, label: string, opts: { required?: boolean; placeholder?: string; type?: string; mono?: boolean; wide?: boolean } = {}) => (
    <FieldShell label={label} required={opts.required} error={errs[k]} wide={opts.wide}>
      <input className={`input sm${opts.mono ? ' mono' : ''}`} type={opts.type ?? 'text'} value={f[k] as string} placeholder={opts.placeholder} aria-invalid={!!errs[k]} onChange={(e) => set(k, e.target.value as never)} />
    </FieldShell>
  );

  return (
    <Drawer
      title={loc ? loc.name : 'New location'}
      sub="Offices drive PT, holidays, attendance and work schedules for employees based there"
      onClose={onClose}
      busy={save.isPending}
      foot={
        <>
          {loc && (
            <button type="button" className="btn btn-danger btn-sm" disabled={remove.isPending} onClick={() => confirm(`Delete ${loc.name}? Only possible when no one is based there.`) && remove.mutate()}>
              Delete
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : loc ? 'Save changes' : 'Add location'}
          </button>
        </>
      }
    >
      <div className="drawer-body">
        {err && <Alert>{err}</Alert>}
        {loc?.warnings?.map((w) => (
          <Alert key={w} kind="info">
            {w}
          </Alert>
        ))}

        <span className="form-sec-title">Basics</span>
        <div className="form-grid">
          {text('name', 'Location name', { required: true, placeholder: 'e.g. Chennai office' })}
          {text('code', 'Location code', { required: true, placeholder: 'e.g. MAA-01', mono: true })}
          <FieldShell label="Type" required error={errs.type}>
            <select className="input sm" value={f.type} onChange={(e) => set('type', e.target.value)}>
              {meta.types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FieldShell>
          <FieldShell label="Location head" error={errs.headEmployeeId}>
            <PersonPicker value={f.headEmployeeId ? ({ id: f.headEmployeeId, name: f.headName } as Person) : null} onChange={(p) => (set('headEmployeeId', p?.id ?? ''), set('headName', p?.name ?? ''))} />
          </FieldShell>
          <FieldShell label="Status">
            <SwitchInline on={f.active} onChange={(v) => set('active', v)} yes="Active" no="Inactive" />
          </FieldShell>
        </div>

        <span className="form-sec-title">Address</span>
        <div className="form-grid">
          {text('addressLine', 'Address line', { required: true, placeholder: 'Building, street, area', wide: true })}
          {text('city', 'City', { required: true })}
          <FieldShell label="State" required error={errs.state}>
            <select className="input sm" value={f.state} aria-invalid={!!errs.state} onChange={(e) => (set('state', e.target.value), set('holidayCalendarId', ''))}>
              <option value="">Select state</option>
              {meta.states.map((s) => (
                <option key={s.code} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            {state && (
              <span className="field-hint">
                GST code {state.gst} · {state.pt ? 'Professional tax applies' : 'No professional tax'}
                {state.lwf ? ' · LWF applies' : ''}
              </span>
            )}
          </FieldShell>
          {text('postalCode', 'PIN code', { required: true, mono: true })}
          <FieldShell label="Time zone" error={errs.timezone}>
            <select className="input sm" value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {meta.timezones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </FieldShell>
          {text('phone', 'Reception phone', { type: 'tel', placeholder: '+91 80 4000 0000' })}
          {text('email', 'Location email', { type: 'email', placeholder: 'blr.office@ivoyant.com' })}
        </div>

        <span className="form-sec-title">Work schedule</span>
        <span className="field-hint" style={{ marginTop: -10 }}>
          Applied to attendance, leave day counts and payroll working days for employees at this location.
        </span>
        <div className="form-grid">
          <FieldShell label="Work week">
            <select className="input sm" value={f.weekPattern} onChange={(e) => set('weekPattern', e.target.value)}>
              {meta.weekPatterns.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </FieldShell>
          {text('startTime', 'Shift starts', { type: 'time' })}
          {text('endTime', 'Shift ends', { type: 'time' })}
          {text('graceMinutes', 'Grace period (minutes)', { type: 'number' })}
          <FieldShell label="Holiday calendar" required error={errs.holidayCalendarId}>
            <select className="input sm" value={f.holidayCalendarId} aria-invalid={!!errs.holidayCalendarId} onChange={(e) => set('holidayCalendarId', e.target.value)}>
              <option value="">Select</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.name}
                </option>
              ))}
            </select>
            {meta.holidayCalendars.length === 0 && <span className="field-hint">No holiday calendars exist yet.</span>}
          </FieldShell>
        </div>

        <span className="form-sec-title">Attendance</span>
        <span className="field-hint" style={{ marginTop: -10 }}>
          How employees at this location can mark attendance.
        </span>
        <div className="chips">
          {meta.methods.map((m) => {
            const on = f.attendanceMethods.includes(m.value);
            return (
              <button key={m.value} type="button" className="chip" aria-pressed={on} onClick={() => set('attendanceMethods', on ? f.attendanceMethods.filter((x) => x !== m.value) : [...f.attendanceMethods, m.value])}>
                {on && '✓ '}
                {m.label}
              </button>
            );
          })}
        </div>
        <SwitchRow label="Work from home" on={f.wfhAllowed} onChange={(v) => set('wfhAllowed', v)} yes="Allowed" no="Not allowed" />
        {gps && (
          <div className="form-grid">
            {text('geoRadiusM', 'Geofence radius (metres)', { type: 'number', required: true })}
            {text('latitude', 'Latitude', { type: 'number' })}
            {text('longitude', 'Longitude', { type: 'number' })}
          </div>
        )}

        <span className="form-sec-title">Statutory & compliance</span>
        <span className="field-hint" style={{ marginTop: -10 }}>
          Professional tax and labour welfare follow the state. Used by payroll.
        </span>
        <div className="form-grid">
          <FieldShell label="Professional tax" wide>
            <span className="pt-box">
              {!f.state ? 'Pick a state to see the applicable slab' : pt.isLoading ? 'Loading…' : pt.data?.ptRule ? (
                <>
                  <b>{pt.data.ptTitle ?? f.state}</b>
                  <span>{pt.data.ptRule}</span>
                </>
              ) : (
                `No professional tax in ${f.state}`
              )}
            </span>
            {stateChanged && (pt.data?.affectedEmployees ?? 0) > 0 && (
              <span className="field-hint" style={{ color: 'var(--warning-fg)' }}>
                Changing the state moves {pt.data!.affectedEmployees} employee{pt.data!.affectedEmployees === 1 ? '' : 's'} to {f.state}'s professional tax and holidays.
              </span>
            )}
          </FieldShell>
        </div>
        <SwitchRow
          label="Labour welfare fund"
          on={f.lwfApplicable}
          onChange={(v) => {
            setLwfTouched(true);
            set('lwfApplicable', v);
          }}
          yes="Deduct LWF"
          no="Not applicable"
        />
        <SwitchRow label="ESI covered area" on={f.esiNotified} onChange={(v) => set('esiNotified', v)} yes="Notified area" no="Not notified" />
        <div className="form-grid">
          {text('shopsEstabRegNo', 'Shops & Establishment reg. no.', { mono: true })}
          {text('gstin', 'GSTIN', { mono: true })}
        </div>

        <span className="form-sec-title">Facilities</span>
        <div className="form-grid">
          {text('seatCapacity', 'Seating capacity', { type: 'number' })}
          <FieldShell label="IT asset store">
            <SwitchInline on={f.assetStore} onChange={(v) => set('assetStore', v)} yes="Keeps an asset store" no="No store" />
          </FieldShell>
        </div>
      </div>
    </Drawer>
  );
}

/** A switch with the label of its current state beside it, as in the UX ("Allowed" / "Not applicable"). */
function SwitchInline({ on, onChange, yes, no }: { on: boolean; onChange: (v: boolean) => void; yes: string; no: string }) {
  return (
    <span className="check" style={{ gap: 10, height: 34 }}>
      <Toggle on={on} onChange={onChange} label={on ? yes : no} />
      {on ? yes : no}
    </span>
  );
}

function SwitchRow({ label, ...rest }: { label: ReactNode; on: boolean; onChange: (v: boolean) => void; yes: string; no: string }) {
  return (
    <div className="switch-row">
      <span>{label}</span>
      <SwitchInline {...rest} />
    </div>
  );
}
