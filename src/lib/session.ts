/**
 * The browser side of a signed-in session.
 *
 * - The access token (a 15-minute JWT) lives only in memory, never in localStorage, so injected script can't read it from storage
 *   and it is gone when the tab closes.
 * - The refresh token is an httpOnly, SameSite=Strict cookie scoped to /api/v1/auth; script never sees it.
 * - Refresh tokens rotate and the API ends the whole session if one is used twice. Tabs therefore take a Web Lock before
 *   refreshing and share the result over a BroadcastChannel, so only one tab spends each refresh token.
 * - Signing out in one tab signs out all of them.
 */

export type User = {
  id: string;
  employeeId: string;
  code: string | null;
  name: string;
  email: string;
  initials: string;
  photoUrl: string;
};

export type Landing = 'ADMIN' | 'ESS';

export type SignedIn = {
  status: 'OK';
  accessToken: string;
  expiresIn: number;
  landing: Landing;
  user: User;
  recoveryCodes?: string[];
};

type State = { token: string; expiresAt: number; user: User; landing: Landing } | null;

type Message = { type: 'signed-in'; token: string; expiresAt: number; user: User; landing: Landing } | { type: 'signed-out'; reason?: string };

const LOCK = 'hrms-refresh';
const REFRESH_EARLY_MS = 60_000;

let state: State = null;
let inflight: Promise<State> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const HINT = 'hrms-signed-in';
const listeners = new Set<(s: State, reason?: string) => void>();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('hrms-auth');

export function current(): State {
  return state;
}

export function accessToken(): string | null {
  return state && state.expiresAt > Date.now() ? state.token : null;
}

export function subscribe(fn: (s: State, reason?: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Whether this browser was signed in last time; saves a refresh call that would only fail. Holds no secret. */
export function maybeSignedIn(): boolean {
  try {
    return localStorage.getItem(HINT) === '1';
  } catch {
    return true;
  }
}

function set(next: State, reason?: string) {
  state = next;
  try {
    if (next) localStorage.setItem(HINT, '1');
    else localStorage.removeItem(HINT);
  } catch {
    // storage blocked: the hint is only an optimisation
  }
  clearTimeout(timer);
  if (next) {
    // Refresh a minute early; a tab in the background may fire late, which the 401 retry in http.ts covers.
    timer = setTimeout(() => void refresh().catch(() => undefined), Math.max(5_000, next.expiresAt - Date.now() - REFRESH_EARLY_MS));
  }
  listeners.forEach((fn) => fn(next, reason));
}

/** Store the result of a successful sign-in, MFA check, enrolment or refresh, and tell the other tabs. */
export function accept(body: SignedIn, receivedAt = Date.now()) {
  const next = { token: body.accessToken, expiresAt: receivedAt + body.expiresIn * 1000, user: body.user, landing: body.landing };
  set(next);
  channel?.postMessage({ type: 'signed-in', ...next } satisfies Message);
}

/** Forget the session locally and in every other tab. The caller ends it on the server. */
export function clear(reason?: string, broadcast = true) {
  set(null, reason);
  if (broadcast) {
    channel?.postMessage({ type: 'signed-out', reason } satisfies Message);
  }
}

channel?.addEventListener('message', (e: MessageEvent<Message>) => {
  const m = e.data;
  if (m.type === 'signed-in') {
    set({ token: m.token, expiresAt: m.expiresAt, user: m.user, landing: m.landing });
  } else if (m.type === 'signed-out') {
    set(null, m.reason);
  }
});

export class SessionEnded extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Get a new access token with the refresh cookie. Calls in this tab share one request; tabs take turns, and a tab that waited
 * uses the token another tab just got instead of spending the (already rotated) cookie again.
 */
export function refresh(): Promise<State> {
  if (!inflight) {
    const startedWith = state?.token;
    const run = async (): Promise<State> => {
      if (state && state.token !== startedWith && state.expiresAt - Date.now() > REFRESH_EARLY_MS) {
        return state;
      }
      const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body.code ?? 'TOKEN_EXPIRED';
        // Only a definite "no session" signs the user out; a network or 5xx error keeps the current state.
        if (res.status === 401 || res.status === 403) {
          clear(code === 'TOKEN_EXPIRED' ? undefined : body.detail);
          throw new SessionEnded(code, body.detail ?? 'Please sign in again');
        }
        throw new Error(body.detail ?? `Refresh failed (${res.status})`);
      }
      accept((await res.json()) as SignedIn);
      return state;
    };
    const locked = typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(LOCK, run) : run();
    inflight = locked.finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

// Coming back to a tab whose timer was throttled: refresh now if the token has run out.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state && state.expiresAt - Date.now() < REFRESH_EARLY_MS) {
      void refresh().catch(() => undefined);
    }
  });
}
