import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { authApi } from '../auth/api';
import { Alert } from '../components/Alert';
import { Icon } from '../components/icons';
import { Overlay } from '../components/Overlay';
import { ago, dateTime } from '../lib/format';
import { BlockLoader } from '../components/Splash';

/** My account → security: sign-in method, two-step status and the devices signed in, with sign-out per device. */
export function AccountModal({ onClose }: { onClose: () => void }) {
  const { user, me } = useAuth();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['me', 'sessions'], queryFn: authApi.sessions });
  const end = useMutation({ meta: { busy: 'Signing out that session…' }, mutationFn: authApi.endSession, onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'sessions'] }) });
  const endOthers = useMutation({ meta: { busy: 'Signing out your other sessions…' }, mutationFn: authApi.endOtherSessions, onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'sessions'] }) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const others = (sessions.data ?? []).filter((s) => !s.current).length;
  const amr = me?.amr ?? [];

  return (
    <Overlay>
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="acct-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="dfx-avatar" style={{ width: 48, height: 48, fontSize: 16, flexShrink: 0 }}>
            {user?.initials}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, lineHeight: 1.35 }}>
            <span id="acct-title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-1)' }}>
              {user?.name}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>
              {user?.email}
              {user?.code ? ` · ${user.code}` : ''}
            </span>
          </span>
          <button className="dfx-icon-btn" type="button" onClick={onClose} title="Close">
            {Icon.close}
          </button>
        </div>
        <div className="modal-body">
          <div className="card">
            <div className="list-row">
              <span className="txt">
                <b>Two-step verification</b>
                <span>Authenticator app{me?.landing === 'ADMIN' ? ' · required for admins' : ''}</span>
              </span>
              <span className={`pill ${me?.security.mfaEnrolled ? 'pill-ok' : 'pill-warn'}`}>{me?.security.mfaEnrolled ? 'On' : 'Off'}</span>
            </div>
            <div className="list-row">
              <span className="txt">
                <b>This session</b>
                <span>
                  {amr.includes('otp') ? 'Password + authenticator' : amr.includes('pwd') ? 'Password' : 'Microsoft'}
                  {me?.session ? ` · ${me.session.remember ? 'kept signed in' : 'ends when idle'} until ${dateTime(me.session.expiresAt)}` : ''}
                </span>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="section-label">Active sessions</span>
            {others > 0 && (
              <button type="button" className="btn btn-danger btn-sm" disabled={endOthers.isPending} onClick={() => endOthers.mutate()}>
                Sign out {others} other{others === 1 ? '' : 's'}
              </button>
            )}
          </div>
          {(end.error || endOthers.error) && <Alert>{(end.error ?? endOthers.error)!.message}</Alert>}
          <div className="card">
            {sessions.isLoading && <BlockLoader height={100} size={24} label="Loading your sessions…" />}
            {sessions.isError && <div className="card-empty">{sessions.error.message}</div>}
            {sessions.data?.map((s) => (
              <div className="list-row" key={s.id}>
                <span className="txt">
                  <b>{s.device || 'Unknown device'}</b>
                  <span>
                    {[s.place, s.method === 'SSO' ? 'Microsoft' : 'Password', `active ${ago(s.lastActiveAt)}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {s.current ? (
                  <span className="pill pill-brand">This device</span>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={end.isPending} onClick={() => end.mutate(s.id)}>
                    Sign out
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
    </Overlay>
  );
}
