import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { Icon } from '../../components/icons';
import { BlockLoader } from '../../components/Splash';
import { ApiError, errorText, fieldErrors } from '../../lib/http';
import { TYPE_COLORS } from '../../leave/api';
import { Seg } from '../../leave/ui';
import { PermissionsNotice } from '../../onboarding/PermissionsNotice';
import { Drawer } from '../../onboarding/shared';
import { SettingsHead } from '../SettingsLayout';
import { leaveConfigApi, type Accrual, type LeaveType } from './api';

const COLS = '64px minmax(160px,1.2fr) 96px minmax(150px,1fr) 120px 90px 76px 36px';
const ACC: [Accrual, string][] = [
  ['yearly', 'Yearly · credited 1 Jan'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['event', 'Per event'],
  ['earned', 'Earned (e.g. comp-off)'],
];
const r1 = (n: number) => Math.round(n * 10) / 10;
const accTxt = (t: LeaveType) =>
  ({
    yearly: 'Yearly · credited 1 Jan',
    monthly: `Monthly · ${r1((t.quota ?? 0) / 12)} per month`,
    quarterly: `Quarterly · ${r1((t.quota ?? 0) / 4)} per quarter`,
    event: 'Per event',
    earned: 'Earned on approved extra day',
  })[t.accrual];
const carryTxt = (t: LeaveType) => (t.accrual === 'earned' ? (t.expiryDays ? `Expires in ${t.expiryDays} days` : 'No expiry') : t.carry === 'all' ? 'All unused' : t.carry === 'upto' ? `Up to ${t.carryMax} days` : 'No');
const rules = (t: LeaveType) =>
  [
    t.countAs === 'calendar' && 'Calendar days',
    !t.paid && 'Unpaid',
    t.gender !== 'all' && `${t.gender === 'female' ? 'Female' : 'Male'} only`,
    !t.halfDay && 'No half-day',
    t.noticeDays && `${t.noticeDays}d notice`,
    t.maxConsecutive && `Max ${t.maxConsecutive} in a row`,
    t.docAfterDays && `Doc after ${t.docAfterDays}d`,
    t.minServiceDays && `After ${t.minServiceDays}d service`,
  ]
    .filter(Boolean)
    .join(' · ') || 'Standard rules';

/** Configuration → Leave & attendance → Leave policy: the leave types, their quotas and every rule the apply form and the ledger use. */
export function LeavePolicyPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['config', 'leave-types'], queryFn: leaveConfigApi.types });
  const [edit, setEdit] = useState<LeaveType | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const quota = useMutation({
    meta: { busy: 'Saving days…' },
    mutationFn: (v: { id: string; quota: number }) => leaveConfigApi.setQuota(v.id, v.quota),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['config', 'leave-types'] }), qc.invalidateQueries({ queryKey: ['leave'] }), setErr(null)),
    onError: (e) => (setErr(errorText(e)), qc.invalidateQueries({ queryKey: ['config', 'leave-types'] })),
  });
  const list = q.data ?? [];
  return (
    <>
      <SettingsHead title="Leave policy" sub="Leave types, how many days people get and the rules for applying. Changes apply to new requests and future credits." />
      <PermissionsNotice errors={[q.error]} />
      {q.isLoading && <BlockLoader page label="Loading leave types…" />}
      {q.data && (
        <>
          <div className="lv-bar">
            <span className="field-hint" style={{ flex: 1 }}>
              {list.filter((t) => t.active).length} active leave types · edit days inline or open a type for all rules
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit('new')}>
              {Icon.plus} New leave type
            </button>
          </div>
          {err && <Alert>{err}</Alert>}
          <div className="lv-tbl">
            <div style={{ minWidth: 900 }}>
              <div className="lv-head" style={{ gridTemplateColumns: COLS }}>
                {['Code', 'Leave type', 'Days', 'Accrual', 'Carry forward', 'Encash', 'Status', ''].map((h, i) => (
                  <span key={i}>{h}</span>
                ))}
              </div>
              {list.map((t) => {
                const [fg, bg] = TYPE_COLORS[t.colorIndex] ?? TYPE_COLORS[9];
                return (
                  <div key={`${t.id}|${t.version}`} className="lv-row" style={{ gridTemplateColumns: COLS, opacity: t.active ? 1 : 0.55 }}>
                    <span className="lv-type" style={{ color: fg, background: bg, height: 22, fontSize: 11.5, padding: '0 8px', justifySelf: 'start' }}>
                      {t.code}
                    </span>
                    <span className="lv-two">
                      <b style={{ fontWeight: 500 }}>{t.name}</b>
                      <span>{rules(t)}</span>
                    </span>
                    {t.accrual === 'earned' ? (
                      <span>Earned</span>
                    ) : (
                      <input
                        type="number"
                        className="input sm"
                        style={{ width: 70 }}
                        min={0}
                        step={0.5}
                        defaultValue={t.quota ?? 0}
                        aria-label={`${t.name} days`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (e.target.value !== '' && v !== Number(t.quota)) quota.mutate({ id: t.id, quota: v });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    )}
                    <span className="ell">{accTxt(t)}</span>
                    <span className="ell">{carryTxt(t)}</span>
                    <span>{t.encashable ? `Yes${Number(t.encashMax) ? ` · max ${t.encashMax}` : ''}` : 'No'}</span>
                    <span>
                      <span className={`pill no-dot ${t.active ? 'pill-ok' : 'pill-muted'}`}>{t.active ? 'Active' : 'Inactive'}</span>
                    </span>
                    <button type="button" className="dfx-icon-btn" title="Edit rules" onClick={() => setEdit(t)}>
                      {Icon.sliders}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      {edit && <TypeForm start={edit === 'new' ? null : edit} nextColor={list.length % TYPE_COLORS.length} onClose={() => setEdit(null)} onDone={() => (setEdit(null), qc.invalidateQueries({ queryKey: ['config', 'leave-types'] }), qc.invalidateQueries({ queryKey: ['leave'] }))} />}
    </>
  );
}

type Draft = Omit<LeaveType, 'id' | 'system' | 'inUse' | 'version' | 'quota'> & { quota: string };

function TypeForm({ start, nextColor, onClose, onDone }: { start: LeaveType | null; nextColor: number; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState<Draft>(() =>
    start
      ? { ...start, quota: start.quota == null ? '' : String(start.quota) }
      : { code: '', name: '', shortLabel: '', colorIndex: nextColor, active: true, accrual: 'yearly', quota: '6', carry: 'none', carryMax: 0, expiryDays: 0, encashable: false, encashMax: 0, countAs: 'working', paid: true, gender: 'all', halfDay: true, noticeDays: 0, maxConsecutive: 0, docAfterDays: 0, minServiceDays: 0 },
  );
  const [ask, setAsk] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const num = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === '' ? 0 : Number(e.target.value)) as never);
  const earned = d.accrual === 'earned';
  useEffect(() => setAsk(null), [d]);
  const body = () => ({ ...d, quota: earned ? null : d.quota === '' ? null : Number(d.quota), shortLabel: d.shortLabel.trim() || d.name.trim().replace(/ leave$/i, ''), code: d.code.trim().toUpperCase(), name: d.name.trim() }) as unknown as Partial<LeaveType>;
  const save = useMutation({
    meta: { busy: start ? 'Saving leave type…' : 'Creating leave type…' },
    mutationFn: (force: boolean) => (start ? leaveConfigApi.updateType(start.id, body(), start.version, force) : leaveConfigApi.createType(body())),
    onSuccess: onDone,
    onError: (e) => e instanceof ApiError && e.code === 'CONFIRM_REQUIRED' && setAsk(e.message),
  });
  const remove = useMutation({ meta: { busy: 'Deleting leave type…' }, mutationFn: () => leaveConfigApi.deleteType(start!.id), onSuccess: onDone });
  const fe = fieldErrors(save.error);
  const err = save.isError && !(save.error instanceof ApiError && save.error.code === 'CONFIRM_REQUIRED') && !Object.keys(fe).length ? errorText(save.error) : remove.isError ? errorText(remove.error) : null;
  const canDel = !!start && !start.system && !start.inUse;

  return (
    <Drawer
      width={600}
      title={start ? `${start.name} · ${start.code}` : 'New leave type'}
      sub={start ? (start.system ? 'Built-in type · can be switched off but not deleted' : start.inUse ? 'In use by existing requests · code is locked' : 'Not used yet') : 'Employees can apply for it as soon as it is saved'}
      onClose={onClose}
      foot={
        <>
          {canDel && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => confirm(`Delete ${start!.name}?`) && remove.mutate()}>
              {Icon.trash} Delete type
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!d.name.trim()} onClick={() => save.mutate(false)}>
            Save
          </button>
        </>
      }
    >
      <div className="drawer-body">
        <div className="lp-form">
          {err && <Alert>{err}</Alert>}
          {ask && (
            <div className="lv-warn" style={{ gridColumn: '1 / -1' }}>
              {ask}{' '}
              <button type="button" className="link-btn" onClick={() => save.mutate(true)}>
                Save anyway
              </button>
            </div>
          )}
          <span className="lp-sec">Basics</span>
          <Lbl label="Name" error={fe.name}>
            <input className="input sm" placeholder="e.g. Bereavement leave" value={d.name} onChange={(e) => set('name', e.target.value)} />
          </Lbl>
          <Lbl label="Code" error={fe.code} hint={start?.inUse ? 'In use · the code is locked' : '2–4 letters · shown on calendars and chips'}>
            <input className="input sm mono" placeholder="BL" maxLength={4} readOnly={!!start?.inUse} value={d.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
          </Lbl>
          <Lbl label="Short label" error={fe.shortLabel}>
            <input className="input sm" placeholder={d.name.replace(/ leave$/i, '') || 'Bereavement'} value={d.shortLabel} onChange={(e) => set('shortLabel', e.target.value)} />
          </Lbl>
          <div className="lv-field">
            <span>Colour</span>
            <div className="lp-colors">
              {TYPE_COLORS.map(([fg, bg], i) => (
                <button key={i} type="button" aria-label={`Colour ${i + 1}`} aria-pressed={d.colorIndex === i} style={{ background: bg, borderColor: fg }} onClick={() => set('colorIndex', i)} />
              ))}
            </div>
          </div>
          <label className="lv-inline" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="switch" role="switch" aria-checked={d.active} onClick={() => set('active', !d.active)} />
            Active · employees can apply
          </label>

          <span className="lp-sec">Entitlement</span>
          <Lbl label="Accrual" error={fe.accrual}>
            <select className="input sm" value={d.accrual} onChange={(e) => set('accrual', e.target.value as Accrual)}>
              {ACC.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Lbl>
          {earned ? (
            <Lbl label="Expires after (days)" error={fe.expiryDays} hint="0 = never">
              <input className="input sm" inputMode="numeric" value={d.expiryDays} onChange={num('expiryDays')} />
            </Lbl>
          ) : (
            <Lbl label={d.accrual === 'event' ? 'Days per event' : 'Days per year'} error={fe.quota}>
              <input className="input sm" inputMode="decimal" value={d.quota} onChange={(e) => set('quota', e.target.value)} />
            </Lbl>
          )}
          {!earned && (
            <div className="lv-field">
              <span>Carry forward</span>
              <Seg
                size="sm"
                value={d.carry}
                onChange={(v) => set('carry', v)}
                options={[
                  ['none', 'None'],
                  ['upto', 'Up to'],
                  ['all', 'All'],
                ]}
              />
              {d.carry === 'upto' && <input className="input sm" inputMode="decimal" placeholder="Max days" value={d.carryMax || ''} onChange={num('carryMax')} aria-invalid={!!fe.carryMax} />}
              {fe.carryMax && <small className="err">{fe.carryMax}</small>}
            </div>
          )}
          {!earned && (
            <div className="lv-field">
              <span>Encashment</span>
              <label className="lv-inline">
                <button type="button" className="switch" role="switch" aria-checked={d.encashable} onClick={() => set('encashable', !d.encashable)} />
                Encashable at year end / exit
              </label>
              {d.encashable && <input className="input sm" inputMode="decimal" placeholder="Max days (0 = all)" value={d.encashMax || ''} onChange={num('encashMax')} />}
            </div>
          )}

          <span className="lp-sec">How it is counted</span>
          <div className="lv-field">
            <span>Count as</span>
            <Seg
              size="sm"
              value={d.countAs}
              onChange={(v) => set('countAs', v)}
              options={[
                ['working', 'Working days'],
                ['calendar', 'Calendar days'],
              ]}
            />
          </div>
          <div className="lv-field">
            <span>Pay</span>
            <Seg
              size="sm"
              value={d.paid ? 'paid' : 'unpaid'}
              onChange={(v) => set('paid', v === 'paid')}
              options={[
                ['paid', 'Paid'],
                ['unpaid', 'Unpaid'],
              ]}
            />
          </div>
          <div className="lv-field">
            <span>Eligible</span>
            <Seg
              size="sm"
              value={d.gender}
              onChange={(v) => set('gender', v)}
              options={[
                ['all', 'Everyone'],
                ['female', 'Female'],
                ['male', 'Male'],
              ]}
            />
          </div>
          <label className="lv-inline" style={{ alignSelf: 'end', paddingBottom: 6 }}>
            <button type="button" className="switch" role="switch" aria-checked={d.halfDay} onClick={() => set('halfDay', !d.halfDay)} />
            Allow half-day
          </label>

          <span className="lp-sec">Rules when applying</span>
          <Lbl label="Advance notice (days)" error={fe.noticeDays} hint="0 = can apply same day">
            <input className="input sm" inputMode="numeric" value={d.noticeDays} onChange={num('noticeDays')} />
          </Lbl>
          <Lbl label="Max consecutive days" error={fe.maxConsecutive} hint="0 = no limit">
            <input className="input sm" inputMode="numeric" value={d.maxConsecutive} onChange={num('maxConsecutive')} />
          </Lbl>
          <Lbl label="Document required after (days)" error={fe.docAfterDays} hint="e.g. medical certificate · 0 = never">
            <input className="input sm" inputMode="numeric" value={d.docAfterDays} onChange={num('docAfterDays')} />
          </Lbl>
          <Lbl label="Minimum service (days)" error={fe.minServiceDays} hint="Days since joining before first use">
            <input className="input sm" inputMode="numeric" value={d.minServiceDays} onChange={num('minServiceDays')} />
          </Lbl>
        </div>
      </div>
    </Drawer>
  );
}

function Lbl({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="lv-field">
      <span>{label}</span>
      {children}
      {error ? <small className="err">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );
}
