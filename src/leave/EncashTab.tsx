import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { leaveApi, type Encashment } from './api';
import { Field, Kpi, Modal, Who, fmtDate, inr } from './ui';

const CHIPS: [string, string][] = [
  ['ALL', 'All'],
  ['PENDING', 'Pending'],
  ['APPROVED', 'Sent to payroll'],
  ['PAID', 'Paid'],
  ['REJECTED', 'Rejected'],
];
const KIND: Record<Encashment['kind'], string> = { ON_REQUEST: 'On request', EXIT: 'Exit (F&F)', YEAR_END: 'Year-end' };
const ST: Record<Encashment['status'], [string, string]> = { PENDING: ['pill-warn', 'Pending'], APPROVED: ['pill-info', 'Sent to payroll'], PAID: ['pill-ok', 'Paid'], REJECTED: ['pill-danger', 'Rejected'] };

export function EncashTab({ newFor, clearNew, openLedger }: { newFor: string | null; clearNew: () => void; openLedger: (id: string) => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('ALL');
  const [creating, setCreating] = useState<string | null | undefined>(newFor ?? undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (newFor) setCreating(newFor);
  }, [newFor]);
  const q = useQuery({ queryKey: ['leave', 'encash', status], queryFn: () => leaveApi.encashments(status) });
  const d = q.data;
  const decide = useMutation({
    meta: { busy: (v: unknown) => ({ approve: 'Approving encashment…', reject: 'Rejecting encashment…', paid: 'Marking as paid…' })[(v as { action: string }).action] ?? 'Saving…' },
    mutationFn: (v: { id: string; action: 'approve' | 'reject' | 'paid'; note?: string }) => leaveApi.decideEncashment(v.id, v.action, v.note),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['leave'] }), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const year = new Date().getFullYear();

  return (
    <div className="lv-stack">
      <PermissionsNotice errors={[q.error]} />
      {d && (
        <div className="lv-kpis three">
          <Kpi label="Pending" value={`${d.pending.count} · ${inr(d.pending.amount)}`} />
          <Kpi label={`Paid / sent in ${year}`} value={inr(d.paidThisYear)} />
          <Kpi label="Liability · encashable balances" value={inr(d.liability)} />
        </div>
      )}
      <div className="lv-bar">
        <div className="lv-chips">
          {CHIPS.map(([k, l]) => (
            <button key={k} type="button" className={`lv-fchip${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>
              {l}
            </button>
          ))}
        </div>
        <span className="grow" />
        {d?.canManage && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(null)}>
            {Icon.plus} New encashment
          </button>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      {q.isLoading && <BlockLoader height={260} label="Loading encashments…" />}
      {d && (
        <div className="lv-card">
          {d.items.map((r) => (
            <div key={r.id} className="lv-enc">
              <button type="button" className="lv-enc-who" onClick={() => r.employee && openLedger(r.employee.id)}>
                <Who p={r.employee} sub={`${r.no} · ${r.employee?.department?.name ?? r.employee?.code ?? ''}`} />
              </button>
              <span className="lv-two">
                <b style={{ fontWeight: 500 }}>
                  {KIND[r.kind]} · {r.type?.code} {r.year}
                </b>
                <span>
                  {r.days} days × {inr(r.rate)} · {fmtDate(r.paidAt ?? r.decidedAt ?? r.createdAt)}
                </span>
              </span>
              <b className="lv-amt">{inr(r.amount)}</b>
              <span>
                <span className={`pill no-dot ${ST[r.status][0]}`}>{ST[r.status][1]}</span>
              </span>
              <span className="row-actions lv-enc-act">
                {d.canManage && r.status === 'PENDING' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const why = prompt('Reason for rejecting (optional):');
                        if (why !== null) decide.mutate({ id: r.id, action: 'reject', note: why || undefined });
                      }}
                    >
                      Reject
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => decide.mutate({ id: r.id, action: 'approve' })}>
                      Approve
                    </button>
                  </>
                )}
                {d.canManage && r.status === 'APPROVED' && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide.mutate({ id: r.id, action: 'paid' })}>
                    Mark paid
                  </button>
                )}
              </span>
            </div>
          ))}
          {d.items.length === 0 && <div className="lv-empty">No encashments</div>}
        </div>
      )}
      <span className="field-hint">Encashment rate = monthly basic ÷ 26 per day. Exit (F&amp;F) encashes the full encashable balance on the last working day.</span>
      {creating !== undefined && (
        <NewEncashment
          person={creating}
          onClose={() => (setCreating(undefined), clearNew())}
          onDone={() => (setCreating(undefined), clearNew(), qc.invalidateQueries({ queryKey: ['leave'] }))}
        />
      )}
    </div>
  );
}

function NewEncashment({ person, onClose, onDone }: { person: string | null; onClose: () => void; onDone: () => void }) {
  const [pid, setPid] = useState(person ?? '');
  const [kind, setKind] = useState<'ON_REQUEST' | 'EXIT'>('ON_REQUEST');
  const [code, setCode] = useState('');
  const [days, setDays] = useState('');
  const opts = useQuery({ queryKey: ['leave', 'encash-options', pid, kind], queryFn: () => leaveApi.encashOptions(pid || undefined, kind) });
  const o = opts.data;
  useEffect(() => {
    if (!code && o?.types.length) setCode(o.types[0].code);
  }, [o, code]);
  const lim = o?.limits?.find((x) => x.code === code);
  const isFF = kind === 'EXIT';
  useEffect(() => {
    if (isFF && lim) setDays(String(lim.max));
  }, [isFF, lim]);
  const rate = Number(o?.rate ?? 0);
  const create = useMutation({
    meta: { busy: 'Creating encashment…' },
    mutationFn: () => leaveApi.createEncashment({ employeeId: pid, typeCode: code, kind, days }),
    onSuccess: onDone,
  });
  const fe = fieldErrors(create.error);
  return (
    <Modal
      title="New leave encashment"
      sub="Includes current and ex-employees"
      onClose={onClose}
      width={480}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!pid || !code || !Number(days)} onClick={() => create.mutate()}>
            Create
          </button>
        </>
      }
    >
      {create.isError && !Object.keys(fe).length && <Alert>{errorText(create.error)}</Alert>}
      <Field label="Person" error={fe.employeeId}>
        <select className="input sm" value={pid} onChange={(e) => (setPid(e.target.value), setDays(''))}>
          <option value="">Choose a person…</option>
          {o?.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.exitDate ? ` · exited ${fmtDate(p.exitDate)}` : p.code ? ` · ${p.code}` : ''}
            </option>
          ))}
        </select>
      </Field>
      <div className="lv-two-col">
        <Field label="Kind">
          <select className="input sm" value={kind} onChange={(e) => setKind(e.target.value as 'ON_REQUEST' | 'EXIT')}>
            <option value="ON_REQUEST">On request</option>
            <option value="EXIT">Exit (F&amp;F)</option>
          </select>
        </Field>
        <Field label="Leave type" error={fe.type}>
          <select className="input sm" value={code} onChange={(e) => setCode(e.target.value)}>
            {o?.types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} · {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Days" error={fe.days} hint={lim ? `${lim.available} available · up to ${lim.max} can be encashed${isFF ? ' · F&F takes the full balance' : ''}` : pid ? 'Working out the balance…' : 'Pick a person to see their balance'}>
        <input className="input sm" inputMode="decimal" value={days} readOnly={isFF} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <div className="lv-summary">
        <div>
          <span>Rate</span>
          <b>{pid ? (rate ? `${inr(rate)} per day` : 'No CTC on file') : '—'}</b>
        </div>
        <div>
          <span>Amount</span>
          <b>{rate && Number(days) ? inr(rate * Number(days)) : '—'}</b>
        </div>
      </div>
    </Modal>
  );
}
