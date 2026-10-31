import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/icons';
import { BlockLoader } from '../components/Splash';
import { errorText, fieldErrors } from '../lib/http';
import { PermissionsNotice } from '../onboarding/PermissionsNotice';
import { leaveApi, type Ledger } from './api';
import { Field, Modal, Seg, TypeChip, fmtDate, inr } from './ui';

/** One person's leave history: the year's balance summary, every year at a glance, and each transaction. HR can adjust and encash. */
export function LedgerTab({ person, setPerson, year, setYear, encash }: { person: string | null; setPerson: (id: string) => void; year: number; setYear: (y: number) => void; encash: (id: string) => void }) {
  const { user } = useAuth();
  const id = person ?? user?.employeeId ?? '';
  const qc = useQueryClient();
  const [pick, setPick] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [adj, setAdj] = useState(false);
  const q = useQuery({ queryKey: ['leave', 'ledger', id, year], queryFn: () => leaveApi.ledger(id, year), enabled: !!id });
  const l = q.data;
  useEffect(() => setTypes([]), [id, year]);
  const p = l?.person;
  const tone = p?.department ? { fg: `var(--dc${p.department.color}-fg)`, bg: `var(--dc${p.department.color}-bg)` } : undefined;
  const tx = (l?.transactions ?? []).filter((t) => !types.length || types.includes(t.code));

  const csv = () => {
    if (!l) return;
    const rows = [['Date', 'Type', 'Entry', 'Note', 'Days']];
    for (const t of l.transactions) rows.push([t.at.slice(0, 10), t.code, t.label, t.note ?? '', String(t.days)]);
    const text = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `leave-${p?.code ?? 'person'}-${year}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lv-stack">
      <PermissionsNotice errors={[q.error]} />
      {(l?.canManage || pick) && (
        <div className="lv-bar">
          <PeoplePicker open={pick} setOpen={setPick} current={p} onPick={(pid) => (setPerson(pid), setPick(false))} />
        </div>
      )}
      {q.isLoading && <BlockLoader page label="Loading leave history…" />}
      {l && p && (
        <>
          <div className="lv-ledger-head">
            <Avatar url={p.photoUrl} initials={p.initials} size={44} tone={tone} />
            <span className="lv-two" style={{ flex: 1 }}>
              <span className="lv-name-row">
                <b style={{ fontSize: 15 }}>{p.name}</b>
                {p.exitDate && <span className="pill no-dot pill-muted">Exited {fmtDate(p.exitDate)}</span>}
              </span>
              <span>
                {[p.code, p.title, p.department?.name].filter(Boolean).join(' · ')} · joined {fmtDate(p.joined)} · encash rate {Number(l.rate) ? `${inr(l.rate)}/day` : 'no CTC on file'}
              </span>
            </span>
            <div className="row-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={csv}>
                {Icon.download} Export CSV
              </button>
              {l.canManage && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdj(true)}>
                    Adjust balance
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => encash(p.id)}>
                    Encash
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="lv-years">
            {l.overview.map((o) => (
              <button key={o.year} type="button" aria-pressed={o.year === year} onClick={() => setYear(o.year)}>
                <b>{o.year}</b>
                <small>
                  {o.used} used{o.closed ? ' · closed' : ''}
                </small>
              </button>
            ))}
          </div>
          <div className="lv-card">
            <div className="lv-card-head">
              <span>
                Balance summary · {year}
                {l.closed ? ' · closed' : ' · open'}
              </span>
            </div>
            <div className="lv-tbl flat">
              <div style={{ minWidth: 720 }}>
                <div className="lv-head" style={{ gridTemplateColumns: LCOLS }}>
                  {['Leave type', 'Opening', 'Credited', 'Used', 'Adjusted', 'Encashed', 'Lapsed', 'Closing', 'Carry fwd'].map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
                {l.rows.map((r) => (
                  <div key={r.code} className="lv-row" style={{ gridTemplateColumns: LCOLS }}>
                    <span className="lv-typecell">
                      <TypeChip code={r.code} color={r.color} />
                      <span className="ell">{r.name}</span>
                    </span>
                    <span className="num">{r.opening}</span>
                    <span className="num">{r.credited}</span>
                    <span className="num">{r.used}</span>
                    <span className="num">{Number(r.adjusted) > 0 ? `+${r.adjusted}` : r.adjusted}</span>
                    <span className="num">{r.encashed}</span>
                    <span className="num">{r.lapsed}</span>
                    <span className="num">
                      <b>{r.closing}</b>
                    </span>
                    <span className="num">{r.carried}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lv-ledger-grid">
            <div className="lv-card">
              <div className="lv-card-head">
                <span>All years</span>
              </div>
              <div className="lv-head" style={{ gridTemplateColumns: YCOLS }}>
                {['Year', 'Used', 'Encashed', 'Lapsed', 'EL bal.', ''].map((h, i) => (
                  <span key={i}>{h}</span>
                ))}
              </div>
              {l.overview.map((o) => (
                <button key={o.year} type="button" className={`lv-row click${o.year === year ? ' on' : ''}`} style={{ gridTemplateColumns: YCOLS }} onClick={() => setYear(o.year)}>
                  <b>{o.year}</b>
                  <span className="num">{o.used}</span>
                  <span className="num">{o.encashed}</span>
                  <span className="num">{o.lapsed}</span>
                  <span className="num">{o.el ?? '—'}</span>
                  <span className={`pill no-dot ${o.closed ? 'pill-muted' : 'pill-ok'}`}>{o.closed ? 'Closed' : 'Open'}</span>
                </button>
              ))}
            </div>
            <div className="lv-card">
              <div className="lv-card-head">
                <span>Transactions</span>
                <div className="lv-chips">
                  {l.rows.map((r) => {
                    const on = types.includes(r.code);
                    return (
                      <button key={r.code} type="button" className={`lv-fchip${on ? ' on' : ''}`} onClick={() => setTypes(on ? types.filter((x) => x !== r.code) : [...types, r.code])}>
                        {r.code}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="lv-tx">
                {tx.map((t, i) => (
                  <div key={i} className="lv-row" style={{ gridTemplateColumns: '88px 40px minmax(0,1fr) 56px' }}>
                    <span className="muted num">{fmtDate(t.at)}</span>
                    <TypeChip code={t.code} color={t.color} />
                    <span className="lv-two">
                      <b style={{ fontWeight: 500 }}>{t.label}</b>
                      <span>{t.note ?? ''}</span>
                    </span>
                    <span className="num" style={{ color: Number(t.days) < 0 ? 'var(--danger-fg)' : Number(t.days) > 0 ? 'var(--success-fg)' : undefined, textAlign: 'right' }}>
                      {Number(t.days) > 0 ? `+${t.days}` : t.days}
                    </span>
                  </div>
                ))}
                {tx.length === 0 && <div className="lv-empty sm">No transactions</div>}
              </div>
            </div>
          </div>
          {adj && <AdjustModal l={l} onClose={() => setAdj(false)} onSaved={(n) => (qc.setQueryData(['leave', 'ledger', id, year], n), qc.invalidateQueries({ queryKey: ['leave', 'balances'] }), setAdj(false))} />}
        </>
      )}
    </div>
  );
}

const LCOLS = 'minmax(110px,1.4fr) repeat(8,minmax(46px,1fr))';
const YCOLS = '60px repeat(4,minmax(0,1fr)) 64px';

function PeoplePicker({ open, setOpen, current, onPick }: { open: boolean; setOpen: (v: boolean) => void; current?: Ledger['person']; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [exited, setExited] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open, setOpen]);
  const people = useQuery({ queryKey: ['leave', 'ledger-people', qd, exited], queryFn: () => leaveApi.ledgerPeople(qd, exited), enabled: open, staleTime: 60_000 });
  return (
    <div className="lv-picker" ref={ref}>
      <button type="button" className="lv-picker-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {current && <Avatar url={current.photoUrl} initials={current.initials} size={24} />}
        <b>{current?.name ?? 'Choose a person'}</b>
        <span>Change person</span>
      </button>
      {open && (
        <div className="lv-picker-pop">
          <input className="input sm" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="search people…" />
          <label className="lv-inline sm">
            <button type="button" className="switch" role="switch" aria-checked={exited} onClick={() => setExited(!exited)} />
            Include people who have left
          </label>
          <div className="lv-picker-list">
            {people.isLoading && <BlockLoader height={80} size={22} label="Searching…" />}
            {people.data?.map((p) => (
              <button key={p.id} type="button" onClick={() => onPick(p.id)}>
                <Avatar url={p.photoUrl} initials={p.initials} size={26} />
                <span className="lv-two">
                  <b>{p.name}</b>
                  <span>{p.exitDate ? `Exited ${fmtDate(p.exitDate)}` : [p.code, p.department?.name].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            ))}
            {people.data?.length === 0 && <span className="lv-empty sm">No one found</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function AdjustModal({ l, onClose, onSaved }: { l: Ledger; onClose: () => void; onSaved: (l: Ledger) => void }) {
  const [code, setCode] = useState(l.rows[0]?.code ?? '');
  const [dir, setDir] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const save = useMutation({
    meta: { busy: 'Saving adjustment…' },
    mutationFn: () => leaveApi.adjust(l.person.id, { typeCode: code, year: l.year, direction: dir, days, reason }),
    onSuccess: onSaved,
  });
  const fe = fieldErrors(save.error);
  return (
    <Modal
      title="Adjust leave balance"
      sub={`${l.person.name} · ${l.year} · recorded in the audit trail`}
      onClose={onClose}
      width={460}
      foot={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => save.mutate()}>
            Save adjustment
          </button>
        </>
      }
    >
      {save.isError && !Object.keys(fe).length && <Alert>{errorText(save.error)}</Alert>}
      <Field label="Leave type">
        <select className="input sm" value={code} onChange={(e) => setCode(e.target.value)}>
          {l.rows.map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} · {r.name} ({r.available} available)
            </option>
          ))}
        </select>
      </Field>
      <div className="lv-two-col" style={{ alignItems: 'end' }}>
        <div className="lv-field">
          <span>Direction</span>
          <Seg
            value={dir}
            onChange={setDir}
            options={[
              ['CREDIT', 'Add'],
              ['DEBIT', 'Deduct'],
            ]}
          />
        </div>
        <Field label="Days" error={fe.days}>
          <input className="input sm" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 1.5" />
        </Field>
      </div>
      <Field label="Reason" error={fe.reason}>
        <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {l.closed && <span className="lv-warn">This changes a closed year · carry forward into later years is recalculated.</span>}
    </Modal>
  );
}
