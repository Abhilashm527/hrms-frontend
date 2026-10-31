import type { CSSProperties, ReactNode } from 'react';

const svg = (paths: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

export const Icon = {
  alert: svg(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>),
  check: svg(<path d="M20 6 9 17l-5-5" />),
  mail: svg(<><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>, 20),
  shield: svg(<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />, 20),
  signOut: svg(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>),
  sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>),
  moon: svg(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />),
  auto: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>),
  search: svg(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>, 14),
  bell: svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  settings: svg(<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>),
  user: svg(<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  users: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  userPlus: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
  dash: svg(<><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></>),
  cal: svg(<><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  org: svg(<><rect width="6" height="6" x="9" y="2" rx="1" /><rect width="6" height="6" x="2" y="16" rx="1" /><rect width="6" height="6" x="16" y="16" rx="1" /><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8" /></>),
  laptop: svg(<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" />),
  wallet: svg(<><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>),
  file: svg(<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></>),
  chart: svg(<><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></>),
  briefcase: svg(<><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>),
  chevL: svg(<path d="m15 18-6-6 6-6" />, 14),
  chevR: svg(<path d="m9 18 6-6-6-6" />, 14),
  copy: svg(<><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>, 14),
  download: svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>, 14),
  checkSmall: (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  camera: svg(<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>, 14),
  sliders: svg(<><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></>),
  pin: svg(<><path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>),
  trash: svg(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 14),
  menu: svg(<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>),
  refresh: svg(<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>, 14),
  close: svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  grid: svg(<><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /></>, 14),
  list: svg(<><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>, 14),
  split: svg(<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></>, 14),
  link: svg(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>, 14),
  arrowR: svg(<path d="M5 12h14m-6-6 6 6-6 6" />, 14),
  mailSm: svg(<><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>, 14),
  phone: svg(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />, 14),
  plus: svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, 14),
};

/** The Ivoyant mark's five strokes, in the order the loader draws them. */
export const LOGO_STROKES: { d: string; fill: string }[] = [
  { fill: '#FFD119', d: 'M0.00834371 30.9491L5.1348 25.9097L5.12095 18.8184V2.51608C5.12095 1.12778 3.9752 0.00488281 2.56638 0.00488281C1.14717 0.00488281 0.00488281 1.13118 0.00488281 2.51608V23.1161C0.00488281 23.1671 0.00834445 23.2181 0.0118059 23.2658V30.9491H0.00834371Z' },
  { fill: '#00FFA7', d: 'M27.0869 0.734984C26.09 -0.244995 24.47 -0.244995 23.4731 0.734984L14.2898 9.76236V2.51119C14.2898 1.12289 13.1441 8.11268e-08 11.7352 8.11268e-08C10.3264 8.11268e-08 9.18066 1.12629 9.18066 2.51119V21.893L27.0904 4.28741C28.0873 3.30743 28.0873 1.71496 27.0904 0.734984H27.0869Z' },
  { fill: '#3CBDFF', d: 'M39.9386 4.29229L4.36147 39.2653C3.86301 39.7553 3.20879 40.0003 2.55457 40.0003C1.90035 40.0003 1.24613 39.7553 0.74768 39.2653C-0.249227 38.2853 -0.249227 36.6928 0.74768 35.7129L36.3248 0.739867C37.3217 -0.240112 38.9417 -0.240112 39.9386 0.739867C40.9355 1.71985 40.9355 3.31231 39.9386 4.29229Z' },
  { fill: '#3A7CED', d: 'M36.3248 13.1822L13.4098 35.7082C12.4129 36.6881 12.4129 38.2806 13.4098 39.2606C13.9082 39.7506 14.5625 39.9956 15.2167 39.9956C15.8709 39.9956 16.5251 39.7506 17.0236 39.2606L39.9386 16.7347C40.9355 15.7547 40.9355 14.1622 39.9386 13.1822C38.9417 12.2023 37.3217 12.2023 36.3248 13.1822Z' },
  { fill: '#861FAC', d: 'M36.3259 25.505L25.9449 35.7097C24.948 36.6897 24.948 38.2822 25.9449 39.2621C26.4434 39.7521 27.0976 39.9971 27.7518 39.9971C28.4061 39.9971 29.0603 39.7521 29.5587 39.2621L39.9397 29.0574C40.9366 28.0774 40.9366 26.485 39.9397 25.505C38.9428 24.525 37.3228 24.525 36.3259 25.505Z' },
];

/** The Ivoyant mark. */
export function Logo({ size = 22, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={(size * 40) / 41} viewBox="0 0 41 40" fill="none" className={className} style={{ display: 'block', flexShrink: 0, ...style }} aria-hidden="true">
      {LOGO_STROKES.map((p) => (
        <path key={p.fill} d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}
