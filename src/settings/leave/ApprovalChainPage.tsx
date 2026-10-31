import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { Alert } from '../../components/Alert';
import { Icon } from '../../components/icons';
import { BlockLoader } from '../../components/Splash';
import { ApiError, errorText } from '../../lib/http';
import { PermissionsNotice } from '../../onboarding/PermissionsNotice';
import { PersonPicker } from '../../onboarding/shared';
import type { Person } from '../../onboarding/api';
import { SaveBar } from '../EmploymentTypesPage';
import { SettingsHead } from '../SettingsLayout';
import { APPROVERS, leaveConfigApi, type ChainStep } from './api';

const LABEL = Object.fromEntries(APPROVERS);
const up = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m18 15-6-6-6 6" />
  </svg>
);
const down = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const usePreview = (person: string, days: number, steps: ChainStep[]) =>
  useQuery({ queryKey: ['config', 'leave-chain', 'preview', person, days, steps], queryFn: () => leaveConfigApi.previewChain(person, days, steps), enabled: !!person && steps.length > 0, retry: false, placeholderData: (p) => p });

/** Configuration → Leave & attendance → Approval chain: who approves leave and in what order. Saved as a whole; applies to new requests. */
export function ApprovalChainPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['config', 'leave-chain'], queryFn: leaveConfigApi.chain });
  const [steps, setSteps] = useState<ChainStep[]>([]);
  const [who, setWho] = useState<Person | null>(null);
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success'; text: string } | null>(null);
  const server = useMemo(() => (q.data?.steps ?? []).map((s) => ({ approver: s.approver, condition: s.condition, minDays: s.minDays == null ? null : Number(s.minDays) })), [q.data]);
  useEffect(() => setSteps(server), [server]);
  const dirty = JSON.stringify(steps) !== JSON.stringify(server);
  const edit = (i: number, p: Partial<ChainStep>) => setSteps((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) =>
    setSteps((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const save = useMutation({
    meta: { busy: 'Saving approval chain…' },
    mutationFn: () => leaveConfigApi.saveChain(steps, q.data!.version),
    onSuccess: (c) => (qc.setQueryData(['config', 'leave-chain'], c), setMsg({ kind: 'success', text: 'Approval chain saved · applies to new requests' })),
    onError: (e) => setMsg({ kind: 'danger', text: e instanceof ApiError && (e.code === 'STALE' || e.status === 412) ? 'Someone else changed the chain. Reload to see their version.' : errorText(e) }),
  });
  const person = who?.id ?? user?.employeeId ?? '';
  const short = usePreview(person, 1, steps);
  const long = usePreview(person, 5, steps);

  return (
    <>
      <SettingsHead title="Approval chain" sub="Who approves leave, in order. A step that would land on the applicant, or on someone already in the chain, is skipped; nobody found means HR.">
        <SaveBar dirty={dirty ? 1 : 0} saving={save.isPending} onReset={() => (setSteps(server), setMsg(null))} onSave={() => save.mutate()} />
      </SettingsHead>
      <PermissionsNotice errors={[q.error]} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {q.isLoading && <BlockLoader page label="Loading approval chain…" />}
      {q.data && (
        <div className="lc-grid">
          <div className="lv-card">
            <div className="lc-head">
              <b>Leave approval chain</b>
              <span>Applies to new requests. Steps run in order.</span>
            </div>
            {steps.map((s, i) => (
              <div key={i} className="lc-step">
                <span className="lc-n">{i + 1}</span>
                <select className="input sm" style={{ width: 168 }} value={s.approver} onChange={(e) => edit(i, { approver: e.target.value })} aria-label={`Step ${i + 1} approver`}>
                  {APPROVERS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <span className="lv-seg sm">
                  <button type="button" aria-pressed={s.condition === 'ALWAYS'} onClick={() => edit(i, { condition: 'ALWAYS', minDays: null })}>
                    Always
                  </button>
                  <button type="button" aria-pressed={s.condition === 'OVER_DAYS'} onClick={() => edit(i, { condition: 'OVER_DAYS', minDays: s.minDays ?? 3 })}>
                    Over {s.condition === 'OVER_DAYS' ? (s.minDays ?? 3) : 3} days
                  </button>
                </span>
                {s.condition === 'OVER_DAYS' && (
                  <input className="input sm lc-days" type="number" min={0.5} step={0.5} value={s.minDays ?? 3} onChange={(e) => edit(i, { minDays: Number(e.target.value) })} aria-label="More than how many days" />
                )}
                <span style={{ flex: 1 }} />
                <button type="button" className="dfx-icon-btn" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  {up}
                </button>
                <button type="button" className="dfx-icon-btn" title="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                  {down}
                </button>
                <button
                  type="button"
                  className="dfx-icon-btn"
                  title="Remove step"
                  onClick={() => (steps.length > 1 ? setSteps(steps.filter((_, k) => k !== i)) : setMsg({ kind: 'danger', text: 'A chain needs at least one step' }))}
                >
                  {Icon.trash}
                </button>
              </div>
            ))}
            <div style={{ padding: '10px 16px' }}>
              <button type="button" className="btn btn-ghost btn-sm" disabled={steps.length >= 5} onClick={() => setSteps([...steps, { approver: 'HR', condition: 'ALWAYS', minDays: null }])}>
                {Icon.plus} Add step
              </button>
            </div>
          </div>
          <div className="lv-card lc-preview">
            <b>Preview</b>
            <label className="lv-field">
              <span>For</span>
              <PersonPicker value={who} onChange={setWho} />
              <small>{who ? '' : 'Showing you · pick anyone to see their chain'}</small>
            </label>
            {[
              [1, short],
              [5, long],
            ].map(([days, r]) => {
              const res = r as typeof short;
              return (
                <div key={days as number} className="lc-pv">
                  <span>
                    {who?.name ?? 'You'} · {days as number} {days === 1 ? 'day' : 'days'} of leave
                  </span>
                  <div className="lc-flow">
                    {res.isLoading && <span className="field-hint">Working it out…</span>}
                    {res.isError && <span className="err">{errorText(res.error)}</span>}
                    {res.data?.map((x) => (
                      <span key={x.sort} className="lc-node">
                        <span>
                          <b>{x.name}</b>
                          <small>{LABEL[x.approver] ?? x.approver}</small>
                        </span>
                        {Icon.chevR}
                      </span>
                    ))}
                    {res.data && <span className="lc-ok">{res.data.length ? 'Approved' : 'Approved automatically'}</span>}
                  </div>
                </div>
              );
            })}
            {dirty && <span className="field-hint">Previewing your unsaved changes.</span>}
          </div>
        </div>
      )}
    </>
  );
}
