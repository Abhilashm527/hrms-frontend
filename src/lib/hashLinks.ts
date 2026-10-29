/**
 * The API's emails and the Microsoft sign-in send people to hash links (/#reset?token=…, /#activate?token=…, /#signed-in,
 * /#signin?error=…). Turn them into normal routes before the router starts.
 */
const MAP: Record<string, string> = { reset: '/reset-password', activate: '/activate', 'signed-in': '/signed-in', signin: '/login' };

export function adoptHashLink() {
  const m = /^#\/?([a-z-]+)(\?.*)?$/.exec(window.location.hash);
  if (!m || !MAP[m[1]]) return;
  window.history.replaceState(null, '', MAP[m[1]] + (m[2] ?? ''));
}
