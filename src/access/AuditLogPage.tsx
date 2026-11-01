import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { BlockLoader } from '../components/Splash';
import { errorText, get } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { SettingsHead } from '../settings/SettingsLayout';
import { accessApi, type AuditKind } from './api';

const CHIPS = ['All', 'Roles', 'Assignments', 'Permissions', 'Relationships', 'Settings'] as const;
/** Area badge colours, as in the UX. */
const KC: Record<AuditKind, [string, string]> = {
  Assignments: ['#1D4ED8', '#DBEAFE'],
  Roles: ['#6D28D9', '#EDE9FE'],
  Permissions: ['#B45309', '#FEF3C7'],
  Relationships: ['#0F766E', '#CCFBF1'],
  Settings: ['#475569', '#F1F5F9'],
};
const SIZE = 50;

const when = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
};

/** Every change to roles, assignments, permissions, relationships and org settings. */
export function AuditLogPage() {
  const [kind, setKind] = useState<(typeof CHIPS)[number]>('All');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => (setTerm(q.trim()), setPage(0)), 300);
    return () => clearTimeout(t);
  }, [q]);
  const log = useQuery({ queryKey: ['access', 'audit', kind, term, page], queryFn: () => accessApi.audit({ kind, q: term, page, size: SIZE }), placeholderData: keepPreviousData });
  // Only to warn that logging is off; anyone who can't read org settings just doesn't see the warning.
  const org = useQuery({ queryKey: ['settings', 'org'], queryFn: () => get<Record<string, unknown>>('/org/settings'), retry: false, staleTime: 60_000 });
  const off = org.data ? org.data.auditLog === false || org.data.auditPerm === false : false;

  const exportCsv = async () => {
    setErr(null);
    try {
      const b = await accessApi.auditCsv({ kind, q: term });
      const url = URL.createObjectURL(b);
      Object.assign(document.createElement('a'), { href: url, download: `access-audit-${new Date().toISOString().slice(0, 10)}.csv` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErr(errorText(e));
    }
  };

  const d = log.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / SIZE)) : 1;
  return (
    <>
      <SettingsHead title="Access audit log" sub="Every change to roles, assignments, permissions and org settings." />
      <PermissionsNotice errors={[log.error]} />
      {off && (
        <div className="au-off">
          Logging is off — new changes aren’t recorded. Turn it on in <Link to="/configuration/organization">Organization settings</Link>.
        </div>
      )}
      {err && <Alert>{err}</Alert>}
      <div className="au-bar">
        <div className="au-chips">
          {CHIPS.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={kind === c} onClick={() => (setKind(c), setPage(0))}>
              {c} · {d?.counts?.[c] ?? '…'}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <input className="input sm au-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search log…" aria-label="Search the log" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void exportCsv()} disabled={!d?.total}>
          Export
        </button>
      </div>
      {log.isLoading ? (
        <BlockLoader label="Loading the log…" height={240} />
      ) : log.isError ? null : (
        <div className="au-card">
          <div className="au-grid au-head">
            <span>When</span>
            <span>By</span>
            <span>Area</span>
            <span>Action</span>
            <span>Details</span>
          </div>
          {d?.items.length === 0 && <div className="au-empty">No entries match</div>}
          {d?.items.map((x) => (
            <div key={x.id} className="au-grid au-row">
              <span className="au-when">{when(x.at)}</span>
              <span className="au-by">{x.by}</span>
              <span>
                <span className="au-kind" style={{ color: KC[x.kind]?.[0], background: KC[x.kind]?.[1] }}>
                  {x.kind}
                </span>
              </span>
              <span className="au-act">
                <b>{x.act}</b>
                <span>{x.target}</span>
              </span>
              <span className="au-det">{x.det}</span>
            </div>
          ))}
        </div>
      )}
      {d && d.total > SIZE && (
        <div className="au-pager">
          <span>
            {page * SIZE + 1}–{Math.min(d.total, (page + 1) * SIZE)} of {d.total}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </>
  );
}
