import { setTheme, useTheme, type Theme } from '../../lib/theme';

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'day', label: 'Day', icon: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8' },
  { value: 'night', label: 'Night', icon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' },
  { value: 'system', label: 'Follow the system', icon: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18' },
];

/** Day, Night, or follow the system: a three-way switch with a sun, a moon and a half-and-half disc. */
export function ThemeSwitch({ compact }: { compact?: boolean }) {
  const theme = useTheme();
  return (
    <div className={`k-theme ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={theme === o.value} aria-label={o.label} title={o.label} onClick={() => setTheme(o.value)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill={o.value === 'night' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={o.icon} />
            {o.value === 'system' && <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />}
          </svg>
        </button>
      ))}
    </div>
  );
}
