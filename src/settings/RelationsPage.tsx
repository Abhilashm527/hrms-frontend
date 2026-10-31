import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors, get, post } from '../lib/http';
import { Kpi, Pager, Seg, fmtDate } from '../leave/ui';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { usePeople } from './OrgListsPages';
import { SettingsHead } from './SettingsLayout';

type Rel = {
  id: string;
  type: 'DOTTED' | 'MENTOR';
  typeLabel: string;
  employee: { id: string; name: string; title?: string };
  related: { id: string; name: string; title?: string };
  fromDate: string;
  toDate?: string | null;
  status: string;
  note?: string | null;
  version: number;
};
const COLS = 'minmax(200px,1.2fr) 110px minmax(200px,1.2fr) minmax(180px,1fr) 100px 80px';
const ini = (n: string) => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);

/** Configuration → Dotted lines &amp; mentors: secondary reporting lines and mentoring, with start and end dates. Direct managers live in Reporting lines. */
export function RelationsPage() {
  const qc = useQueryClient();
  const [type, setType] = useState<'ALL' | 'DOTTED' | 'MENTOR' | 'ENDED'>('ALL');
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => (setQd(q.trim()), setPage(0)), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [type]);
  const params = new URLSearchParams({ page: String(page), size: '20' });
  if (type === 'DOTTED' || type === 'MENTOR') params.set('type', type);
  if (type === 'ENDED') params.set('status', 'ENDED');
  if (qd) params.set('q', qd);
  const list = useQuery({ queryKey: ['settings', 'relations', params.toString()], queryFn: () => get<{ items: Rel[]; total: number }>(`/relations?${params}`), placeholderData: keepPreviousData });
  const summary = useQuery({ queryKey: ['settings', 'relations-summary'], queryFn: () => get<{ directLines: number; dotted: number; mentors: number; ended: number }>('/relations/summary') });
  const refresh = () => (qc.invalidateQueries({ queryKey: ['settings', 'relations'] }), qc.invalidateQueries({ queryKey: ['settings', 'relations-summary'] }), qc.invalidateQueries({ queryKey: ['settings', 'reporting-lines'] }));
  const end = useMutation({
    meta: { busy: 'Ending relationship…' },
    mutationFn: (r: Rel) => post<Rel>(`/relations/${r.id}/end`, { endDate: today() }),
    onSuccess: () => (refresh(), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const s = summary.data;

  return (
    <>
      <SettingsHead title="Dotted lines & mentors" sub="Secondary reporting lines and mentoring. They show on the org chart and profiles; they don't approve anything." />
      <PermissionsNotice errors={[list.error]} />
      {s && (
        <div className="lv-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Kpi label="Direct lines" value={s.directLines} />
          <Kpi label="Dotted lines" value={s.dotted} />
          <Kpi label="Mentors" value={s.mentors} />
          <Kpi label="Ended" value={s.ended} />
        </div>
      )}
      <div className="lv-bar">
        <Seg
          value={type}
          onChange={setType}
          options={[
            ['ALL', 'All'],
            ['DOTTED', 'Dotted lines'],
            ['MENTOR', 'Mentors'],
            ['ENDED', 'Ended'],
          ]}
        />
        <label className="dfx-search">
          {Icon.search}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search people…" />
        </label>
        <span className="field-hint">
          Direct managers are set in <Link to="/configuration/reporting-lines">Reporting lines</Link>
        </span>
        <span className="grow" />
        {!adding && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            {Icon.plus} Add relationship
          </button>
        )}
      </div>
      {adding && <AddForm onClose={() => setAdding(false)} onDone={() => (setAdding(false), refresh())} />}
      {err && <Alert>{err}</Alert>}
      {list.isLoading && <BlockLoader height={240} label="Loading relationships…" />}
      {list.data && (
        <>
          <div className="lv-tbl">
            <div style={{ minWidth: 900, opacity: list.isPlaceholderData ? 0.6 : 1 }}>
              <div className="lv-head" style={{ gridTemplateColumns: COLS }}>
                {['Employee', 'Type', 'Reports to / mentored by', 'Period', 'Status', ''].map((h, i) => (
                  <span key={i}>{h}</span>
                ))}
              </div>
              {list.data.items.map((r) => (
                <div key={r.id} className="lv-row" style={{ gridTemplateColumns: COLS }}>
                  <PersonCell p={r.employee} />
                  <span>
                    <span className={`pill no-dot ${r.type === 'DOTTED' ? 'pill-info' : 'pill-brand'}`}>{r.typeLabel}</span>
                  </span>
                  <PersonCell p={r.related} />
                  <span className="lv-two">
                    <b style={{ fontWeight: 500 }}>
                      {fmtDate(r.fromDate)} – {r.toDate ? fmtDate(r.toDate) : 'ongoing'}
                    </b>
                    <span>{r.note ?? ''}</span>
                  </span>
                  <span>
                    <span className={`pill no-dot ${r.status === 'ACTIVE' ? 'pill-ok' : r.status === 'ENDED' ? 'pill-muted' : 'pill-warn'}`}>{r.status.toLowerCase()}</span>
                  </span>
                  <span>
                    {r.status !== 'ENDED' && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirm(`End ${r.employee.name}'s ${r.typeLabel.toLowerCase()} with ${r.related.name} today? It stays in their history.`) && end.mutate(r)}>
                        End
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {list.data.items.length === 0 && <div className="lv-empty">No relationships match</div>}
            </div>
          </div>
          <Pager page={page} size={20} total={list.data.total} onPage={setPage} noun="relationships" />
        </>
      )}
    </>
  );
}

function PersonCell({ p }: { p: { name: string; title?: string } }) {
  return (
    <span className="lv-who">
      <span className="avatar-ini" style={{ width: 28, height: 28, fontSize: 10.5 }}>
        {ini(p.name)}
      </span>
      <span className="lv-two">
        <b>{p.name}</b>
        <span>{p.title ?? ''}</span>
      </span>
    </span>
  );
}

function AddForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const people = usePeople();
  const [f, setF] = useState({ type: 'DOTTED', employeeId: '', relatedId: '', fromDate: today(), toDate: '', note: '' });
  const save = useMutation({ meta: { busy: 'Adding relationship…' }, mutationFn: () => post('/relations', { ...f, toDate: f.toDate || null, note: f.note || null }), onSuccess: onDone });
  const fe = fieldErrors(save.error);
  const opts = people.data ?? [];
  return (
    <div className="lv-card rel-form">
      {save.isError && !Object.keys(fe).length && <Alert>{errorText(save.error)}</Alert>}
      <div className="rel-grid">
        <label className="lv-field">
          <span>Type</span>
          <select className="input sm" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="DOTTED">Dotted line</option>
            <option value="MENTOR">Mentor</option>
          </select>
        </label>
        <label className="lv-field">
          <span>Employee</span>
          <select className="input sm" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} aria-invalid={!!fe.employeeId}>
            <option value="">Choose…</option>
            {opts.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
          {fe.employeeId && <small className="err">{fe.employeeId}</small>}
        </label>
        <label className="lv-field">
          <span>{f.type === 'MENTOR' ? 'Mentored by' : 'Reports to (dotted)'}</span>
          <select className="input sm" value={f.relatedId} onChange={(e) => setF({ ...f, relatedId: e.target.value })} aria-invalid={!!fe.relatedId}>
            <option value="">Choose…</option>
            {opts
              .filter(([id]) => id !== f.employeeId)
              .map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
          </select>
          {fe.relatedId && <small className="err">{fe.relatedId}</small>}
        </label>
        <label className="lv-field">
          <span>Starts</span>
          <input type="date" className="input sm" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} />
          {fe.fromDate && <small className="err">{fe.fromDate}</small>}
        </label>
        <label className="lv-field">
          <span>Ends (optional)</span>
          <input type="date" className="input sm" min={f.fromDate} value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} />
          {fe.toDate && <small className="err">{fe.toDate}</small>}
        </label>
        <label className="lv-field">
          <span>Note</span>
          <input className="input sm" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Pre-sales" />
        </label>
      </div>
      <div className="rel-foot">
        <span className="field-hint">Dotted lines show on the org chart and profile; they don't approve anything. Mentors have no authority.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!f.employeeId || !f.relatedId} onClick={() => save.mutate()}>
          Add
        </button>
      </div>
    </div>
  );
}
