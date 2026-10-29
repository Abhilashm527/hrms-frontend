import { accessToken, refresh, SessionEnded } from './session';

/** An error answer from the API (RFC 9457 problem detail), with its machine code and any extra fields. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean };

const BASE = '/api/v1';

async function send(path: string, opts: Options, token: string | null): Promise<Response> {
  const headers = new Headers(opts.headers);
  headers.set('Accept', 'application/json');
  if (opts.body !== undefined && !(opts.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(BASE + path, {
    ...opts,
    headers,
    credentials: 'same-origin',
    // API answers are personal data; never let the HTTP cache keep them.
    cache: 'no-store',
    body: opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body),
  });
}

async function toError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  const { status: _s, code, detail, title, type: _t, instance: _i, ...extra } = body as Record<string, unknown>;
  const message = (detail as string) || (title as string) || (res.status >= 500 ? 'Something went wrong. Try again.' : `Request failed (${res.status})`);
  return new ApiError(res.status, (code as string) || String(res.status), message, extra);
}

/**
 * Call the API. Signed-in calls carry the access token; when it has expired (or the API says so) the token is refreshed once and
 * the call repeated. `auth: false` is for the sign-in calls themselves.
 */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  let token = useAuth ? accessToken() : null;
  if (useAuth && !token) {
    token = (await refresh())?.token ?? null;
  }
  let res = await send(path, opts, token);
  if (res.status === 401 && useAuth) {
    try {
      token = (await refresh())?.token ?? null;
    } catch (e) {
      if (e instanceof SessionEnded) {
        throw new ApiError(401, e.code, e.message);
      }
      throw e;
    }
    res = await send(path, opts, token);
  }
  if (!res.ok) {
    throw await toError(res);
  }
  if (res.status === 204 || res.headers.get('Content-Length') === '0') {
    return undefined as T;
  }
  const type = res.headers.get('Content-Type') ?? '';
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>;
}

export const get = <T>(path: string, opts?: Options) => api<T>(path, { ...opts, method: 'GET' });
export const post = <T>(path: string, body?: unknown, opts?: Options) => api<T>(path, { ...opts, method: 'POST', body: body ?? {} });
export const del = <T>(path: string, opts?: Options) => api<T>(path, { ...opts, method: 'DELETE' });
