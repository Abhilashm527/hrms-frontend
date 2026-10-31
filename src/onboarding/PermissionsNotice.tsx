import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { ApiError, post } from '../lib/http';

/**
 * Shown when org lookups answer 403. Those checks go through OpenFGA, which knows nobody until its tuples are copied
 * from the database. A super admin (in the database or in OpenFGA) can run that copy from here.
 */
export function PermissionsNotice({ errors }: { errors: unknown[] }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'still-refused'>('idle');
  const refused = errors.some((e) => e instanceof ApiError && e.status === 403);

  const sync = useMutation({
    meta: { busy: 'Syncing permissions…' },
    mutationFn: () => post<{ queued: number }>('/admin/fga/sync'),
    onSuccess: () => {
      setPhase('waiting');
      // The API sends the records to OpenFGA in the background (every few seconds); ask again after it has had time.
      [3000, 8000, 15000].forEach((ms) => setTimeout(() => qc.invalidateQueries({ predicate: (q) => q.state.status === 'error' }), ms));
      setTimeout(() => setPhase((p) => (p === 'waiting' ? 'still-refused' : p)), 16000);
    },
  });

  useEffect(() => {
    if (!refused && phase !== 'idle') setPhase('idle');
  }, [refused, phase]);

  if (!refused) return null;
  const notAdmin = sync.error instanceof ApiError && sync.error.status === 403;

  return (
    <Alert kind={phase === 'waiting' ? 'info' : 'danger'}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {phase === 'idle' && (
          <span>Your account isn't allowed to read departments, locations and employment types yet. This usually means the API's permission store (OpenFGA) hasn't been synced since setup.</span>
        )}
        {phase === 'waiting' && <span>Permissions sync started. Checking again in a few seconds…</span>}
        {phase === 'still-refused' && (
          <span>
            The sync ran, but access is still refused. OpenFGA probably isn't receiving the changes: check that <code>FGA_STORE_ID</code> and <code>FGA_MODEL_ID</code> are set on the API
            and look for <code>OpenFGA</code> errors in its logs. Also make sure your account is a member of this organization.
          </span>
        )}
        {notAdmin && <span>Only a super admin can run the sync, and your account isn't one. Ask a super admin to press this button, or give your account the super admin role.</span>}
        {sync.error && !notAdmin && <span>{sync.error.message}</span>}
        {phase !== 'waiting' && (
          <span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {Icon.refresh} {sync.isPending ? 'Syncing…' : phase === 'still-refused' ? 'Sync again' : 'Sync permissions'}
            </button>
          </span>
        )}
      </span>
    </Alert>
  );
}
