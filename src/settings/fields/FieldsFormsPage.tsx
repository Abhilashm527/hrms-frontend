import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { ApiError } from '../../lib/http';
import { PermissionsNotice } from '../../onboarding/PermissionsNotice';
import { SettingsHead } from '../SettingsLayout';
import { AREAS, fieldsApi } from './api';
import { FieldsView, MatrixView } from './views';
import { BlockLoader } from '../../components/Splash';

export { MatrixView, refreshUsers } from './views';

export function FieldsFormsPage() {
  const { area: slug = '' } = useParams();
  const def = AREAS.find((a) => a.slug === slug);
  const [view, setView] = useState<'fields' | 'matrix'>('fields');
  const area = useQuery({ queryKey: ['config', 'area', def?.key], queryFn: () => fieldsApi.area(def!.key), enabled: !!def });
  const meta = useQuery({ queryKey: ['config', 'meta'], queryFn: fieldsApi.meta, staleTime: 60 * 60_000 });
  if (!def) return <Navigate to="/configuration/fields/employee-profile" replace />;

  const notOwner = area.error instanceof ApiError && (area.error.code === 'NOT_AREA_OWNER' || area.error.status === 403);
  return (
    <>
      <SettingsHead title={area.data?.name ?? def.label} sub={area.data?.description ?? ''}>
        <span className="seg lg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'fields'} onClick={() => setView('fields')}>
            Fields
          </button>
          <button type="button" aria-pressed={view === 'matrix'} onClick={() => setView('matrix')}>
            Access matrix
          </button>
        </span>
      </SettingsHead>
      {area.data && (
        <span className="field-hint" style={{ marginTop: -8 }}>
          Configured by {['Super admin', ...area.data.owners.map((o) => o.name).filter((n) => n !== 'Super admin')].join(', ')} · Shown on{' '}
          {def.shownOn.map((s, i) => (
            <span key={s.label}>
              {i > 0 && ' · '}
              {s.to ? <Link to={s.to}>{s.label}</Link> : s.label}
            </span>
          ))}
        </span>
      )}
      {notOwner ? <Alert kind="info">Your role can't configure this area. Area owners are set by a super admin.</Alert> : <PermissionsNotice errors={[area.error]} />}
      {area.isError && !notOwner && !(area.error instanceof ApiError && area.error.status === 403) && <Alert>{area.error.message}</Alert>}
      {area.isLoading && <BlockLoader page label="Loading fields & forms…" />}
      {area.data && meta.data && (view === 'fields' ? <FieldsView area={area.data} meta={meta.data} /> : <MatrixView areaKey={area.data.key} meta={meta.data} />)}
    </>
  );
}

