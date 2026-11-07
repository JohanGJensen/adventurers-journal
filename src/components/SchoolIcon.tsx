import type { ReactNode } from 'react';

/** Glyphs for the eight schools of magic, on a 24×24 grid in the current text colour. */
const GLYPHS: Record<string, ReactNode> = {
  // Warding shield with a rune
  abjuration: (
    <>
      <path d="M12 3l7 2.5V11c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V5.5Z" />
      <path d="M12 8v8M9.5 10.5L12 8l2.5 2.5" />
    </>
  ),
  // Swirling portal
  conjuration: (
    <>
      <ellipse cx="12" cy="12" rx="8" ry="9" />
      <path d="M12 7.5c2.8 0 4 2 4 4.2 0 2.6-2 4.3-4.3 4.3-2 0-3.4-1.4-3.4-3.3 0-1.7 1.2-2.9 2.8-2.9 1.3 0 2.2.9 2.2 2" />
    </>
  ),
  // All-seeing eye
  divination: (
    <>
      <path d="M2.5 12C5 7.5 8.3 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-5.8 6.5-9.5 6.5S5 16.5 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r=".6" fill="currentColor" />
    </>
  ),
  // Heart with a spiral
  enchantment: (
    <>
      <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
      <path d="M12 11c1.1 0 1.6.8 1.6 1.5 0 .9-.8 1.6-1.7 1.6-1.2 0-2-1-2-2.1 0-1.5 1.3-2.5 2.6-2.5" />
    </>
  ),
  // Flame burst
  evocation: (
    <>
      <path d="M12 21c-4 0-6.5-2.8-6.5-6.2 0-3.6 3-5.3 3.5-9.3 2 1.3 3 3 3 5 1-1 1.5-2.4 1.3-4 3 2.3 5.2 5.2 5.2 8.3 0 3.4-2.5 6.2-6.5 6.2Z" />
      <path d="M12 21c-1.8 0-3-1.2-3-3 0-1.8 1.6-2.7 2.2-4.5 2 1.2 3.8 2.6 3.8 4.5 0 1.8-1.2 3-3 3Z" />
    </>
  ),
  // Theatre mask
  illusion: (
    <>
      <path d="M4 5c5 1.5 11 1.5 16 0v6c0 5-3.6 9-8 9s-8-4-8-9Z" />
      <path d="M7.5 10.5c.8-.8 2.2-.8 3 0M13.5 10.5c.8-.8 2.2-.8 3 0" />
      <path d="M9 15c1.8 1.4 4.2 1.4 6 0" />
    </>
  ),
  // Skull
  necromancy: (
    <>
      <path d="M12 3c-4.4 0-7.5 3-7.5 7 0 2.3 1 4 2.5 5v3h2v-2h1.5v2h3v-2H15v2h2v-3c1.5-1 2.5-2.7 2.5-5 0-4-3.1-7-7.5-7Z" />
      <circle cx="9" cy="10.5" r="1.6" />
      <circle cx="15" cy="10.5" r="1.6" />
      <path d="M12 13l-.8 1.5h1.6Z" />
    </>
  ),
  // Alchemical triangle and circle
  transmutation: (
    <>
      <path d="M12 3.5l8.5 15h-17Z" />
      <circle cx="12" cy="13.5" r="3" />
      <path d="M12 3.5v7" />
    </>
  ),
};

/** A plain spark for unknown or not-yet-loaded schools. */
const FALLBACK = <path d="M12 4v16M4 12h16M7 7l10 10M17 7L7 17" />;

export function SchoolIcon({ school, className = 'school-icon' }: { school: string | null | undefined; className?: string }) {
  const key = school?.trim().toLowerCase() ?? '';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={school ? `${school} spell` : 'Spell'}
    >
      <title>{school || 'Spell'}</title>
      {GLYPHS[key] ?? FALLBACK}
    </svg>
  );
}
