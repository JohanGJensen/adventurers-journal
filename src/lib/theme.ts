// The theme the user picked: Day, Night, or whatever the system says. Stored in localStorage and applied as
// <html data-theme="day|night"> (absent for system); the stylesheet's night rules follow it (see
// scripts/build/themeSwitch.ts). public/theme-boot.js applies it before the first paint.
import { useSyncExternalStore } from 'react';

export type Theme = 'day' | 'night' | 'system';
const KEY = 'aj.theme';
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY);
  return t === 'day' || t === 'night' ? t : 'system';
}

export function setTheme(t: Theme) {
  if (t === 'system') {
    localStorage.removeItem(KEY);
    delete document.documentElement.dataset.theme;
  } else {
    localStorage.setItem(KEY, t);
    document.documentElement.dataset.theme = t;
  }
  listeners.forEach((l) => l());
}

export const useTheme = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getTheme,
  );
