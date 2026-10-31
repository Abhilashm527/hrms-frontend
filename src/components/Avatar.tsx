import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { blob } from '../lib/http';

/**
 * A photo served by the API. The API wants the access token, which an <img src> can't send, so the image is fetched
 * with it and shown from a local object URL. Cached in memory with the other API data; initials while loading or if
 * there is no photo.
 */
export function Avatar({ url, initials, size = 32, className, tone, radius, noPhoto }: { url?: string | null; initials: string; size?: number; className?: string; tone?: { fg: string; bg: string }; radius?: number; noPhoto?: boolean }) {
  const path = url?.replace(/^\/api\/v1/, '');
  const q = useQuery({ queryKey: ['photo', path], queryFn: () => blob(path!), enabled: !!path && !noPhoto, staleTime: 10 * 60_000, retry: false });
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data || q.data.size === 0 || !q.data.type.startsWith('image/')) return setSrc(null);
    const u = URL.createObjectURL(q.data);
    setSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * (size >= 64 ? 0.28 : 0.34))), ...(radius != null ? { borderRadius: radius } : {}), ...(tone ? { background: tone.bg, color: tone.fg } : {}) };
  return src && !noPhoto ? (
    <img src={src} alt="" className={`avatar-img ${className ?? ''}`} style={style} />
  ) : (
    <span className={`avatar-ini ${className ?? ''}`} style={style}>
      {initials}
    </span>
  );
}
