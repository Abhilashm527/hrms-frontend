import type { ReactNode } from 'react';
import { Icon } from './icons';

export function Alert({ kind = 'danger', children }: { kind?: 'danger' | 'info' | 'success'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      {kind === 'success' ? Icon.check : Icon.alert}
      <span>{children}</span>
    </div>
  );
}
