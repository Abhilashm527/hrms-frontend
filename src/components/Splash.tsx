import { Logo } from './icons';

export function Splash({ label = 'Loading iHRMS…' }: { label?: string }) {
  return (
    <div className="splash" role="status" aria-live="polite">
      <Logo size={56} />
      <span>{label}</span>
    </div>
  );
}
