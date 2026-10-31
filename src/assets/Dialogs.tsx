import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { errorText } from '../lib/http';
import { Modal } from '../leave/ui';
import { PersonPicker } from '../onboarding/shared';
import { type AReq, assetApi, type Mode, rupees, saveBlob } from './api';
import { Field } from './ui';

const today = () => new Date().toISOString().slice(0, 10);
type Done = (msg: string) => void;

/** Runs one call, refreshes every asset query and reports back. */
function useAct(onDone: Done) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    meta: { busy: (v: unknown) => (v as { busy: string }).busy },
    mutationFn: (v: { run: () => Promise<unknown>; busy: string; done: string }) => v.run(),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      onDone(v.done);
    },
    onError: (e) => setErr(errorText(e)),
  });
  return { run: m.mutate, busy: m.isPending, err };
}

function Foot({ onClose, label, onOk, busy, danger }: { onClose: () => void; label: string; onOk: () => void; busy: boolean; danger?: boolean }) {
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={onOk}>
        {label}
      </button>
    </>
  );
}

export function AssignDialog({ asset, onClose, onDone }: { asset: { id: string; tag: string; model: string }; onClose: () => void; onDone: Done }) {
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [on, setOn] = useState(today());
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const a = useAct(onDone);
  return (
    <Modal
      width={460}
      title={`Assign ${asset.tag}`}
      sub={asset.model}
      onClose={onClose}
      foot={
        <Foot
          onClose={onClose}
          label="Assign"
          busy={a.busy}
          onOk={() => {
            setTried(true);
            if (!who) return;
            a.run({ run: () => assetApi.hwAct(asset.id, 'assign', { employeeId: who.id, assignedOn: on, note: note || undefined }), busy: 'Assigning…', done: `${asset.tag} assigned to ${who.name}` });
          }}
        />
      }
    >
      {a.err && <Alert>{a.err}</Alert>}
      <Field label="Employee" required error={tried && !who ? 'Pick who gets it' : undefined}>
        <PersonPicker value={who as never} onChange={(p) => setWho(p ? { id: p.id, name: p.name } : null)} invalid={tried && !who} />
      </Field>
      <Field label="Handed over on">
        <input className="input sm" type="date" max={today()} value={on} onChange={(e) => setOn(e.target.value)} />
      </Field>
      <Field label="Note">
        <input className="input sm" value={note} placeholder="Optional, e.g. charger and bag included" onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function RecoverDialog({ asset, holder, onClose, onDone }: { asset: { id: string; tag: string }; holder?: string; onClose: () => void; onDone: Done }) {
  const [on, setOn] = useState(today());
  const [cond, setCond] = useState<'GOOD' | 'DAMAGED' | 'MISSING'>('GOOD');
  const [note, setNote] = useState('');
  const a = useAct(onDone);
  const next = { GOOD: 'It goes back to Available.', DAMAGED: 'It goes to In repair.', MISSING: 'It is marked lost (Not in use).' }[cond];
  return (
    <Modal
      width={460}
      title={`Recover ${asset.tag}`}
      sub={holder ? `From ${holder}` : undefined}
      onClose={onClose}
      foot={<Foot onClose={onClose} label="Recover" busy={a.busy} onOk={() => a.run({ run: () => assetApi.hwAct(asset.id, 'recover', { returnedOn: on, condition: cond, note: note || undefined }), busy: 'Recovering…', done: `${asset.tag} recovered` })} />}
    >
      {a.err && <Alert>{a.err}</Alert>}
      <Field label="Returned on">
        <input className="input sm" type="date" max={today()} value={on} onChange={(e) => setOn(e.target.value)} />
      </Field>
      <div className="lv-field">
        <span>Condition</span>
        <span className="lv-seg" role="group">
          {(
            [
              ['GOOD', 'Good'],
              ['DAMAGED', 'Damaged'],
              ['MISSING', 'Missing'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={cond === k} onClick={() => setCond(k)}>
              {l}
            </button>
          ))}
        </span>
        <small>{next}</small>
      </div>
      <Field label="Note">
        <input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function RepairDialog({ asset, assigned, onClose, onDone }: { asset: { id: string; tag: string }; assigned: boolean; onClose: () => void; onDone: Done }) {
  const [vendor, setVendor] = useState('');
  const [back, setBack] = useState('');
  const [note, setNote] = useState('');
  const [recover, setRecover] = useState(false);
  const a = useAct(onDone);
  return (
    <Modal
      width={460}
      title={`Send ${asset.tag} for repair`}
      onClose={onClose}
      foot={
        <Foot
          onClose={onClose}
          label="Send for repair"
          busy={a.busy}
          onOk={() => a.run({ run: () => assetApi.hwAct(asset.id, 'repair', { vendor: vendor || undefined, expectedBack: back || undefined, note: note || undefined, recover }), busy: 'Sending for repair…', done: `${asset.tag} sent for repair` })}
        />
      }
    >
      {a.err && <Alert>{a.err}</Alert>}
      <Field label="Repair vendor">
        <input className="input sm" value={vendor} placeholder="e.g. Dell service centre" onChange={(e) => setVendor(e.target.value)} />
      </Field>
      <Field label="Expected back">
        <input className="input sm" type="date" min={today()} value={back} onChange={(e) => setBack(e.target.value)} />
      </Field>
      <Field label="What's wrong">
        <textarea className="input sm" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {assigned && (
        <span className="cal-tg">
          <button type="button" className="switch" role="switch" aria-checked={recover} onClick={() => setRecover(!recover)} />
          Take it back from the employee (otherwise it stays assigned to them)
        </span>
      )}
    </Modal>
  );
}

export function RepairedDialog({ asset, onClose, onDone }: { asset: { id: string; tag: string }; onClose: () => void; onDone: Done }) {
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const a = useAct(onDone);
  return (
    <Modal
      width={420}
      title={`${asset.tag} is repaired`}
      onClose={onClose}
      foot={
        <Foot
          onClose={onClose}
          label="Mark repaired"
          busy={a.busy}
          onOk={() => a.run({ run: () => assetApi.hwAct(asset.id, 'repaired', { cost: cost ? Math.round(Number(cost) * 100) : undefined, note: note || undefined }), busy: 'Saving…', done: `${asset.tag} is back from repair` })}
        />
      }
    >
      {a.err && <Alert>{a.err}</Alert>}
      <Field label="Repair cost (₹)">
        <input className="input sm" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} />
      </Field>
      <Field label="Note">
        <input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

const REASONS: [string, string][] = [
  ['END_OF_LIFE', 'End of life'],
  ['LOST', 'Lost'],
  ['DAMAGED_BEYOND_REPAIR', 'Damaged beyond repair'],
  ['SOLD', 'Sold'],
  ['RETURNED_TO_CLIENT', 'Returned to client'],
  ['LEASE_ENDED', 'Lease ended'],
];
export function RetireDialog({ asset, onClose, onDone }: { asset: { id: string; tag: string }; onClose: () => void; onDone: Done }) {
  const [reason, setReason] = useState('END_OF_LIFE');
  const [on, setOn] = useState(today());
  const [note, setNote] = useState('');
  const a = useAct(onDone);
  return (
    <Modal
      width={440}
      title={`Retire ${asset.tag}?`}
      sub="A retired asset stays on record but can't be assigned again"
      onClose={onClose}
      foot={<Foot danger onClose={onClose} label="Retire" busy={a.busy} onOk={() => a.run({ run: () => assetApi.hwAct(asset.id, 'retire', { reason, retiredOn: on, note: note || undefined }), busy: 'Retiring…', done: `${asset.tag} retired` })} />}
    >
      {a.err && <Alert>{a.err}</Alert>}
      <Field label="Reason" required>
        <select className="input sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Retired on">
        <input className="input sm" type="date" max={today()} value={on} onChange={(e) => setOn(e.target.value)} />
      </Field>
      <Field label="Note">
        <input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function SeatDialog({ lic, mode, onClose, onDone }: { lic: { id: string; name: string; lid: string; free: number | null; seats: number | null; perSeat?: number; billing?: string }; mode: 'assign' | 'add'; onClose: () => void; onDone: Done }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [n, setN] = useState('1');
  const a = useAct(onDone);
  const cands = useQuery({ queryKey: ['assets', 'cands', q], queryFn: () => assetApi.swCandidates(q), enabled: mode === 'assign' });
  const ids = Object.keys(picked);
  const over = lic.free != null && ids.length > lic.free;
  return (
    <Modal
      width={480}
      title={mode === 'assign' ? `Assign ${lic.name} seats` : `Add seats to ${lic.name}`}
      sub={`${lic.lid}${lic.free != null ? ` · ${lic.free} of ${lic.seats} free` : ' · site-wide'}`}
      onClose={onClose}
      foot={
        <Foot
          onClose={onClose}
          label={mode === 'assign' ? `Assign${ids.length ? ` ${ids.length}` : ''}` : 'Add seats'}
          busy={a.busy}
          onOk={() =>
            mode === 'assign'
              ? ids.length && a.run({ run: () => assetApi.swAssign(lic.id, ids), busy: 'Assigning seats…', done: `${ids.length} seat${ids.length > 1 ? 's' : ''} assigned` })
              : Number(n) > 0 && a.run({ run: () => assetApi.swAddSeats(lic.id, Number(n)), busy: 'Adding seats…', done: `${n} seat${Number(n) > 1 ? 's' : ''} added to ${lic.name}` })
          }
        />
      }
    >
      {a.err && <Alert>{a.err}</Alert>}
      {mode === 'assign' ? (
        <>
          {over && <div className="cal-warn">Only {lic.free} free — add seats first, or pick fewer people.</div>}
          <label className="dfx-search">
            {Icon.search}
            <input placeholder="search employees…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="as-pick">
            {cands.data?.map((c) => (
              <button key={c.id} type="button" className={picked[c.id] ? 'on' : ''} onClick={() => setPicked((p) => (p[c.id] ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== c.id)) : { ...p, [c.id]: c.name }))}>
                <span className="chk">{picked[c.id] && Icon.check}</span>
                <span>
                  <b>{c.name}</b>
                  <small>
                    {[c.code, c.department].filter(Boolean).join(' · ')}
                    {c.suggested ? ' · suggested' : ''}
                  </small>
                </span>
              </button>
            ))}
            {cands.data?.length === 0 && <div className="as-empty sm">No one found</div>}
          </div>
        </>
      ) : (
        <Field label="Seats to add" hint={lic.perSeat ? `+${rupees(lic.perSeat * Number(n || 0))} per ${lic.billing === 'MONTHLY' || lic.billing === 'Monthly' ? 'month' : 'term'}` : undefined}>
          <input className="input sm" type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

export function DecideDialog({ req, approve, onClose, onDone }: { req: AReq; approve: boolean; onClose: () => void; onDone: Done }) {
  const [note, setNote] = useState('');
  const [fulfil, setFulfil] = useState('');
  const a = useAct(onDone);
  const hw = req.kind === 'HARDWARE';
  const stock = useQuery({ queryKey: ['assets', 'avail'], queryFn: assetApi.hwAvail, enabled: approve && hw });
  const options = hw ? (stock.data?.groups.find((g) => g.type.id === req.item.typeId)?.items ?? []) : [];
  return (
    <Modal
      width={480}
      title={`${approve ? 'Approve' : 'Reject'} ${req.requester.name.split(' ')[0]}’s request`}
      sub={`${req.item.name} · ${req.reason}`}
      onClose={onClose}
      foot={
        <Foot
          danger={!approve}
          onClose={onClose}
          label={approve ? (fulfil ? 'Approve and assign' : 'Approve') : 'Reject'}
          busy={a.busy}
          onOk={() => {
            if (!approve && !note.trim()) return;
            a.run(
              approve
                ? {
                    run: () => assetApi.approve(req.id, { note: note || undefined, fulfil: fulfil ? (hw ? { assetId: fulfil } : { licenseId: req.item.licenseId }) : undefined }),
                    busy: 'Approving…',
                    done: fulfil ? 'Approved and assigned' : 'Request approved',
                  }
                : { run: () => assetApi.reject(req.id, note), busy: 'Rejecting…', done: 'Request rejected' },
            );
          }}
        />
      }
    >
      {a.err && <Alert>{a.err}</Alert>}
      {approve && hw && (
        <Field label="Hand over now (optional)" hint={options.length ? 'Pick an item in stock to assign it straight away' : `No ${req.item.name.toLowerCase()} in stock — approve now and assign when one arrives`}>
          <select className="input sm" value={fulfil} onChange={(e) => setFulfil(e.target.value)} disabled={!options.length}>
            <option value="">Assign later</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.tag} · {o.model}
              </option>
            ))}
          </select>
        </Field>
      )}
      {approve && !hw && (
        <span className="cal-tg">
          <button type="button" className="switch" role="switch" aria-checked={!!fulfil} onClick={() => setFulfil(fulfil ? '' : 'seat')} />
          Assign a {req.item.name} seat now
        </span>
      )}
      <Field label={approve ? 'Note' : 'Reason'} required={!approve}>
        <textarea className="input sm" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function ImportDialog({ mode, onClose, onDone }: { mode: Mode; onClose: () => void; onDone: Done }) {
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<Awaited<ReturnType<typeof assetApi.importCsv>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const dry = useMutation({
    meta: { busy: 'Checking the file…' },
    mutationFn: (f: File) => assetApi.importCsv(mode, f, true),
    onSuccess: (r) => (setCheck(r), setErr(null)),
    onError: (e) => setErr(errorText(e)),
  });
  const run = useMutation({
    meta: { busy: 'Importing…' },
    mutationFn: () => assetApi.importCsv(mode, file!, false),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      if (r.errors.length) setCheck(r);
      else onDone(`${r.created ?? r.valid} ${mode === 'hardware' ? 'assets' : 'licenses'} imported`);
    },
    onError: (e) => setErr(errorText(e)),
  });
  return (
    <Modal
      width={540}
      title={`Import ${mode}`}
      sub="Upload a CSV in the template's format. Rows with problems are listed and skipped."
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => assetApi.template(mode).then((b) => saveBlob(b, `${mode}-import-template.csv`), (e) => setErr(errorText(e)))}>
            {Icon.download} Template
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!check || !check.valid || run.isPending} onClick={() => run.mutate()}>
            Import {check?.valid ? `${check.valid} row${check.valid > 1 ? 's' : ''}` : ''}
          </button>
        </>
      }
    >
      {err && <Alert>{err}</Alert>}
      <label className="rq-file">
        {Icon.plus}
        <span>{file ? file.name : 'Choose a CSV file'}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setCheck(null);
            if (f) dry.mutate(f);
          }}
        />
      </label>
      {check && (
        <div className="as-import">
          <b>
            {check.valid} of {check.rows} rows ready{check.created != null ? ` · ${check.created} imported` : ''}
          </b>
          {check.errors.slice(0, 30).map((x, i) => (
            <span key={i}>
              Row {x.row}
              {x.field ? ` · ${x.field}` : ''}: {x.message}
            </span>
          ))}
          {check.errors.length > 30 && <span>…and {check.errors.length - 30} more</span>}
        </div>
      )}
    </Modal>
  );
}

/** An approved request waiting for its item: assign one from stock (or a seat) to the requester, which fulfils it. */
export function HandOverDialog({ req, onClose, onDone }: { req: AReq; onClose: () => void; onDone: Done }) {
  const hw = req.kind === 'HARDWARE';
  const [pick, setPick] = useState('');
  const a = useAct(onDone);
  const stock = useQuery({ queryKey: ['assets', 'avail'], queryFn: assetApi.hwAvail, enabled: hw });
  const options = hw ? (stock.data?.groups.find((g) => g.type.id === req.item.typeId)?.items ?? []) : [];
  return (
    <Modal
      width={460}
      title={`Hand over to ${req.requester.name}`}
      sub={req.item.name}
      onClose={onClose}
      foot={
        <Foot
          onClose={onClose}
          label={hw ? 'Assign' : 'Assign seat'}
          busy={a.busy}
          onOk={() => {
            if (hw && !pick) return;
            a.run(
              hw
                ? { run: () => assetApi.hwAct(pick, 'assign', { employeeId: req.requester.id, requestId: req.id }), busy: 'Assigning…', done: `${req.item.name} handed over to ${req.requester.name}` }
                : { run: () => assetApi.swAssign(req.item.licenseId!, [req.requester.id]), busy: 'Assigning the seat…', done: `${req.item.name} seat assigned to ${req.requester.name}` },
            );
          }}
        />
      }
    >
      {a.err && <Alert>{a.err}</Alert>}
      {hw ? (
        <Field label="Item from stock" required hint={options.length ? undefined : `No ${req.item.name.toLowerCase()} in stock right now`}>
          <select className="input sm" value={pick} onChange={(e) => setPick(e.target.value)} disabled={!options.length}>
            <option value="">Pick one…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.tag} · {o.model}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="cal-p">A seat on {req.item.name} is assigned to {req.requester.name}, and the request is marked fulfilled.</p>
      )}
    </Modal>
  );
}
