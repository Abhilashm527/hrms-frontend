import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { useDepartments, useLocations } from '../onboarding/shared';
import { leaveApi, type Notice } from './api';
import { Field, Modal, Seg, fmtDate, fmtShort, fmtTime } from './ui';

const Y = new Date().getFullYear();
/** Templates from the design; dates are this year's. */
const PRESETS: { k: string; l: string; title: string; body: string; from: string; to: string; who: 'ALL' | 'LAPSE' }[] = [
  { k: 'yearend', l: 'Year-end · use it or lose it', title: 'Plan your leave before 31 Dec', body: 'Hi {first}, you have {EL} days of earned leave. {lapse} days will lapse if not used by {to}. Please plan and apply before {deadline} so your manager can arrange cover.', from: `${Y}-11-15`, to: `${Y}-12-31`, who: 'LAPSE' },
  { k: 'festive', l: 'Festive season plan', title: 'Plan your festive & year-end leave', body: 'Hi {first}, the festive season falls in {period}. To keep teams covered, please apply for any leave in this period before {deadline}. Balance: CL {CL} · EL {EL}.', from: `${Y}-10-19`, to: `${Y}-10-23`, who: 'ALL' },
  { k: 'quarter', l: 'Quarterly leave planning', title: 'Quarterly leave planning is open', body: 'Hi {first}, please add your planned leave for {period} by {deadline}. You have CL {CL}, SL {SL} and EL {EL} days available.', from: `${Y}-10-01`, to: `${Y}-12-31`, who: 'ALL' },
  { k: 'blackout', l: 'Blackout period', title: 'Leave freeze: {period}', body: 'Hi {first}, due to the quarter-end release, leave is not approved during {period} except emergencies. Please plan around these dates.', from: `${Y}-12-14`, to: `${Y}-12-18`, who: 'ALL' },
];
const TAGS = ['first', 'period', 'deadline', 'CL', 'SL', 'EL', 'lapse', 'manager'];
const minus = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() - n);
  return x.toISOString().slice(0, 10);
};

export function NoticesTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['leave', 'notices'], queryFn: leaveApi.notices });
  const [edit, setEdit] = useState<Notice | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = useMutation({
    meta: { busy: (v: unknown) => ((v as { a: string }).a === 'cancel' ? 'Cancelling notification…' : 'Sending notification…') },
    mutationFn: (v: { id: string; a: 'cancel' | 'send' }) => (v.a === 'cancel' ? leaveApi.cancelNotice(v.id) : leaveApi.sendNotice(v.id)),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['leave', 'notices'] }), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const d = q.data;
  return (
    <div className="lv-stack">
      <PermissionsNotice errors={[q.error]} />
      <div className="lv-bar">
        <span className="field-hint" style={{ flex: 1 }}>
          Remind employees to plan leave for a period · personalised with each person's balance · sent to the bell and by email
        </span>
        {d?.canManage && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit('new')}>
            {Icon.plus} Notify employees
          </button>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      {q.isLoading && <BlockLoader height={240} label="Loading notifications…" />}
      {d && (
        <div className="lv-card">
          {d.items.map((c) => {
            const st = c.status === 'SCHEDULED' ? ['pill-info', c.repeat === 'WEEKLY' && c.sentCount ? 'Repeating' : 'Scheduled'] : c.status === 'SENT' ? ['pill-ok', 'Sent'] : ['pill-muted', 'Cancelled'];
            const when = c.status === 'SCHEDULED' ? `Sends ${fmtShort(c.sendAt)} ${fmtTime(c.sendAt)}` : c.lastSentAt ? `Sent ${fmtDate(c.lastSentAt)} ${fmtTime(c.lastSentAt)}` : `Created ${fmtDate(c.createdAt)}`;
            return (
              <div key={c.id} className="lv-notice">
                <span className="lv-two">
                  <b>{c.title}</b>
                  <span>
                    Period {c.from ? `${fmtShort(c.from)} – ${fmtDate(c.to)}` : '—'} · {c.audience}
                  </span>
                  <span>
                    {when}
                    {c.recipients ? ` · ${c.recipients} people` : ''} · {c.email ? 'Bell + email' : 'Bell'}
                    {c.repeat === 'WEEKLY' ? ' · weekly' : ''}
                    {c.sentCount > 1 ? ` · sent ${c.sentCount}×` : ''}
                  </span>
                </span>
                <span className={`pill no-dot ${st[0]}`}>{st[1]}</span>
                {d.canManage && (
                  <span className="row-actions">
                    {c.status === 'SCHEDULED' && (
                      <>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(c)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirm('Cancel this notification? Nothing more will be sent.') && act.mutate({ id: c.id, a: 'cancel' })}>
                          Cancel
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => act.mutate({ id: c.id, a: 'send' })}>
                          Send now
                        </button>
                      </>
                    )}
                    {c.status !== 'SCHEDULED' && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...c, id: '' })}>
                        Duplicate
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          {d.items.length === 0 && <div className="lv-empty">No notifications yet</div>}
        </div>
      )}
      {edit && <NoticeForm start={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => (setEdit(null), qc.invalidateQueries({ queryKey: ['leave', 'notices'] }))} />}
    </div>
  );
}

function NoticeForm({ start, onClose, onDone }: { start: Notice | null; onClose: () => void; onDone: () => void }) {
  const depts = useDepartments();
  const locs = useLocations();
  const editing = !!start?.id;
  const [preset, setPreset] = useState('');
  const [title, setTitle] = useState(start?.title ?? '');
  const [body, setBody] = useState(start?.body ?? '');
  const [from, setFrom] = useState(start?.from ?? '');
  const [to, setTo] = useState(start?.to ?? '');
  const [deadline, setDeadline] = useState(start?.deadline ?? '');
  const [deps, setDeps] = useState<string[]>(start?.departments ?? []);
  const [loc, setLoc] = useState<string[]>(start?.locations ?? []);
  const [who, setWho] = useState<'ALL' | 'LAPSE' | 'BALANCE'>(start?.who ?? 'ALL');
  const [balType, setBalType] = useState(start?.balType ?? 'EL');
  const [balMin, setBalMin] = useState(String(start?.balMin ?? 5));
  const [email, setEmail] = useState(start?.email ?? true);
  const [when, setWhen] = useState<'now' | 'later'>(editing ? 'later' : 'now');
  const [at, setAt] = useState(start && editing ? start.sendAt.slice(0, 16) : '');
  const [repeat, setRepeat] = useState<'NONE' | 'WEEKLY'>(start?.repeat ?? 'NONE');
  const [pv, setPv] = useState(0);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const usePreset = (k: string) => {
    setPreset(k);
    const p = PRESETS.find((x) => x.k === k);
    if (!p) return;
    setTitle(p.title);
    setBody(p.body);
    setFrom(p.from);
    setTo(p.to);
    setDeadline(minus(p.from, 7) < new Date().toISOString().slice(0, 10) ? '' : minus(p.from, 7));
    setWho(p.who);
  };
  const insert = (tag: string) => {
    const el = bodyRef.current;
    const t = `{${tag}}`;
    if (!el) return setBody(body + t);
    const a = el.selectionStart ?? body.length;
    const b = el.selectionEnd ?? body.length;
    setBody(body.slice(0, a) + t + body.slice(b));
    requestAnimationFrame(() => (el.focus(), el.setSelectionRange(a + t.length, a + t.length)));
  };

  const payload = useMemo(
    () => ({ title, body, from, to, deadline, departments: deps, locations: loc, who, balType, balMin, email, when, sendAt: at, repeat }),
    [title, body, from, to, deadline, deps, loc, who, balType, balMin, email, when, at, repeat],
  );
  const [pvBody, setPvBody] = useState(payload);
  useEffect(() => {
    const t = setTimeout(() => setPvBody(payload), 400);
    return () => clearTimeout(t);
  }, [payload]);
  const preview = useQuery({
    queryKey: ['leave', 'notice-preview', pvBody],
    queryFn: () => leaveApi.previewNotice({ ...pvBody, when: 'now' }),
    enabled: !!pvBody.title.trim() && !!pvBody.body.trim(),
    retry: false,
    placeholderData: (p) => p,
  });
  useEffect(() => setPv(0), [preview.data?.count]);
  const save = useMutation({
    meta: { busy: when === 'now' ? 'Sending notification…' : editing ? 'Saving notification…' : 'Scheduling notification…' },
    mutationFn: () => leaveApi.saveNotice(editing ? start!.id : null, payload),
    onSuccess: onDone,
  });
  const fe = fieldErrors(save.error);
  const sample = preview.data?.samples[pv];
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      title={editing ? 'Edit notification' : 'Notify employees'}
      onClose={onClose}
      width={920}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => save.mutate()}>
            {when === 'now' ? `Send to ${preview.data?.count ?? '…'} people` : editing ? 'Save changes' : 'Schedule'}
          </button>
        </>
      }
    >
      <div className="lv-notice-form">
        <div className="lv-stack">
          {save.isError && !Object.keys(fe).length && <Alert>{errorText(save.error)}</Alert>}
          {!editing && (
            <select className="input sm" value={preset} onChange={(e) => usePreset(e.target.value)} aria-label="Template">
              <option value="">Start from a template…</option>
              {PRESETS.map((p) => (
                <option key={p.k} value={p.k}>
                  {p.l}
                </option>
              ))}
            </select>
          )}
          <Field label="Title" error={fe.title}>
            <input className="input sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Plan your leave before 31 Dec" />
          </Field>
          <Field label="Message" error={fe.body}>
            <textarea ref={bodyRef} className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div className="lv-chips">
            {TAGS.map((t) => (
              <button key={t} type="button" className="lv-tag" onClick={() => insert(t)} title={`Insert {${t}}`}>
                {`{${t}}`}
              </button>
            ))}
          </div>
          <span className="lv-cap">Leave period</span>
          <div className="lv-three-col">
            <Field label="From">
              <input type="date" className="input sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To" error={fe.to}>
              <input type="date" className="input sm" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Apply by">
              <input type="date" className="input sm" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <span className="lv-cap">Audience</span>
          <div className="lv-aud">
            <span>Departments</span>
            <div className="lv-chips">
              <button type="button" className={`lv-fchip${deps.length === 0 ? ' on' : ''}`} onClick={() => setDeps([])}>
                All
              </button>
              {depts.data?.map((d) => (
                <button key={d.id} type="button" className={`lv-fchip${deps.includes(d.id) ? ' on' : ''}`} onClick={() => toggle(deps, setDeps, d.id)}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>
          <div className="lv-aud">
            <span>Locations</span>
            <div className="lv-chips">
              <button type="button" className={`lv-fchip${loc.length === 0 ? ' on' : ''}`} onClick={() => setLoc([])}>
                All
              </button>
              {locs.data?.map((l) => (
                <button key={l.id} type="button" className={`lv-fchip${loc.includes(l.id) ? ' on' : ''}`} onClick={() => toggle(loc, setLoc, l.id)}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <div className="lv-aud">
            <span>Who</span>
            <div className="lv-chips">
              <Seg
                size="sm"
                value={who}
                onChange={setWho}
                options={[
                  ['ALL', 'Everyone'],
                  ['LAPSE', 'EL will lapse'],
                  ['BALANCE', 'Balance at least'],
                ]}
              />
              {who === 'BALANCE' && (
                <span className="lv-inline sm">
                  <select className="input sm" style={{ width: 80 }} value={balType} onChange={(e) => setBalType(e.target.value)}>
                    {['CL', 'SL', 'EL', 'CO'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <input className="input sm" style={{ width: 64 }} inputMode="numeric" value={balMin} onChange={(e) => setBalMin(e.target.value)} />
                  days
                </span>
              )}
            </div>
          </div>
          <span className="lv-cap">Delivery</span>
          <label className="lv-inline">
            <button type="button" className="switch" role="switch" aria-checked={email} onClick={() => setEmail(!email)} />
            Also send by email (in-app bell always on)
          </label>
          <div className="lv-inline wrap">
            <Seg
              size="sm"
              value={when}
              onChange={setWhen}
              options={[
                ['now', 'Send now'],
                ['later', 'Schedule'],
              ]}
            />
            {when === 'later' && <input type="datetime-local" className="input sm" style={{ width: 220 }} value={at} onChange={(e) => setAt(e.target.value)} aria-invalid={!!fe.sendAt} />}
            {fe.sendAt && <small className="err">{fe.sendAt}</small>}
          </div>
          <div className="lv-inline wrap">
            <span className="lv-cap" style={{ marginRight: 4 }}>
              Repeat
            </span>
            <Seg
              size="sm"
              value={repeat}
              onChange={setRepeat}
              options={[
                ['NONE', 'Once'],
                ['WEEKLY', 'Weekly until period ends'],
              ]}
            />
          </div>
        </div>
        <div className="lv-preview">
          <div className="lv-pv-count">
            <b>{preview.data ? `${preview.data.count} ${preview.data.count === 1 ? 'person' : 'people'}` : '—'}</b>
            <span>{preview.data?.names.join(', ')}{preview.data && preview.data.count > preview.data.names.length ? ` and ${preview.data.count - preview.data.names.length} more` : ''}</span>
          </div>
          <div className="lv-cap-row">
            <span className="lv-cap">Preview · {sample?.name ?? '—'}</span>
            {preview.data && preview.data.samples.length > 1 && (
              <button type="button" className="link-btn" onClick={() => setPv((pv + 1) % preview.data!.samples.length)}>
                Next person
              </button>
            )}
          </div>
          {preview.data?.count === 0 && <div className="lv-warn">Nobody matches this audience right now{who === 'LAPSE' ? ' · no one has EL above the carry-forward limit' : ''}. Widen the departments, locations or “Who”.</div>}
          <div className="lv-pv-card">
            <span className="lv-pv-title">
              <i />
              <b>{sample?.title ?? (title || 'Title')}</b>
            </span>
            <span>{sample?.body ?? (body || 'Your message appears here, filled in for each person.')}</span>
          </div>
          {preview.isError && <small className="err">{errorText(preview.error)}</small>}
        </div>
      </div>
    </Modal>
  );
}
