/**
 * The API's emails and the Microsoft sign-in send people to hash links (/#reset?token=…, /#activate?token=…, /#signed-in,
 * /#signin?error=…). Turn them into normal routes before the router starts.
 */
const MAP: Record<string, string> = { reset: '/reset-password', activate: '/activate', 'signed-in': '/signed-in', signin: '/login' };

export function adoptHashLink() {
  // The invite email links to <portal-url>?token=…; the portal URL defaults to /onboarding, which is also the HR page.
  if (window.location.pathname === '/onboarding' && new URLSearchParams(window.location.search).has('token')) {
    window.history.replaceState(null, '', '/portal' + window.location.search);
    return;
  }
  const m = /^#\/?([a-z-]+)(\?.*)?$/.exec(window.location.hash);
  if (!m || !MAP[m[1]]) return;
  window.history.replaceState(null, '', MAP[m[1]] + (m[2] ?? ''));
}
