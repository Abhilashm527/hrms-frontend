import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { Icon } from '../../components/icons';
import { say } from '../../lib/busy';
import { ApiError, errorText } from '../../lib/http';
import { LEVEL_STYLE, fieldsApi, type Area, type Field, type Level, type Meta, type Rule, type Section } from './api';
import { BlockLoader } from '../../components/Splash';

/**
 * Screens that render an area's fields. After any change here they are refetched, so the new form shows up at once.
 */
export function refreshUsers(qc: QueryClient, area: string) {
  qc.invalidateQueries({ queryKey: ['config', 'area', area] });
  qc.invalidateQueries({ queryKey: ['config', 'areas'] });
  if (area === 'employee_profile' || area === 'payroll' || area === 'performance') {
    qc.invalidateQueries({ queryKey: ['employees', 'profile'] });
    qc.invalidateQueries({ queryKey: ['portal'] });
  }
  if (area === 'onboarding') {
    qc.invalidateQueries({ queryKey: ['onboarding', 'hire-form'] });
    qc.invalidateQueries({ queryKey: ['onboarding', 'hire'] });
  }
}

// ------------------------------------------------------------------ fields view (design: one list card + field panel)

export function FieldsView({ area, meta }: { area: Area; meta: Meta }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'danger' | 'info'; text: string; undo?: () => void } | null>(null);
  const sections = useMemo(() => [...area.sections].sort((a, b) => a.sort - b.sort).map((s) => ({ ...s, fields: [...s.fields].sort((a, b) => a.sort - b.sort) })), [area]);
  const allFields = sections.flatMap((s) => s.fields);
  const field = allFields.find((f) => f.id === selected) ?? null;
  const done = () => refreshUsers(qc, area.key);
  const typeLabel = (t: string) => meta.types.find((x) => x.value === t)?.label ?? t;

  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: done, onError: (e) => setMsg({ kind: 'danger', text: errorText(e) }) });

  /** Asks again when the API says values or conditions depend on what is being deleted. */
  const guardedDelete = async (run: (force: boolean) => Promise<unknown>) => {
    try {
      await run(false);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'CONFIRM_REQUIRED')) throw e;
      if (!confirm(`${e.message}\n\n${((e.extra.breaks as string[]) ?? []).join('\n')}\n\nDelete anyway?`)) return false;
      await run(true);
    }
    return true;
  };

  const removeSection = (s: Section) => {
    if (!confirm(`Delete section "${s.name}"? Values already entered are kept but no longer shown.`)) return;
    act.mutate(say('Deleting section…', async () => {
      if (await guardedDelete((force) => fieldsApi.deleteSection(s.id, force))) setMsg({ kind: 'info', text: `Section "${s.name}" deleted.`, undo: () => act.mutate(say('Restoring section…', () => fieldsApi.restoreSection(s.id))) });
    }));
  };
  const removeField = (f: Field) => {
    if (!confirm(`Delete "${f.label}"? ${f.hasData ? 'Values already entered are kept but no longer shown.' : 'No values entered yet.'}`)) return;
    act.mutate(say('Deleting field…', async () => {
      if (await guardedDelete((force) => fieldsApi.deleteField(f.id, force))) {
        setSelected(null);
        setMsg({ kind: 'info', text: `"${f.label}" deleted.`, undo: () => act.mutate(say('Restoring field…', () => fieldsApi.restoreField(f.id))) });
      }
    }));
  };

  const move = (kind: 'section' | 'field', id: string, dir: -1 | 1) => {
    const order = sections.map((s) => s.id);
    const fields = Object.fromEntries(sections.map((s) => [s.id, s.fields.map((f) => f.id)]));
    const list = kind === 'section' ? order : fields[sections.find((s) => s.fields.some((f) => f.id === id))!.id];
    const i = list.indexOf(id);
    if (i + dir < 0 || i + dir >= list.length) return;
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    act.mutate(say('Saving the new order…', () => fieldsApi.reorder(area.key, order, fields)));
  };

  return (
    <>
      {msg && (
        <Alert kind={msg.kind}>
          {msg.text}{' '}
          {msg.undo && (
            <button type="button" className="link-btn" onClick={() => (msg.undo!(), setMsg(null))}>
              Undo
            </button>
          )}
        </Alert>
      )}
      <div className="cx-layout">
        <div className="cx-list">
          {sections.map((s, si) => (
            <div className="cx-sec" key={s.id} style={{ opacity: s.active ? 1 : 0.6 }}>
              <div className="cx-sec-head">
                <SectionName s={s} onSaved={done} onError={(t) => setMsg({ kind: 'danger', text: t })} />
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                  {s.fields.length} field{s.fields.length === 1 ? '' : 's'}
                </span>
                <button type="button" className="cx-ib" title="Move section up" disabled={si === 0 || act.isPending} onClick={() => move('section', s.id, -1)}>
                  ↑
                </button>
                <button type="button" className="cx-ib" title="Move section down" disabled={si === sections.length - 1 || act.isPending} onClick={() => move('section', s.id, 1)}>
                  ↓
                </button>
                {!s.system && (
                  <button type="button" className="cx-ib" title="Delete section" onClick={() => removeSection(s)}>
                    {Icon.trash}
                  </button>
                )}
              </div>
              {area.key === 'employee_profile' && (
                <label className="check" style={{ fontSize: 11.5, padding: '0 8px 4px' }} title="Show this section in the new-hire portal">
                  <input type="checkbox" checked={s.showInPortal} onChange={(e) => act.mutate(say('Updating section…', () => fieldsApi.updateSection(s.id, { showInPortal: e.target.checked }, s.version)))} />
                  Show in new-hire portal
                </label>
              )}
              {s.fields.map((f, fi) => (
                <div key={f.id} className={`cx-row${selected === f.id ? ' sel' : ''}`} style={{ opacity: f.active ? 1 : 0.55 }}>
                  <button type="button" className="cx-row-btn" onClick={() => setSelected(f.id)}>
                    <span>
                      {f.label}
                      {f.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                    </span>
                    <span>{typeLabel(f.type)}</span>
                  </button>
                  <button type="button" className="cx-ib" title="Move up" disabled={fi === 0 || act.isPending} onClick={() => move('field', f.id, -1)}>
                    ↑
                  </button>
                  <button type="button" className="cx-ib" title="Move down" disabled={fi === s.fields.length - 1 || act.isPending} onClick={() => move('field', f.id, 1)}>
                    ↓
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="cx-add"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate(say('Adding field…', async () => {
                    const f = await fieldsApi.addField(area.key, s.id, area.allowedTypes.includes('TEXT') ? 'TEXT' : area.allowedTypes[0]);
                    setSelected(f.id);
                  }))
                }
              >
                {Icon.plus}Add field
              </button>
            </div>
          ))}
          <button type="button" className="cx-add sec" disabled={act.isPending} onClick={() => act.mutate(say('Adding section…', () => fieldsApi.addSection(area.key, `New section ${sections.length + 1}`)))}>
            {Icon.plus}Add section
          </button>
        </div>
        <div className="cx-panel">
          {field ? (
            <FieldPanel key={field.id} area={area} field={field} sections={sections} allFields={allFields} meta={meta} onDone={done} onDelete={() => removeField(field)} />
          ) : (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--fg-3)' }}>Select a field to edit it and set who can see it</div>
          )}
        </div>
      </div>
    </>
  );
}

function SectionName({ s, onSaved, onError }: { s: Section; onSaved: () => void; onError: (t: string) => void }) {
  const [name, setName] = useState(s.name);
  useEffect(() => setName(s.name), [s.name]);
  const save = async () => {
    if (name.trim() === s.name) return;
    if (!name.trim()) return setName(s.name), onError('Every section needs a name');
    try {
      await fieldsApi.updateSection(s.id, { name: name.trim() }, s.version);
      onSaved();
    } catch (e) {
      setName(s.name);
      onError(errorText(e));
    }
  };
  return <input className="cx-sec-name" value={name} disabled={s.locked} aria-label="Section name" onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

type Cond = { field: string; op: 'FILLED' | 'EMPTY' | 'EQUALS'; value: string };

/**
 * The field panel. As in the design there is no Save button: text saves when you leave the box, choices save at once.
 * Each save sends only that change with the field's current version.
 */
function FieldPanel({ area, field, sections, allFields, meta, onDone, onDelete }: { area: Area; field: Field; sections: Section[]; allFields: Field[]; meta: Meta; onDone: () => void; onDelete: () => void }) {
  const [label, setLabel] = useState(field.label);
  const [def, setDef] = useState(field.defaultValue == null ? '' : String(field.defaultValue));
  const [help, setHelp] = useState(field.helpText ?? '');
  const [opts, setOpts] = useState((field.options ?? []).join(', '));
  const [cond, setCond] = useState<Cond>({ field: field.visibilityRule?.fieldKey ?? '', op: (field.visibilityRule?.op as Cond['op']) ?? 'FILLED', value: field.visibilityRule?.value ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmAsk, setConfirmAsk] = useState<{ body: Record<string, unknown>; text: string; breaks: string[] } | null>(null);
  const version = useRef(field.version);
  useEffect(() => {
    version.current = field.version;
  }, [field.version]);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: ({ body, force }: { body: Record<string, unknown>; force: boolean }) => fieldsApi.updateField(field.id, body, version.current, force),
    onSuccess: (f) => {
      version.current = f.version;
      setConfirmAsk(null);
      setErr(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onDone();
    },
    onError: (e, v) => {
      if (e instanceof ApiError && e.code === 'CONFIRM_REQUIRED') return setConfirmAsk({ body: v.body, text: e.message, breaks: (e.extra.breaks as string[]) ?? [] });
      setErr(e instanceof ApiError && (e.code === 'STALE' || e.code === 'VERSION_CONFLICT') ? 'Someone else changed this field. Reload to see their version.' : errorText(e));
    },
  });
  const send = (body: Record<string, unknown>) => save.mutate({ body, force: false });
  const sendIf = (changed: boolean, body: Record<string, unknown>) => changed && send(body);
  const saveCond = (c: Cond) => {
    setCond(c);
    send({ visibilityRule: c.field ? ({ fieldKey: c.field, op: c.op, ...(c.op === 'EQUALS' ? { value: c.value } : {}) } satisfies Rule) : null });
  };

  const types = area.allowedTypes.length ? area.allowedTypes : meta.typesByArea[area.key] ?? meta.types.map((t) => t.value);
  const locked = !!field.source;
  const isDrop = field.type === 'SELECT';

  return (
    <>
      <div className="cx-panel-head">
        <b>{field.label}</b>
        {saved && <span style={{ fontSize: 11, color: 'var(--success)' }}>Saved</span>}
        {save.isPending && <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>Saving…</span>}
        {field.system && <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>Built-in</span>}
        {!field.system && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete}>
            {Icon.trash} Delete
          </button>
        )}
      </div>
      {(err || confirmAsk || locked) && (
        <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {err && <Alert>{err}</Alert>}
          {locked && <Alert kind="info">Filled in from {field.source}; shown read-only.</Alert>}
          {confirmAsk && (
            <Alert>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {confirmAsk.text}
                {confirmAsk.breaks.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {confirmAsk.breaks.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                <span className="row-actions">
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => save.mutate({ body: confirmAsk.body, force: true })}>
                    Change anyway
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmAsk(null)}>
                    Keep as it was
                  </button>
                </span>
              </span>
            </Alert>
          )}
        </div>
      )}
      <div className="cx-grid">
        <label className="cx-lbl">
          <span>Field name</span>
          <input className="cx-in" value={label} placeholder="e.g. Cost centre" onChange={(e) => setLabel(e.target.value)} onBlur={() => label.trim() && sendIf(label.trim() !== field.label, { label: label.trim() })} />
        </label>
        <label className="cx-lbl">
          <span>Type</span>
          <select className="cx-in" value={field.type} disabled={locked || field.system} onChange={(e) => send({ type: e.target.value })}>
            {types.map((t) => (
              <option key={t} value={t}>
                {meta.types.find((x) => x.value === t)?.label ?? t}
              </option>
            ))}
          </select>
        </label>
        {isDrop && (
          <label className="cx-lbl">
            <span>Options · comma separated</span>
            <input className="cx-in" value={opts} placeholder="Option 1, Option 2" onChange={(e) => setOpts(e.target.value)} onBlur={() => sendIf(opts !== (field.options ?? []).join(', '), { options: opts.split(',').map((o) => o.trim()).filter(Boolean) })} />
          </label>
        )}
        <label className="cx-lbl">
          <span>Default value</span>
          <input className="cx-in" value={def} placeholder="Leave empty for none" onChange={(e) => setDef(e.target.value)} onBlur={() => sendIf(def !== (field.defaultValue == null ? '' : String(field.defaultValue)), { defaultValue: def === '' ? null : def })} />
        </label>
        <label className="cx-lbl">
          <span>Section</span>
          <select className="cx-in" value={field.sectionId} onChange={(e) => send({ sectionId: e.target.value })}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
          <button type="button" className="switch" role="switch" aria-checked={field.required} aria-label="Required" onClick={() => (field.system && !confirm(`${field.required ? 'Make field optional' : 'Make field required'}? This is a built-in field. Applies right away everywhere it is used.`) ? null : send({ required: !field.required }))} />
          <span style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>Required</span>
        </div>
      </div>
      <div style={{ padding: '0 16px 14px' }}>
        <label className="cx-lbl">
          <span>Help text</span>
          <input className="cx-in" value={help} placeholder="Shown under the field" onChange={(e) => setHelp(e.target.value)} onBlur={() => sendIf(help !== (field.helpText ?? ''), { helpText: help.trim() || null })} />
        </label>
      </div>
      <div className="cx-band">
        <span>Show only when</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="cx-in" style={{ flex: '1 1 160px', width: 'auto' }} value={cond.field} onChange={(e) => saveCond({ ...cond, field: e.target.value })}>
            <option value="">Always show</option>
            {allFields
              .filter((x) => x.id !== field.id && x.type !== 'HEADING')
              .map((x) => (
                <option key={x.id} value={x.key}>
                  When “{x.label}”…
                </option>
              ))}
          </select>
          {cond.field && (
            <select className="cx-in" style={{ flex: '0 1 140px', width: 'auto' }} value={cond.op} onChange={(e) => saveCond({ ...cond, op: e.target.value as Cond['op'] })}>
              {meta.conditionOps.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {cond.field && cond.op === 'EQUALS' && (
            <input className="cx-in" style={{ flex: '1 1 120px', width: 'auto' }} value={cond.value} placeholder="Value" onChange={(e) => setCond({ ...cond, value: e.target.value })} onBlur={() => saveCond(cond)} />
          )}
        </div>
      </div>
      <AccessGrid areaKey={area.key} field={field} meta={meta} onDone={onDone} />
    </>
  );
}

/** Role × own / others' records, plain dropdowns as in the design's field panel. Each change saves on its own. */
function AccessGrid({ areaKey, field, meta, onDone }: { areaKey: string; field: Field; meta: Meta; onDone: () => void }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const set = useMutation({
    meta: { silent: true },
    mutationFn: ({ side, roleId, level }: { side: 'OWN' | 'OTHERS'; roleId: string; level: Level }) => fieldsApi.setCell(areaKey, side, field.id, roleId, level),
    onMutate: ({ side, roleId, level }) => {
      // Show the new level straight away; the refetch after saving confirms it.
      const k = side === 'OWN' ? 'own' : 'others';
      qc.setQueryData(['config', 'area', areaKey], (old: Area | undefined) =>
        old && { ...old, sections: old.sections.map((s) => ({ ...s, fields: s.fields.map((f) => (f.id === field.id ? { ...f, access: f.access.map((a) => (a.roleId === roleId ? { ...a, [k]: level, explicit: true } : a)) } : f)) })) },
      );
    },
    onSuccess: () => setErr(null),
    onError: (e) => setErr(errorText(e)),
    onSettled: onDone,
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {err && (
        <div style={{ padding: '0 16px 12px' }}>
          <Alert>{err}</Alert>
        </div>
      )}
      <div className="cx-acc-head">
        <span>Role</span>
        <span>Own record</span>
        <span>Others’ records</span>
      </div>
      {field.access.map((a) => (
        <div className="cx-acc-row" key={a.roleId}>
          <span>{a.roleName}</span>
          {(['OWN', 'OTHERS'] as const).map((side) => (
            <select
              key={side}
              className="cx-in"
              value={side === 'OWN' ? a.own : a.others}
              disabled={a.roleKey === 'super_admin' || set.isPending}
              title={a.roleKey === 'super_admin' ? 'Super admin can always edit everything' : a.explicit ? undefined : 'Default for this role'}
              onChange={(e) => set.mutate({ side, roleId: a.roleId, level: e.target.value as Level })}
            >
              {meta.levels.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          ))}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ access matrix (design: grid with colour-filled cells)

export function MatrixView({ areaKey, meta }: { areaKey: string; meta: Meta }) {
  const qc = useQueryClient();
  const [side, setSide] = useState<'OWN' | 'OTHERS'>('OTHERS');
  const m = useQuery({ queryKey: ['config', 'matrix', areaKey, side], queryFn: () => fieldsApi.matrix(areaKey, side) });
  const [err, setErr] = useState<string | null>(null);
  const set = useMutation({
    meta: { silent: true },
    mutationFn: ({ fieldId, roleId, level }: { fieldId: string; roleId: string; level: Level }) => fieldsApi.setCell(areaKey, side, fieldId, roleId, level),
    onMutate: ({ fieldId, roleId, level }) => {
      // Show the new colour straight away; the refetch confirms it.
      qc.setQueryData(['config', 'matrix', areaKey, side], (old: typeof m.data) =>
        old && { ...old, rows: old.rows.map((r) => (r.fieldId === fieldId ? { ...r, cells: r.cells?.map((c) => (c.roleId === roleId ? { ...c, level, explicit: true } : c)) } : r)) },
      );
    },
    onSuccess: () => refreshUsers(qc, areaKey),
    onError: (e) => (setErr(errorText(e)), qc.invalidateQueries({ queryKey: ['config', 'matrix', areaKey] })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['config', 'matrix', areaKey] }),
  });
  const cols = m.data ? `minmax(200px,1.4fr) repeat(${m.data.roles.length}, minmax(120px,1fr))` : '1fr';

  return (
    <div className="cx-mx">
      <div className="cx-mx-bar">
        <span>{m.data?.text ?? (side === 'OWN' ? 'What each role can do with each field on their own record.' : 'What each role can do with each field on someone else’s record.')}</span>
        <span className="seg lg" role="group" aria-label="Side">
          <button type="button" aria-pressed={side === 'OWN'} onClick={() => setSide('OWN')}>
            Own record
          </button>
          <button type="button" aria-pressed={side === 'OTHERS'} onClick={() => setSide('OTHERS')}>
            Others’ records
          </button>
        </span>
      </div>
      {err && (
        <div style={{ padding: '10px 14px' }}>
          <Alert>{err}</Alert>
        </div>
      )}
      {m.isLoading && <BlockLoader height={220} label="Loading access matrix…" />}
      {m.isError && <div className="card-empty">{m.error.message}</div>}
      {m.data && (
        <div className="cx-mx-body">
          <div className="cx-mx-head" style={{ gridTemplateColumns: cols }}>
            <span>Field</span>
            {m.data.roles.map((r) => (
              <span key={r.id}>{r.name}</span>
            ))}
          </div>
          {m.data.rows.map((row, i) =>
            row.type === 'SECTION' ? (
              <div key={`s${i}`} className="cx-mx-row section" style={{ gridTemplateColumns: cols }}>
                <span>{row.name}</span>
              </div>
            ) : (
              <div key={row.fieldId} className="cx-mx-row" style={{ gridTemplateColumns: cols }}>
                <span>{row.label}</span>
                {m.data!.roles.map((r) => {
                  const c = row.cells?.find((x) => x.roleId === r.id);
                  if (!c) return <span key={r.id} />;
                  const st = LEVEL_STYLE[c.level] ?? LEVEL_STYLE.VIEW;
                  return (
                    <select
                      key={r.id}
                      className="cx-cell"
                      value={c.level}
                      disabled={r.key === 'super_admin'}
                      title={r.key === 'super_admin' ? 'Super admin can always edit everything' : c.explicit ? undefined : 'Default for this role'}
                      style={{ color: st.fg, backgroundColor: st.bg }}
                      aria-label={`${row.label} · ${r.name}`}
                      onChange={(e) => set.mutate({ fieldId: row.fieldId!, roleId: r.id, level: e.target.value as Level })}
                    >
                      {meta.levels.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  );
                })}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
