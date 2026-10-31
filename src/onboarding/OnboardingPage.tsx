import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Icon } from '../components/icons';
import { ApiError } from '../lib/http';
import { date } from '../lib/format';
import { onboardingApi, type HireRow, type HireStatus } from './api';
import { HireDrawer } from './HireDrawer';
import { NewHireDrawer } from './NewHireDrawer';
import { PermissionsNotice } from './PermissionsNotice';
import { STAGE_LABEL, STATUS, StatusPill, initials, joinWhen, useDepartments, useLocations } from './shared';
import { BlockLoader } from '../components/Splash';

const PAGE_SIZES = [10, 25, 50];

export function OnboardingPage() {
  const { hireId } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [creating, setCreating] = useState(() => sp.get('new') === '1');
  useEffect(() => {
    if (sp.get('new')) setSp((p) => (p.delete('new'), p), { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const status = sp.get('status') ?? '';
  const dept = sp.get('dept') ?? '';
  const loc = sp.get('loc') ?? '';
  const windowKey = sp.get('window') ?? '';
  const page = Number(sp.get('page') ?? 0);
  const size = Number(sp.get('size') ?? 10);

  const setParam = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        if (k !== 'page') n.delete('page');
        return n;
      },
      { replace: true },
    );

  // Search as you type, without a request per key.
  useEffect(() => {
    const t = setTimeout(() => q !== (sp.get('q') ?? '') && setParam('q', q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (sp.get('q')) params.set('q', sp.get('q')!);
  if (status) params.set('status', status);
  if (dept) params.set('departmentId', dept);
  if (loc) params.set('locationId', loc);
  if (windowKey) params.set('window', windowKey);

  const list = useQuery({ queryKey: ['onboarding', 'hires', params.toString()], queryFn: () => onboardingApi.list(params), placeholderData: keepPreviousData });
  const depts = useDepartments();
  const locs = useLocations();
  const c = list.data?.counts;
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));

  if (list.error instanceof ApiError && list.error.status === 403) {
    return <div className="card card-empty" style={{ maxWidth: 520, margin: '40px auto' }}>You don't have access to onboarding.</div>;
  }

  const tile = (key: string, label: string, dot: string, val?: number, sub?: string, onClick?: () => void) => (
    <button type="button" className="stat-tile" aria-pressed={key !== '' && (status === key || windowKey === key)} onClick={onClick}>
      <span className="lbl">
        <i style={{ background: dot }} />
        {label}
      </span>
      <span className="val">{val ?? '—'}</span>
      <span className="sub">{sub ?? ' '}</span>
    </button>
  );

  return (
    <>
      <div className="stat-tiles">
        {tile('', 'In pipeline', 'var(--brand)', c?.inPipeline, c && `${c.joining30} joining in 30 days`, () => setSp({}, { replace: true }))}
        {tile('ATTENTION', 'Needs HR attention', 'var(--warning)', c?.attention, c && `${c.docsToReview ?? 0} documents to review`, () => setParam('status', status === 'ATTENTION' ? '' : 'ATTENTION'))}
        {tile('7', 'Joining this week', 'var(--danger)', c?.joiningWeek, c && `${c.joiningWeekNotReady} not ready yet`, () => setParam('window', windowKey === '7' ? '' : '7'))}
        {tile('DRAFT', 'Drafts', 'var(--fg-3)', c?.drafts, 'Invite not sent', () => setParam('status', status === 'DRAFT' ? '' : 'DRAFT'))}
      </div>

      <PermissionsNotice errors={[depts.error, locs.error]} />

      <div className="toolbar">
        <label className="search-in">
          {Icon.search}
          <input placeholder="search name, role, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="sel" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="ATTENTION">Needs HR attention</option>
          {(Object.keys(STATUS) as HireStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
              {c ? ` · ${c.byStatus?.[s] ?? 0}` : ''}
            </option>
          ))}
        </select>
        <select className="sel" value={dept} onChange={(e) => setParam('dept', e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className="sel" value={loc} onChange={(e) => setParam('loc', e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {locs.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className="sel" value={windowKey} onChange={(e) => setParam('window', e.target.value)} aria-label="Joining date">
          <option value="">Any joining date</option>
          <option value="7">Joining in 7 days</option>
          <option value="14">Joining in 14 days</option>
          <option value="30">Joining in 30 days</option>
          <option value="LATER">Joining later</option>
          <option value="JOINED">Already joined</option>
        </select>
        <span className="grow" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          {Icon.userPlus} New hire
        </button>
      </div>

      <div className="tbl-wrap" style={{ opacity: list.isPlaceholderData ? 0.6 : 1 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>New hire</th>
              <th>Department</th>
              <th>Location</th>
              <th>Joining</th>
              <th>Progress</th>
              <th>Documents</th>
              <th>Work account</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr className="loading-row">
                <td colSpan={8}>
                  <BlockLoader height={220} label="Loading new hires…" />
                </td>
              </tr>
            )}
            {list.data?.items.map((h) => <Row key={h.id} h={h} onOpen={() => nav(`/onboarding/${h.id}${location.search}`)} />)}
            {list.data && list.data.items.length === 0 && (
              <tr>
                <td colSpan={8} className="card-empty" style={{ cursor: 'default' }}>
                  {sp.toString() ? 'No hires match these filters' : 'No one in onboarding yet. Add a new hire to start.'}
                </td>
              </tr>
            )}
            {list.isError && (
              <tr>
                <td colSpan={8} className="card-empty">
                  {list.error.message}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="tbl-foot">
          <span>{total === 0 ? '0 hires' : `${page * size + 1}–${Math.min(total, (page + 1) * size)} of ${total}`}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Rows per page
            <select className="sel" value={size} onChange={(e) => setParam('size', e.target.value)}>
              {PAGE_SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="button" className="dfx-icon-btn" disabled={page === 0} onClick={() => setParam('page', String(page - 1))} title="Previous page">
              {Icon.chevL}
            </button>
            <span>
              {page + 1} / {pages}
            </span>
            <button type="button" className="dfx-icon-btn" disabled={page + 1 >= pages} onClick={() => setParam('page', String(page + 1))} title="Next page">
              {Icon.chevR}
            </button>
          </span>
        </div>
      </div>

      {creating && (
        <NewHireDrawer
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            nav(`/onboarding/${id}`);
          }}
        />
      )}
      {hireId && <HireDrawer id={hireId} onClose={() => nav(`/onboarding${location.search}`)} />}
    </>
  );
}

function Row({ h, onOpen }: { h: HireRow; onOpen: () => void }) {
  const joined = h.status === 'JOINED';
  const done = h.stages.filter(Boolean).length;
  const review = h.docs?.submitted ?? 0;
  return (
    <tr onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <td>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ini">{initials(h.first, h.last)}</span>
          <span className="two">
            <b style={{ fontWeight: 500 }}>{h.name}</b>
            <small>
              {h.title} · {h.employmentType.name}
            </small>
          </span>
        </span>
      </td>
      <td>{h.department.name}</td>
      <td>{h.location.name}</td>
      <td>
        <span className="two">
          <span>{date(h.doj)}</span>
          <small style={{ color: !joined && h.daysToJoin <= 3 ? 'var(--danger)' : undefined }}>{joinWhen(h.daysToJoin, joined)}</small>
        </span>
      </td>
      <td>
        <span className="two" style={{ gap: 4 }}>
          <span className="bars">
            {h.stages.map((s, i) => (
              <i key={i} className={s ? 'on' : ''} />
            ))}
          </span>
          <small>{done === h.stages.length || !h.nextStage ? 'Complete' : `Next: ${STAGE_LABEL[h.nextStage]}`}</small>
        </span>
      </td>
      <td>
        {h.docs?.verified ?? 0} / {h.docs?.required ?? 0}
        {review > 0 && (
          <span className="dfx-count red" style={{ marginLeft: 6 }} title={`${review} to review`}>
            {review}
          </span>
        )}
      </td>
      <td>
        <span className={`pill ${h.m365 === 'ACTIVE' ? 'pill-ok' : h.m365 === 'FAILED' ? 'pill-danger' : h.m365 === 'RUNNING' ? 'pill-info' : 'pill-muted'}`}>{h.m365 === 'NONE' ? 'none' : h.m365.toLowerCase()}</span>
      </td>
      <td>
        <StatusPill status={h.status} />
      </td>
    </tr>
  );
}
