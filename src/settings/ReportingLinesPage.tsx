import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { ApiError, api, errorText, get } from '../lib/http';
import { Pager } from '../leave/ui';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { useDepartments } from '../onboarding/shared';
import { usePeople } from './OrgListsPages';
import { SettingsHead } from './SettingsLayout';

type TeamItem = { teamId: string; name: string; primary: boolean };
type ProjectItem = { projectId: string; name: string; allocation: number; role: string };
type Line = {
  employeeId: string;
  employeeCode: string;
  name: string;
  department: string | null;
  departmentId: string | null;
  extraDepartmentIds: string[];
  teamItems: TeamItem[];
  projectItems: ProjectItem[];
  manager: { id: string; name: string } | null;
  dotted: { id: string; name: string } | null;
  position: string | null;
  type: string | null;
  reports: number;
  noManager: boolean;
  managerOnNotice: boolean;
  overSpan: boolean;
  crossDepartment: boolean;
};
type Edit = { managerId: string; dottedManagerId: string; extraDepartmentIds: string[]; teams: TeamItem[]; projects: ProjectItem[] };
type Health = Record<'noManager' | 'cycles' | 'overDepth' | 'overSpan' | 'exitedManagers' | 'onNoticeManagers' | 'crossDepartment', { id: string; name: string; detail: string }[]>;

const COLS = 'minmax(180px,1.2fr) minmax(170px,1fr) minmax(190px,1.1fr) minmax(200px,1.2fr) 170px 170px 130px 100px 60px';
const HEALTH: [keyof Health, string, string | null][] = [
  ['noManager', 'No manager', 'NO_MANAGER'],
  ['onNoticeManagers', 'Manager on notice', 'ON_NOTICE_MANAGER'],
  ['overSpan', 'Too many reports', 'OVER_SPAN'],
  ['cycles', 'Loops', null],
  ['crossDepartment', 'Cross-department', null],
];
const editOf = (l: Line): Edit => ({ managerId: l.manager?.id ?? '', dottedManagerId: l.dotted?.id ?? '', extraDepartmentIds: [...l.extraDepartmentIds], teams: l.teamItems.map((t) => ({ ...t })), projects: l.projectItems.map((p) => ({ ...p })) });

/**
 * Configuration → Reporting lines: everyone's manager, dotted-line manager, extra departments, teams (★ = primary) and project allocations
 * in one grid. Nothing changes until Save; the whole batch is checked first (cycles, inactive managers, over-allocation) and saved all or nothing.
 */
export function ReportingLinesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [dept, setDept] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [errs, setErrs] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<{ kind: 'danger' | 'success'; text: string } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => (setQd(q.trim()), setPage(0)), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [dept, state, size]);

  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (qd) params.set('q', qd);
  if (dept) params.set('departmentId', dept);
  if (state) params.set('state', state);
  const list = useQuery({ queryKey: ['settings', 'reporting-lines', params.toString()], queryFn: () => get<{ items: Line[]; total: number }>(`/org/reporting-lines?${params}`), placeholderData: keepPreviousData });
  const health = useQuery({ queryKey: ['settings', 'reporting-health'], queryFn: () => get<Health>('/org/reporting-health') });
  const depts = useDepartments();
  const people = usePeople();
  const teams = useQuery({ queryKey: ['lookup', 'teams-all'], queryFn: () => get<{ id: string; name: string; departmentName?: string }[]>('/teams/options'), staleTime: 5 * 60_000 });
  const projects = useQuery({ queryKey: ['lookup', 'projects-all'], queryFn: () => get<{ id: string; name: string; code: string }[]>('/projects/options'), staleTime: 5 * 60_000 });
  const deptName = useMemo(() => new Map((depts.data ?? []).map((d) => [d.id, d.name])), [depts.data]);

  const rows = list.data?.items ?? [];
  const byId = useMemo(() => {
    const m = new Map<string, Line>();
    rows.forEach((r) => m.set(r.employeeId, r));
    return m;
  }, [rows]);
  const cur = (l: Line) => edits[l.employeeId] ?? editOf(l);
  const change = (l: Line, f: (e: Edit) => Edit) => setEdits((all) => ({ ...all, [l.employeeId]: f(structuredClone(all[l.employeeId] ?? editOf(l))) }));
  const changed = Object.entries(edits).filter(([id, e]) => {
    const l = byId.get(id);
    return !l || JSON.stringify(e) !== JSON.stringify(editOf(l));
  });
  const dirty = changed.length;

  const save = useMutation({
    meta: { busy: 'Saving reporting lines…' },
    mutationFn: () =>
      api<{ message: string }>('/org/reporting-lines', {
        method: 'PUT',
        body: {
          rows: changed.map(([employeeId, e]) => ({
            employeeId,
            managerId: e.managerId || null,
            dottedManagerId: e.dottedManagerId || null,
            extraDepartmentIds: e.extraDepartmentIds,
            teams: e.teams.map((t) => ({ teamId: t.teamId, primary: t.primary })),
            projects: e.projects.map((p) => ({ projectId: p.projectId, allocation: p.allocation, role: p.role || 'CONTRIBUTOR' })),
          })),
        },
      }),
    onSuccess: (r) => {
      setEdits({});
      setErrs({});
      setMsg({ kind: 'success', text: r.message });
      qc.invalidateQueries({ queryKey: ['settings', 'reporting-lines'] });
      qc.invalidateQueries({ queryKey: ['settings', 'reporting-health'] });
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (e) => {
      // 422 cells point at the row's position in what was sent.
      const items = e instanceof ApiError && Array.isArray(e.extra.errors) ? (e.extra.errors as { index?: number; message: string }[]) : [];
      const m: Record<string, string[]> = {};
      items.forEach((it) => {
        const id = it.index != null ? changed[it.index]?.[0] : undefined;
        if (id) (m[id] ??= []).push(it.message);
      });
      setErrs(m);
      setMsg({ kind: 'danger', text: items.length ? 'Nothing was saved. Fix the highlighted rows and try again.' : errorText(e) });
    },
  });
  const options = (pairs: [string, string][], exclude?: string) => pairs.filter(([id]) => id !== exclude);
  const h = health.data;

  return (
    <>
      <SettingsHead title="Reporting lines" sub="Who reports to whom, dotted lines, extra departments, teams and project allocation, for everyone in one place.">
        {dirty > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="field-hint">
              {dirty} {dirty === 1 ? 'person' : 'people'} changed
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setEdits({}), setErrs({}), setMsg(null))}>
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => save.mutate()}>
              Save changes
            </button>
          </span>
        )}
      </SettingsHead>
      <PermissionsNotice errors={[list.error]} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {h && (
        <div className="lv-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {HEALTH.map(([k, l, st]) => (
            <button key={k} type="button" className={`lv-kpi click${st && state === st ? ' on' : ''}`} disabled={!st} title={h[k].slice(0, 6).map((x) => `${x.name}: ${x.detail}`).join('\n') || undefined} onClick={() => st && setState(state === st ? '' : st)}>
              <span>{l}</span>
              <b style={{ color: h[k].length && k !== 'crossDepartment' ? 'var(--danger-fg)' : undefined }}>{h[k].length}</b>
            </button>
          ))}
        </div>
      )}
      <div className="lv-bar">
        <label className="dfx-search">
          {Icon.search}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search employees…" />
        </label>
        <select className="sel" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="grow" />
        <span className="field-hint">★ marks the primary team · click another team to make it primary · nothing changes until you save</span>
      </div>
      {list.isLoading && <BlockLoader height={300} label="Loading reporting lines…" />}
      {list.data && (
        <>
          <div className="lv-tbl">
            <div style={{ minWidth: 1400, opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              <div className="lv-head" style={{ gridTemplateColumns: COLS }}>
                {['Employee', 'Departments', 'Teams', 'Projects · allocation', 'Reports to', 'Dotted line', 'Position', 'Type', 'Reports'].map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
              {rows.map((l) => {
                const e = cur(l);
                const mine = edits[l.employeeId] && JSON.stringify(edits[l.employeeId]) !== JSON.stringify(editOf(l));
                const total = e.projects.reduce((a, p) => a + Number(p.allocation || 0), 0);
                const flags = [l.noManager && 'No manager', l.managerOnNotice && 'Manager on notice', l.overSpan && 'Too many reports'].filter(Boolean);
                return (
                  <div key={l.employeeId} className={`lv-row rl-row${mine ? ' changed' : ''}`} style={{ gridTemplateColumns: COLS, alignItems: 'start' }}>
                    <span className="lv-two">
                      <b>{l.name}</b>
                      <span>
                        {l.employeeCode}
                        {flags.length ? ` · ${flags.join(' · ')}` : ''}
                      </span>
                      {errs[l.employeeId]?.map((m) => (
                        <small key={m} className="err" style={{ whiteSpace: 'normal' }}>
                          {m}
                        </small>
                      ))}
                    </span>
                    <span className="rl-chips">
                      <span className="rl-chip main" title="Primary department · change it on the profile">
                        {l.department ?? 'No department'}
                      </span>
                      {e.extraDepartmentIds.map((d) => (
                        <span key={d} className="rl-chip">
                          {deptName.get(d) ?? '…'}
                          <button type="button" aria-label="Remove" onClick={() => change(l, (x) => ({ ...x, extraDepartmentIds: x.extraDepartmentIds.filter((y) => y !== d) }))}>
                            ×
                          </button>
                        </span>
                      ))}
                      <AddSelect
                        label="+ dept"
                        options={(depts.data ?? []).filter((d) => d.id !== l.departmentId && !e.extraDepartmentIds.includes(d.id)).map((d) => [d.id, d.name] as [string, string])}
                        onPick={(v) => change(l, (x) => ({ ...x, extraDepartmentIds: [...x.extraDepartmentIds, v] }))}
                      />
                    </span>
                    <span className="rl-chips">
                      {e.teams.map((t) => (
                        <span key={t.teamId} className={`rl-chip${t.primary ? ' on' : ''}`}>
                          <button type="button" className="rl-star" title={t.primary ? 'Primary team' : 'Make primary'} onClick={() => change(l, (x) => ({ ...x, teams: x.teams.map((y) => ({ ...y, primary: y.teamId === t.teamId })) }))}>
                            {t.primary ? '★' : '☆'}
                          </button>
                          {t.name}
                          <button type="button" aria-label="Remove" onClick={() => change(l, (x) => ({ ...x, teams: x.teams.filter((y) => y.teamId !== t.teamId).map((y, i, a) => ({ ...y, primary: y.primary || (t.primary && i === 0 && a.length > 0) })) }))}>
                            ×
                          </button>
                        </span>
                      ))}
                      {e.teams.length === 0 && <span className="muted">No team</span>}
                      <AddSelect
                        label="+ team"
                        options={(teams.data ?? []).filter((t) => !e.teams.some((x) => x.teamId === t.id)).map((t) => [t.id, t.departmentName ? `${t.name} · ${t.departmentName}` : t.name] as [string, string])}
                        onPick={(v) => change(l, (x) => ({ ...x, teams: [...x.teams, { teamId: v, name: teams.data?.find((t) => t.id === v)?.name ?? '', primary: x.teams.length === 0 }] }))}
                      />
                    </span>
                    <span className="rl-chips">
                      {e.projects.map((p) => (
                        <span key={p.projectId} className="rl-chip">
                          {p.name}
                          <input
                            className="rl-pct"
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={p.allocation}
                            aria-label={`${p.name} allocation`}
                            onChange={(ev) => change(l, (x) => ({ ...x, projects: x.projects.map((y) => (y.projectId === p.projectId ? { ...y, allocation: Number(ev.target.value) } : y)) }))}
                          />
                          %
                          <button type="button" aria-label="Remove" onClick={() => change(l, (x) => ({ ...x, projects: x.projects.filter((y) => y.projectId !== p.projectId) }))}>
                            ×
                          </button>
                        </span>
                      ))}
                      {total > 100 && <span className="rl-over">{total}%</span>}
                      <AddSelect
                        label="+ project"
                        options={(projects.data ?? []).filter((p) => !e.projects.some((x) => x.projectId === p.id)).map((p) => [p.id, p.code ? `${p.name} · ${p.code}` : p.name] as [string, string])}
                        onPick={(v) => change(l, (x) => ({ ...x, projects: [...x.projects, { projectId: v, name: projects.data?.find((p) => p.id === v)?.name ?? '', allocation: Math.max(0, 100 - total) || 20, role: 'CONTRIBUTOR' }] }))}
                      />
                    </span>
                    <select className="input sm" value={e.managerId} onChange={(ev) => change(l, (x) => ({ ...x, managerId: ev.target.value }))} aria-label="Reports to">
                      <option value="">No manager</option>
                      {options(people.data ?? [], l.employeeId).map(([id, n]) => (
                        <option key={id} value={id}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <select className="input sm" value={e.dottedManagerId} onChange={(ev) => change(l, (x) => ({ ...x, dottedManagerId: ev.target.value }))} aria-label="Dotted line">
                      <option value="">None</option>
                      {options(people.data ?? [], l.employeeId).map(([id, n]) => (
                        <option key={id} value={id}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <span className="ell">{l.position ?? '—'}</span>
                    <span className="ell">{l.type ?? '—'}</span>
                    <span className="num">{l.reports}</span>
                  </div>
                );
              })}
              {rows.length === 0 && <div className="lv-empty">No employees match your search</div>}
            </div>
          </div>
          <Pager page={page} size={size} total={list.data.total} onPage={setPage} onSize={setSize} sizes={[20, 50, 100]} noun="people" />
        </>
      )}
    </>
  );
}

function AddSelect({ label, options, onPick }: { label: string; options: [string, string][]; onPick: (v: string) => void }) {
  if (!options.length) return null;
  return (
    <select className="rl-add" value="" onChange={(e) => e.target.value && onPick(e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
