import { useEffect, useState } from 'react';
import { useMutationState } from '@tanstack/react-query';
import { useBusyJobs, type BusyMeta } from '../lib/busy';
import { Overlay } from './Overlay';
import { Loader } from './Splash';

const DEFAULT = 'Saving changes…';

/**
 * The design's "busy" layer: while something is being saved the whole screen is dimmed, clicks and keys are held back
 * and the loader sits in the middle with a line saying what's happening. It blocks straight away but only shows after
 * a moment, so quick saves don't flash.
 */
export function BusyOverlay() {
  const pending = useMutationState({
    filters: { status: 'pending', predicate: (m) => !(m.options.meta as BusyMeta | undefined)?.silent },
    select: (m) => {
      const meta = m.options.meta as BusyMeta | undefined;
      const vars = m.state.variables as { busyLabel?: string } | undefined;
      if (typeof meta?.busy === 'function') return meta.busy(vars);
      return meta?.busy ?? (typeof vars?.busyLabel === 'string' ? vars.busyLabel : DEFAULT);
    },
  });
  const jobs = useBusyJobs();
  const labels = [...pending, ...jobs];
  const busy = labels.length > 0;
  const label = labels[labels.length - 1] ?? DEFAULT;

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!busy) return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [busy]);

  useEffect(() => {
    if (!busy) return;
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', stop, true);
    document.documentElement.setAttribute('aria-busy', 'true');
    return () => {
      window.removeEventListener('keydown', stop, true);
      document.documentElement.removeAttribute('aria-busy');
    };
  }, [busy]);

  if (!busy) return null;
  return (
    <Overlay>
      <div className="busy-layer" role="status" aria-live="polite" onMouseDown={(e) => e.preventDefault()}>
        <div className="busy-box">
          <Loader size={40} label={label} />
          <b>{label}</b>
          {slow && <span>Still working — the server can take a few seconds to wake up.</span>}
        </div>
      </div>
    </Overlay>
  );
}
