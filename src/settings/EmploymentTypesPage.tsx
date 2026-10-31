import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { errorText } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { settingsApi, type EmploymentType } from './api';
import { SettingsHead } from './SettingsLayout';
import { useDraftRows } from './useDraftRows';
import { Cell, Toggle, useBeforeUnload } from './cells';
import { BlockLoader } from '../components/Splash';

const FIELDS: (keyof EmploymentType)[] = ['name', 'code', 'probationMonths', 'noticeDays', 'leaveEligible', 'payrollEligible', 'fixedTerm', 'active'];

export function EmploymentTypesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings', 'employment-types'], queryFn: settingsApi.employmentTypes });
  const [rowErr, setRowErr] = useState<string | null>(null);
  const d = useDraftRows<EmploymentType>(
    q.data,
    FIELDS,
    () => ({ name: '', code: '', probationMonths: 0, noticeDays: 30, leaveEligible: true, payrollEligible: true, fixedTerm: false, sort: (q.data?.length ?? 0) * 10 + 10, active: true, headcount: null }),
    {
      label: 'Saving employment types…',
      create: (r) => settingsApi.createEmploymentType(pick(r)),
      update: (id, c, v) => settingsApi.updateEmploymentType(id, c, v),
    },
  );
  useBeforeUnload(d.dirty > 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['settings', 'employment-types'] });
    qc.invalidateQueries({ queryKey: ['lookup', 'employment-types'] });
  };
  const save = async () => {
    await d.save();
    refresh();
  };
  const remove = async (r: EmploymentType) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    try {
      await settingsApi.deleteEmploymentType(r.id);
      refresh();
    } catch (e) {
      setRowErr(`${r.name}: ${errorText(e)} You can switch it off (Active) instead.`);
    }
  };

  return (
    <>
      <SettingsHead title="Employment types" sub="Full-time, contract, intern and custom types.">
        <SaveBar dirty={d.dirty} saving={d.saving} onReset={d.reset} onSave={save} />
      </SettingsHead>
      <PermissionsNotice errors={[q.error]} />
      {d.banner && <Alert>{d.banner}</Alert>}
      {rowErr && <Alert>{rowErr}</Alert>}
      <div className="card">
        <div className="card-head" style={{ alignItems: 'flex-start' }}>
          <span>
            Organisation · Employment types
            <span className="field-hint" style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>
              Types assigned to employees. Probation and notice drive confirmations and exits; leave and payroll switches decide who is included.
            </span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={d.add}>
            + Add type
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl edit-tbl">
            <thead>
              <tr>
                <th>Type</th>
                <th>Code</th>
                <th>Probation (months)</th>
                <th>Notice (days)</th>
                <th>Leave</th>
                <th>Payroll</th>
                <th>Fixed term</th>
                <th>Active</th>
                <th>People</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr className="loading-row">
                  <td colSpan={10}>
                    <BlockLoader height={140} size={28} label="Loading employment types…" />
                  </td>
                </tr>
              )}
              {d.rows.map((r) => {
                const e = d.errors[r.key] ?? {};
                return (
                  <tr key={r.key} className={r.isNew ? 'is-new' : ''}>
                    <td>
                      <Cell value={r.name} onChange={(v) => d.set(r.key, { name: v })} error={e.name} placeholder="e.g. Apprentice" />
                      {e._row && <span className="field-err">{e._row}</span>}
                    </td>
                    <td>
                      <Cell value={r.code} onChange={(v) => d.set(r.key, { code: v.toUpperCase() })} error={e.code} mono width={70} />
                    </td>
                    <td>
                      <Cell type="number" value={String(r.probationMonths)} onChange={(v) => d.set(r.key, { probationMonths: Number(v) })} error={e.probationMonths} width={80} />
                    </td>
                    <td>
                      <Cell type="number" value={String(r.noticeDays)} onChange={(v) => d.set(r.key, { noticeDays: Number(v) })} error={e.noticeDays} width={80} />
                    </td>
                    <td>
                      <Toggle on={r.leaveEligible} onChange={(v) => d.set(r.key, { leaveEligible: v })} label="Leave" />
                    </td>
                    <td>
                      <Toggle on={r.payrollEligible} onChange={(v) => d.set(r.key, { payrollEligible: v })} label="Payroll" />
                    </td>
                    <td>
                      <Toggle on={r.fixedTerm} onChange={(v) => d.set(r.key, { fixedTerm: v })} label="Fixed term" />
                    </td>
                    <td>
                      <Toggle on={r.active} onChange={(v) => d.set(r.key, { active: v })} label="Active" />
                    </td>
                    <td className="muted">{r.headcount ?? '—'}</td>
                    <td>
                      <button type="button" className="dfx-icon-btn" title={r.isNew ? 'Remove row' : 'Delete'} onClick={() => (r.isNew ? d.drop(r.key) : remove(r))}>
                        {Icon.trash}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {q.data && d.rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="card-empty">
                    No employment types yet. Add Full-time to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function pick(r: EmploymentType) {
  return { name: r.name.trim(), code: r.code.trim(), probationMonths: r.probationMonths, noticeDays: r.noticeDays, leaveEligible: r.leaveEligible, payrollEligible: r.payrollEligible, fixedTerm: r.fixedTerm, active: r.active, sort: r.sort };
}

export function SaveBar({ dirty, saving, onReset, onSave }: { dirty: number; saving: boolean; onReset: () => void; onSave: () => void }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {dirty > 0 && <span className="field-hint">{dirty} unsaved</span>}
      <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || saving} onClick={onReset}>
        Reset
      </button>
      <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </span>
  );
}
