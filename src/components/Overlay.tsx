import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders drawers, modals and popups at the end of <body>, outside the page's own stacking layers,
 * so nothing on the page (the sidebar toggle, sticky headers) can show through on top of them.
 */
export function Overlay({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
