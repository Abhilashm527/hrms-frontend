import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { Icon } from '../../components/icons';
import { BlockLoader } from '../../components/Splash';
import { errorText } from '../../lib/http';
import { Modal } from '../../leave/ui';
import { PermissionsNotice } from '../../onboarding/PermissionsNotice';
import { SettingsHead } from '../SettingsLayout';
import { HOL_PAL, leaveConfigApi, type HolidayType } from './api';

const COLS = '110px minmax(140px,1fr) 190px 130px 90px 32px';

/** Configuration → Leave & attendance → Holiday types: the categories on the holiday calendar and whether each is a day off. */
export function HolidayTypesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config', 'holiday-types'], queryFn: leaveConfigApi.holidayTypes });
  const [adding, setAdding] = useState(false);
  const [nw, setNw] = useState({ name: '', pal: 3 });
  const [msg, setMsg] = useState<{ kind: 'danger' | 'info'; text: string } | null>(null);
  const [del, setDel] = useState<HolidayType | null>(null);
  const refresh = () => (qc.invalidateQueries({ queryKey: ['config', 'holiday-types'] }), qc.invalidateQueries({ queryKey: ['leave', 'holidays'] }));
  const upd = useMutation({
    meta: { busy: 'Saving holiday type…' },
    mutationFn: (v: { id: string; b: Partial<HolidayType> }) => leaveConfigApi.updateHolidayType(v.id, v.b),
    onSuccess: (r) => {
      refresh();
      setMsg(r.affectedPending?.length ? { kind: 'info', text: `${r.affectedPending.length} pending leave request${r.affectedPending.length === 1 ? '' : 's'} span a holiday of this type and were counted the old way: ${r.affectedPending.map((a) => `${a.employee} (${a.dates})`).join(', ')}. Review them in Leave & attendance.` } : null);
    },
    onError: (e) => (setMsg({ kind: 'danger', text: errorText(e) }), refresh()),
  });
  const add = useMutation({
    meta: { busy: 'Adding holiday type…' },
    mutationFn: () => leaveConfigApi.createHolidayType({ name: nw.name.trim(), fg: HOL_PAL[nw.pal][0], bg: HOL_PAL[nw.pal][1], dayOff: true }),
    onSuccess: () => (refresh(), setAdding(false), setNw({ name: '', pal: (nw.pal + 1) % HOL_PAL.length }), setMsg(null)),
    onError: (e) => setMsg({ kind: 'danger', text: errorText(e) }),
  });
  const list = q.data ?? [];

  return (
    <>
      <SettingsHead title="Holiday types" sub="Categories on the holiday calendar. Renaming is safe everywhere; holidays keep their type." />
      <PermissionsNotice errors={[q.error]} />
      {q.isLoading && <BlockLoader page label="Loading holiday types…" />}
      {q.data && (
        <div className="lv-stack" style={{ maxWidth: 820 }}>
          <div className="lv-bar">
            <span className="field-hint" style={{ flex: 1, minWidth: 240 }}>
              Day-off types are excluded from leave day counts and attendance. Working-day types (like optional holidays) are listed for employees but still count as working days.
            </span>
            {!adding && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                {Icon.plus} Add type
              </button>
            )}
          </div>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <div className="lv-tbl">
            <div style={{ minWidth: 640 }}>
              <div className="lv-head" style={{ gridTemplateColumns: COLS }}>
                {['Preview', 'Name', 'Colour', 'Counts as', 'Used', ''].map((h, i) => (
                  <span key={i} style={i === 4 ? { textAlign: 'right' } : undefined}>
                    {h}
                  </span>
                ))}
              </div>
              {list.map((t) => (
                <div key={`${t.id}|${t.name}|${t.fg}|${t.dayOff}`} className="lv-row" style={{ gridTemplateColumns: COLS }}>
                  <Chip name={t.name} fg={t.fg} bg={t.bg} />
                  <input
                    className="input sm"
                    defaultValue={t.name}
                    aria-label="Name"
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && upd.mutate({ id: t.id, b: { name: e.target.value.trim() } })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  <Palette fg={t.fg} onPick={(i) => upd.mutate({ id: t.id, b: { fg: HOL_PAL[i][0], bg: HOL_PAL[i][1] } })} />
                  <label className="lv-inline">
                    <button type="button" className="switch" role="switch" aria-checked={t.dayOff} onClick={() => upd.mutate({ id: t.id, b: { dayOff: !t.dayOff } })} />
                    {t.dayOff ? 'Day off' : 'Working day'}
                  </label>
                  <span className="muted" style={{ textAlign: 'right', fontSize: 12 }}>
                    {t.used} {t.used === 1 ? 'holiday' : 'holidays'}
                  </span>
                  {list.length > 1 ? (
                    <button type="button" className="dfx-icon-btn" title="Delete type" onClick={() => setDel(t)}>
                      {Icon.trash}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
              {adding && (
                <>
                  <div className="lv-row add" style={{ gridTemplateColumns: COLS }}>
                    <Chip name={nw.name || 'New type'} fg={HOL_PAL[nw.pal][0]} bg={HOL_PAL[nw.pal][1]} />
                    <input className="input sm" autoFocus placeholder="e.g. Company event" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} onKeyDown={(e) => (e.key === 'Enter' && nw.name.trim() ? add.mutate() : e.key === 'Escape' && setAdding(false))} />
                    <Palette fg={HOL_PAL[nw.pal][0]} onPick={(i) => setNw({ ...nw, pal: i })} />
                    <span className="field-hint">Day off</span>
                    <span />
                    <span />
                  </div>
                  <div className="lv-add-foot">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!nw.name.trim()} onClick={() => add.mutate()}>
                      Save
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {del && <DeleteType t={del} others={list.filter((x) => x.id !== del.id)} onClose={() => setDel(null)} onDone={() => (setDel(null), refresh())} />}
    </>
  );
}

function Chip({ name, fg, bg }: { name: string; fg: string; bg: string }) {
  return (
    <span className="ht-chip" style={{ color: fg, background: bg }}>
      <i style={{ background: fg }} />
      {name}
    </span>
  );
}

function Palette({ fg, onPick }: { fg: string; onPick: (i: number) => void }) {
  return (
    <span className="ht-pal">
      {HOL_PAL.map(([c], i) => (
        <button key={c} type="button" aria-label={`Colour ${i + 1}`} aria-pressed={c.toLowerCase() === fg.toLowerCase()} style={{ background: c }} onClick={() => onPick(i)} />
      ))}
    </span>
  );
}

function DeleteType({ t, others, onClose, onDone }: { t: HolidayType; others: HolidayType[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState(others[0]?.id ?? '');
  const go = useMutation({ meta: { busy: 'Deleting holiday type…' }, mutationFn: () => leaveConfigApi.deleteHolidayType(t.id, t.used ? to : undefined), onSuccess: onDone });
  return (
    <Modal
      title={`Delete ${t.name}?`}
      sub={t.used ? `${t.used} ${t.used === 1 ? 'holiday uses' : 'holidays use'} this type; they move to the type you pick.` : 'No holidays use this type.'}
      onClose={onClose}
      width={420}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => go.mutate()}>
            Delete
          </button>
        </>
      }
    >
      {go.isError && <Alert>{errorText(go.error)}</Alert>}
      {t.used > 0 && (
        <label className="lv-field">
          <span>Move its holidays to</span>
          <select className="input sm" value={to} onChange={(e) => setTo(e.target.value)}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.dayOff ? 'day off' : 'working day'}
              </option>
            ))}
          </select>
        </label>
      )}
    </Modal>
  );
}
