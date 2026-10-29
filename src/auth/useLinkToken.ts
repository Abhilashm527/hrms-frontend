import { useState } from 'react';

/**
 * Reads ?token= from an emailed link once and removes it from the address bar, so the token doesn't stay in browser history
 * or leak through the Referer header.
 */
export function useLinkToken(): string {
  const [token] = useState(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('token') ?? '';
    if (t) {
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    }
    return t;
  });
  return token;
}
