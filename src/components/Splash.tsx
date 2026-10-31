import { LOGO_STROKES } from './icons';

/**
 * The design's loader: the Ivoyant mark builds up one stroke at a time (yellow, green, light blue, blue, purple),
 * holds, fades and starts again.
 */
export function Loader({ size = 40, label = 'Loading' }: { size?: number; label?: string }) {
  return (
    <svg className="ivy-loader" width={size} height={(size * 40) / 41} viewBox="0 0 41 40" fill="none" role="img" aria-label={label}>
      {LOGO_STROKES.map((p, k) => (
        <path key={p.fill} d={p.d} fill={p.fill} style={{ animationDelay: `${k * 0.18}s` }} />
      ))}
    </svg>
  );
}

/** Full-screen loader shown while the app checks for a session. */
export function Splash({ label = 'Loading iHRMS…' }: { label?: string }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <Loader size={56} />
      <span>{label}</span>
    </div>
  );
}

/**
 * Loader for something still loading. `page` centres it in the page's content area (whole-page loads); `fill` takes the
 * rest of its container, e.g. a drawer body; otherwise it reserves `height` where the content will appear.
 */
export function BlockLoader({ height = 160, size = 32, label = 'Loading…', page, fill }: { height?: number; size?: number; label?: string; page?: boolean; fill?: boolean }) {
  return (
    <div className={`block-loader${page ? ' page' : ''}${fill ? ' fill' : ''}`} role="status" aria-live="polite" aria-label={label} style={page || fill ? undefined : { minHeight: height }}>
      <Loader size={page ? 44 : size} />
      <span>{label}</span>
    </div>
  );
}
