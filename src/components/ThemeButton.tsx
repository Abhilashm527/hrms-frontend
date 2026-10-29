import { useTheme } from '../lib/theme';
import { Icon } from './icons';

export function ThemeButton() {
  const { mode, cycle, isDark } = useTheme();
  const title = mode === 'auto' ? `Theme: auto (${isDark ? 'dark' : 'light'} now) · click for light` : mode === 'light' ? 'Theme: light · click for dark' : 'Theme: dark · click for auto';
  return (
    <button type="button" className="dfx-icon-btn" onClick={cycle} title={title} aria-label={title}>
      {mode === 'auto' ? Icon.auto : isDark ? Icon.sun : Icon.moon}
    </button>
  );
}
