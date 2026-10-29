import { useSyncExternalStore } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';

const KEY = 'ivy-hrms-theme';
const DARK_FROM = 19;
const DARK_TO = 7;

const autoDark = () => {
  const h = new Date().getHours();
  return h >= DARK_FROM || h < DARK_TO;
};

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let mode: ThemeMode = read();
const listeners = new Set<() => void>();

function apply() {
  const dark = mode === 'dark' || (mode === 'auto' && autoDark());
  if (document.documentElement.dataset.theme !== (dark ? 'dark' : 'light')) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    listeners.forEach((l) => l());
  }
}

function setMode(m: ThemeMode, save = true) {
  mode = m;
  if (save) {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // not saved; still applies to this tab
    }
  }
  apply();
  listeners.forEach((l) => l());
}

// Auto mode follows the clock; other tabs follow this one.
setInterval(apply, 60_000);
window.addEventListener('storage', (e) => e.key === KEY && setMode(read(), false));
apply();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => `${mode}|${document.documentElement.dataset.theme}`;

/** Light, dark, or auto (dark from 7 pm to 7 am, as in the UX). Kept per browser in localStorage and in step across tabs. */
export function useTheme() {
  const [m, applied] = useSyncExternalStore(subscribe, snapshot).split('|');
  return {
    mode: m as ThemeMode,
    isDark: applied === 'dark',
    set: (next: ThemeMode) => setMode(next),
    cycle: () => setMode(mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'),
  };
}
