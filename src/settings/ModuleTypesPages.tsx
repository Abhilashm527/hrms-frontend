import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { api, del, errorText, get, post } from '../lib/http';
import { Seg, fmtDate, fmtTime } from '../leave/ui';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { useRoles } from '../access/api';
import { HOL_PAL } from './leave/api';
import { SettingsHead } from './SettingsLayout';

const ifMatch = (v: number) => ({ 'If-Match': `"${v}"` });

// ------------------------------------------------------------------ calendar event types

type EventType = { id: string; key: string; name: string; fg: string; bg: string; who: 'ALL' | 'ADMINS'; whoLabel: string; system: boolean; active: boolean; sort: number; usage: number; version: number };
const SOURCE: Record<string, string> = { HOLIDAY: 'From holiday calendars', BIRTHDAY: 'From date of birth', ANNIVERSARY: 'From joining date' };
const ET_COLS = '120px minmax(140px,1fr) 230px minmax(150px,1fr) 110px 70px 32px';

/** Configuration → Calendar event types: what people can add to the calendar, its colour and who may use it. */
export function CalendarTypesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings', 'event-types'], queryFn: () => get<EventType[]>('/calendar/event-types?includeSystem=true') });
  const audit = useQuery({ queryKey: ['settings', 'event-types', 'audit'], queryFn: () => get<{ at: string; action: string; text: string; who: string }[]>('/calendar/event-types/audit?limit=25'), retry: false });
  const [adding, setAdding] = useState(false);
  const [nw, setNw] = useState({ name: '', fg: HOL_PAL[0][0], who: 'ALL' as 'ALL' | 'ADMINS' });
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => (qc.invalidateQueries({ queryKey: ['settings', 'event-types'] }), qc.invalidateQueries({ queryKey: ['calendar'] }));
  const upd = useMutation({
    meta: { busy: 'Saving event type…' },
    mutationFn: (v: { t: EventType; b: Partial<EventType> }) => api<EventType>(`/calendar/event-types/${v.t.id}`, { method: 'PATCH', body: v.b, headers: ifMatch(v.t.version) }),
    onSuccess: () => (refresh(), setErr(null)),
    onError: (e) => (setErr(errorText(e)), refresh()),
  });
  const add = useMutation({
    meta: { busy: 'Adding event type…' },
    mutationFn: () => post<EventType>('/calendar/event-types', { name: nw.name.trim(), fg: nw.fg, who: nw.who }),
    onSuccess: () => (refresh(), setAdding(false), setNw({ name: '', fg: HOL_PAL[0][0], who: 'ALL' }), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const remove = useMutation({ meta: { busy: 'Deleting event type…' }, mutationFn: (t: EventType) => del<void>(`/calendar/event-types/${t.id}`), onSuccess: refresh, onError: (e) => setErr(errorText(e)) });
  const sys = (q.data ?? []).filter((t) => t.system);
  const custom = (q.data ?? []).filter((t) => !t.system);

  const row = (t: EventType) => (
    <div key={`${t.id}|${t.version}`} className="lv-row" style={{ gridTemplateColumns: ET_COLS, opacity: t.active ? 1 : 0.55 }}>
      <span className="ht-chip" style={{ color: t.fg, background: t.bg }}>
        <i style={{ background: t.fg }} />
        {t.name}
      </span>
      <input className="input sm" defaultValue={t.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && upd.mutate({ t, b: { name: e.target.value.trim() } })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <ColorPick fg={t.fg} onPick={(fg) => upd.mutate({ t, b: { fg } })} />
      {t.system ? (
        <span className="field-hint">{SOURCE[t.key] ?? 'Automatic'}</span>
      ) : (
        <Seg size="sm" value={t.who} onChange={(who) => upd.mutate({ t, b: { who } })} options={[['ALL', 'Everyone'], ['ADMINS', 'Admins only']]} />
      )}
      <label className="lv-inline">
        <button type="button" className="switch" role="switch" aria-checked={t.active} onClick={() => upd.mutate({ t, b: { active: !t.active } })} />
        {t.active ? 'On' : 'Off'}
      </label>
      <span className="muted" style={{ fontSize: 12 }}>
        {t.system ? 'Automatic' : `${t.usage} used`}
      </span>
      {t.system ? (
        <span title="Default type · can't be deleted" style={{ color: 'var(--fg-3)' }}>
          🔒
        </span>
      ) : t.usage === 0 ? (
        <button type="button" className="dfx-icon-btn" title="Delete type" onClick={() => confirm(`Delete ${t.name}?`) && remove.mutate(t)}>
          {Icon.trash}
        </button>
      ) : (
        <span />
      )}
    </div>
  );

  return (
    <>
      <SettingsHead title="Calendar event types" sub="Types people can pick when adding an event to the calendar. Holidays, birthdays and work anniversaries fill in automatically and can't be deleted. Leave is added from leave requests." />
      <PermissionsNotice errors={[q.error]} />
      {err && <Alert>{err}</Alert>}
      {q.isLoading && <BlockLoader page label="Loading event types…" />}
      {q.data && (
        <div className="lv-stack" style={{ maxWidth: 1000 }}>
          <span className="lv-cap">Default types</span>
          <div className="lv-tbl">
            <div style={{ minWidth: 820 }}>{sys.map(row)}</div>
          </div>
          <div className="lv-bar">
            <span className="lv-cap" style={{ flex: 1 }}>
              Custom types
            </span>
            {!adding && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                {Icon.plus} Add type
              </button>
            )}
          </div>
          <div className="lv-tbl">
            <div style={{ minWidth: 820 }}>
              <div className="lv-head" style={{ gridTemplateColumns: ET_COLS }}>
                {['Preview', 'Name', 'Colour', 'Who can add', 'Active', 'Used', ''].map((h, i) => (
                  <span key={i}>{h}</span>
                ))}
              </div>
              {custom.map(row)}
              {adding && (
                <>
                  <div className="lv-row add" style={{ gridTemplateColumns: ET_COLS }}>
                    <span className="ht-chip" style={{ color: nw.fg, background: `color-mix(in srgb, ${nw.fg} 14%, white)` }}>
                      <i style={{ background: nw.fg }} />
                      {nw.name || 'New type'}
                    </span>
                    <input className="input sm" autoFocus placeholder="e.g. Town hall" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && nw.name.trim() && add.mutate()} />
                    <ColorPick fg={nw.fg} onPick={(fg) => setNw({ ...nw, fg })} />
                    <Seg size="sm" value={nw.who} onChange={(who) => setNw({ ...nw, who })} options={[['ALL', 'Everyone'], ['ADMINS', 'Admins only']]} />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="lv-add-foot">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!nw.name.trim()} onClick={() => add.mutate()}>
                      Add
                    </button>
                  </div>
                </>
              )}
              {custom.length === 0 && !adding && <div className="lv-empty">No custom types yet</div>}
            </div>
          </div>
          <span className="field-hint">Types with events on the calendar can be turned off but not deleted. Admins-only types are hidden from employees.</span>
          <span className="field-hint">
            Who can see and add to each calendar is set per role in <Link to="/settings/roles">Roles &amp; permissions → Calendar</Link>.
          </span>
          <span className="lv-cap">Activity log</span>
          <div className="lv-card">
            {(audit.data ?? []).map((a, i) => (
              <div key={i} className="lv-row" style={{ gridTemplateColumns: '150px 100px minmax(0,1fr)' }}>
                <span className="muted">
                  {fmtDate(a.at)} {fmtTime(a.at)}
                </span>
                <span className="pill no-dot pill-muted">{a.action}</span>
                <span className="ell">
                  {a.text} · {a.who}
                </span>
              </div>
            ))}
            {audit.data?.length === 0 && <div className="lv-empty">No calendar changes yet</div>}
          </div>
        </div>
      )}
    </>
  );
}

function ColorPick({ fg, onPick }: { fg: string; onPick: (fg: string) => void }) {
  return (
    <span className="ht-pal" style={{ alignItems: 'center' }}>
      {HOL_PAL.map(([c]) => (
        <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={c.toLowerCase() === fg.toLowerCase()} style={{ background: c }} onClick={() => onPick(c)} />
      ))}
      <label className="ct-any" title="Pick any colour" style={{ boxShadow: HOL_PAL.some(([c]) => c.toLowerCase() === fg.toLowerCase()) ? undefined : '0 0 0 2px var(--bg), 0 0 0 3.5px var(--fg-1)' }}>
        <input type="color" value={fg} data-native onChange={(e) => onPick(e.target.value.toUpperCase())} />
      </label>
    </span>
  );
}

// ------------------------------------------------------------------ request types

type ReqType = { id: string; category: 'LETTER' | 'REIMBURSEMENT' | 'HELPDESK'; name: string; active: boolean; sort: number; usage: number; helpdeskTeamRoleId: string | null; helpdeskTeam: string | null; version: number };
const CATS: [ReqType['category'], string, string][] = [
  ['LETTER', 'Letters', "Hidden types stay on past requests but can't be picked for new ones."],
  ['REIMBURSEMENT', 'Reimbursements', 'Claims go to the manager, then finance.'],
  ['HELPDESK', 'Helpdesk', 'Each new ticket is shown as "With [category] team".'],
];

/** Configuration → Request types: letters, reimbursements and helpdesk categories employees can raise. */
export function RequestTypesPage() {
  const qc = useQueryClient();
  const [cat, setCat] = useState<ReqType['category']>('LETTER');
  const q = useQuery({ queryKey: ['settings', 'request-types'], queryFn: () => get<{ counts: Record<string, number>; items: ReqType[] }>('/request-types') });
  const roles = useRoles();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['settings', 'request-types'] });
  const upd = useMutation({
    meta: { busy: 'Saving request type…' },
    mutationFn: (v: { t: ReqType; b: Partial<ReqType> }) => api<ReqType>(`/request-types/${v.t.id}`, { method: 'PATCH', body: v.b, headers: ifMatch(v.t.version) }),
    onSuccess: () => (refresh(), setErr(null)),
    onError: (e) => (setErr(errorText(e)), refresh()),
  });
  const add = useMutation({ meta: { busy: 'Adding request type…' }, mutationFn: () => post('/request-types', { category: cat, name: name.trim() }), onSuccess: () => (refresh(), setAdding(false), setName(''), setErr(null)), onError: (e) => setErr(errorText(e)) });
  const remove = useMutation({ meta: { busy: 'Deleting request type…' }, mutationFn: (t: ReqType) => del<void>(`/request-types/${t.id}`), onSuccess: refresh, onError: (e) => setErr(errorText(e)) });
  const order = useMutation({ meta: { busy: 'Saving order…' }, mutationFn: (ids: string[]) => api(`/request-types/order?category=${cat}`, { method: 'PUT', body: ids }), onSuccess: refresh, onError: (e) => setErr(errorText(e)) });
  const items = (q.data?.items ?? []).filter((t) => t.category === cat).sort((a, b) => a.sort - b.sort);
  const helpdesk = cat === 'HELPDESK';
  const cols = helpdesk ? '56px minmax(160px,1fr) 190px 130px 80px 32px' : '56px minmax(200px,1fr) 130px 80px 32px';
  const move = (i: number, d: number) => {
    const ids = items.map((t) => t.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    order.mutate(ids);
  };

  return (
    <>
      <SettingsHead title="Request types" sub="What employees can ask for: letters, reimbursement claims and helpdesk tickets." />
      <PermissionsNotice errors={[q.error]} />
      {err && <Alert>{err}</Alert>}
      {q.isLoading && <BlockLoader page label="Loading request types…" />}
      {q.data && (
        <div className="lv-stack" style={{ maxWidth: 860 }}>
          <div className="lv-bar">
            <Seg value={cat} onChange={(c) => (setCat(c), setAdding(false))} options={CATS.map(([k, l]) => [k, `${l} · ${q.data.counts[k] ?? 0}`] as [ReqType['category'], string])} />
            <span className="grow" />
            {!adding && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                {Icon.plus} Add type
              </button>
            )}
          </div>
          <span className="field-hint">{CATS.find((c) => c[0] === cat)![2]}</span>
          <div className="lv-tbl">
            <div style={{ minWidth: 560 }}>
              <div className="lv-head" style={{ gridTemplateColumns: cols }}>
                {['Order', 'Name', ...(helpdesk ? ['Handled by'] : []), 'Employees see', 'Used', ''].map((h, i) => (
                  <span key={i}>{h}</span>
                ))}
              </div>
              {items.map((t, i) => (
                <div key={`${t.id}|${t.version}`} className="lv-row" style={{ gridTemplateColumns: cols, opacity: t.active ? 1 : 0.55 }}>
                  <span className="ef-order">
                    <button type="button" className="dfx-icon-btn" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button type="button" className="dfx-icon-btn" title="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </button>
                  </span>
                  <input className="input sm" defaultValue={t.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && upd.mutate({ t, b: { name: e.target.value.trim() } })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                  {helpdesk && (
                    <select className="input sm" value={t.helpdeskTeamRoleId ?? ''} onChange={(e) => upd.mutate({ t, b: { helpdeskTeamRoleId: e.target.value || null } })} aria-label="Handled by">
                      <option value="">HR (default)</option>
                      {(roles.data ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="lv-inline">
                    <button type="button" className="switch" role="switch" aria-checked={t.active} onClick={() => upd.mutate({ t, b: { active: !t.active } })} />
                    {t.active ? 'Shown' : 'Hidden'}
                  </label>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {t.usage}
                  </span>
                  {t.usage === 0 ? (
                    <button type="button" className="dfx-icon-btn" title="Delete type" onClick={() => confirm(`Delete ${t.name}?`) && remove.mutate(t)}>
                      {Icon.trash}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
              {adding && (
                <>
                  <div className="lv-row add" style={{ gridTemplateColumns: cols }}>
                    <span />
                    <input className="input sm" autoFocus placeholder="New type name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && add.mutate()} />
                    {helpdesk && <span className="field-hint">HR until changed</span>}
                    <span className="field-hint">Shown</span>
                    <span />
                    <span />
                  </div>
                  <div className="lv-add-foot">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={() => add.mutate()}>
                      Add
                    </button>
                  </div>
                </>
              )}
              {items.length === 0 && !adding && <div className="lv-empty">No types yet</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
