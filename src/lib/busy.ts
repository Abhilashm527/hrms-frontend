import { useSyncExternalStore } from 'react';

/**
 * The screen-blocking "busy" layer (see BusyOverlay) and the message it shows.
 *
 * - A react-query mutation blocks the screen while it runs. Say what it's doing with `meta: { busy: 'Saving role…' }`,
 *   or a function of the mutation's variables. Use `meta: { silent: true }` for saves that happen as you type.
 * - A mutation that runs whatever function it's given can label each call with `say('Deleting field…', fn)`.
 * - Work outside react-query: `withBusy(work, 'Saving changes…')`.
 */
export type BusyMeta = { busy?: string | ((vars: unknown) => string); silent?: boolean };

export const say = <F extends (...a: never[]) => unknown>(label: string, fn: F): F & { busyLabel: string } => Object.assign(fn, { busyLabel: label });

const jobs: string[] = [];
const subs = new Set<() => void>();
let snap: readonly string[] = [];
const emit = () => {
  snap = [...jobs];
  subs.forEach((f) => f());
};

export async function withBusy<T>(work: () => Promise<T>, label = 'Saving changes…'): Promise<T> {
  jobs.push(label);
  emit();
  try {
    return await work();
  } finally {
    jobs.splice(jobs.indexOf(label), 1);
    emit();
  }
}

/** Labels of the running non-mutation jobs, newest last. */
export const useBusyJobs = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => snap,
  );

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: BusyMeta;
  }
}
