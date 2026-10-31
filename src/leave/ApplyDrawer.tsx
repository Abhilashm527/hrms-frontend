import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors, get } from '../lib/http';
import { ConfigInput, Drawer, PersonPicker } from '../onboarding/shared';
import type { Person as PickPerson } from '../onboarding/api';
import { STEP_ROLE, TYPE_COLORS, leaveApi, type CheckResult } from './api';
import { dd } from './ui';

type FormView = { sections: { name: string; showName: boolean; fields: { key: string; label: string; type: string; level: string; required: boolean; helpText: string | null; options: string[] }[] }[] };

/** Apply leave: for yourself, or (HR) for someone else. The days, the balance afterwards and the approvers are checked live as you fill it in. */
export function ApplyDrawer({ canForOthers, onClose, onDone }: { canForOthers: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const [who, setWho] = useState<PickPerson | null>(null);
  const [code, setCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState(false);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const opts = useQuery({ queryKey: ['leave', 'apply-options', who?.id ?? 'me'], queryFn: () => leaveApi.applyOptions(who?.id) });
  const form = useQuery({ queryKey: ['forms', 'leave', 'schema'], queryFn: () => get<FormView>('/forms/leave/schema'), staleTime: 5 * 60_000, retry: false });
  const type = opts.data?.types.find((t) => t.code === code);
  useEffect(() => {
    if (!code && opts.data?.types.length) setCode(opts.data.types[0].code);
  }, [opts.data, code]);
  useEffect(() => {
    if (from && (!to || to < from)) setTo(from);
  }, [from]); // eslint-disable-line react-hooks/exhaustive-deps
  const oneDay = !!from && (!to || to === from);
  useEffect(() => {
    if (!oneDay || !type?.halfDay) setHalf(false);
  }, [oneDay, type?.halfDay]);

  // Live check, debounced.
  const body = useMemo(() => ({ employeeId: who?.id, typeCode: code, from, to: to || from, half, hasDocument: doc, available: type?.available }), [who, code, from, to, half, doc, type?.available]);
  const [checkBody, setCheckBody] = useState(body);
  useEffect(() => {
    const t = setTimeout(() => setCheckBody(body), 250);
    return () => clearTimeout(t);
  }, [body]);
  const check = useQuery({
    queryKey: ['leave', 'check', checkBody],
    queryFn: () => leaveApi.check(checkBody),
    enabled: !!checkBody.typeCode && !!checkBody.from,
    retry: false,
  });
  const c: CheckResult | undefined = check.data;

  const apply = useMutation({
    meta: { busy: 'Submitting leave request…' },
    mutationFn: () => leaveApi.apply({ ...body, reason, fields: extra }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['leave'] });
      qc.invalidateQueries({ queryKey: ['employees', 'profile'] });
      onDone(r.id);
    },
  });
  const fe = fieldErrors(apply.error);
  const fields = (form.data?.sections ?? []).flatMap((s) => s.fields.filter((f) => f.level !== 'HIDDEN' && f.type !== 'HEADING'));
  const missing = [!code && 'Choose a leave type', !from && 'Choose the dates', !reason.trim() && 'Add a reason', ...fields.filter((f) => f.required && !extra[f.key]).map((f) => `${f.label} is required`)].filter(Boolean) as string[];
  const problems = [...(c?.errors.map((e) => e.message) ?? []), ...(tried ? missing : [])];
  const after = type && c ? Math.max(0, Number(type.available) - Number(c.days)) : null;

  return (
    <Drawer
      title="Apply leave"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setTried(true);
              if (!missing.length && !(c?.errors.length ?? 0)) apply.mutate();
            }}
          >
            Submit request
          </button>
        </>
      }
    >
      <div className="drawer-body">
        {canForOthers && (
          <label className="lv-field">
            <span>Employee</span>
            <PersonPicker value={who} onChange={(p) => (setWho(p), setCode(''))} />
            <small>{who ? `Applying for ${who.name} · they and their approvers are notified` : 'Leave empty to apply for yourself'}</small>
          </label>
        )}
        {opts.isLoading && <BlockLoader height={120} size={28} label="Loading leave types…" />}
        {opts.isError && <Alert>{errorText(opts.error)}</Alert>}
        {opts.data && (
          <div className="lv-field">
            <span>Leave type</span>
            <div className="lv-typepick">
              {opts.data.types.map((t) => {
                const [fg, bg] = TYPE_COLORS[t.color] ?? TYPE_COLORS[9];
                return (
                  <button key={t.code} type="button" aria-pressed={code === t.code} onClick={() => setCode(t.code)} style={code === t.code ? { borderColor: fg, background: bg } : undefined}>
                    <b style={code === t.code ? { color: fg } : undefined}>{t.name}</b>
                    <small>{t.quota == null && Number(t.available) === 0 ? 'earned when credited' : `${t.available} available`}</small>
                  </button>
                );
              })}
              {opts.data.types.length === 0 && <span className="field-hint">No leave types are open to {who ? who.name : 'you'} right now.</span>}
            </div>
          </div>
        )}
        <div className="lv-two-col">
          <label className="lv-field">
            <span>From</span>
            <input type="date" className="input sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={!!fe.from} />
          </label>
          <label className="lv-field">
            <span>To</span>
            <input type="date" className="input sm" min={from} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={!!fe.to} />
          </label>
        </div>
        {oneDay && type?.halfDay && (
          <label className="lv-inline">
            <button type="button" className="switch" role="switch" aria-checked={half} onClick={() => setHalf(!half)} />
            Half day
          </label>
        )}
        <label className="lv-field">
          <span>Reason</span>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Visible to approvers" aria-invalid={tried && !reason.trim()} />
        </label>
        {type && type.docAfterDays > 0 && (
          <label className="lv-inline">
            <input type="checkbox" checked={doc} onChange={(e) => setDoc(e.target.checked)} />
            I have a supporting document (needed for more than {dd(type.docAfterDays)})
          </label>
        )}
        {fields.length > 0 && (
          <div className="lv-cx">
            <span className="lv-cap">More details</span>
            <div className="lv-cx-grid">
              {fields.map((f) => (
                <label key={f.key} className="lv-field">
                  <span>
                    {f.label}
                    {f.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                  </span>
                  <ConfigInput type={f.type} value={extra[f.key] ?? ''} onChange={(v) => setExtra({ ...extra, [f.key]: v })} options={f.options} invalid={!!fe[f.key] || (tried && f.required && !extra[f.key])} disabled={f.level === 'VIEW'} />
                  {fe[f.key] ? <small className="err">{fe[f.key]}</small> : f.helpText ? <small>{f.helpText}</small> : null}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="lv-summary">
          <div>
            <span>{type?.countAs === 'CALENDAR' ? 'Calendar days' : 'Working days'}</span>
            <b>{c ? dd(Number(c.days), half && Number(c.days) === 0.5) : '—'}</b>
          </div>
          <div>
            <span>Balance after approval</span>
            <b>{after == null ? '—' : `${after} ${type?.code}`}</b>
          </div>
          <div>
            <span>Approvers</span>
            <b>{!c ? '—' : c.autoApprove ? 'Approved automatically' : c.approvers.map((a) => `${a.name} (${STEP_ROLE[a.approver] ?? a.approver})`).join(' → ')}</b>
          </div>
        </div>
        {(problems.length > 0 || apply.isError) && (
          <div className="lv-errors" role="alert">
            {problems.map((p) => (
              <span key={p}>{p}</span>
            ))}
            {apply.isError && !Object.keys(fe).length && <span>{errorText(apply.error)}</span>}
            {apply.isError && Object.values(fe).filter((m) => !problems.includes(m)).map((m) => <span key={m}>{m}</span>)}
          </div>
        )}
      </div>
    </Drawer>
  );
}
