import type { ReactNode } from 'react';

/** Heraldic charges for the 12 SRD classes, drawn on a 24×24 grid in the current text colour. */
const CHARGES: Record<string, ReactNode> = {
  // Oak leaf
  druid: (
    <>
      <path d="M12 21V8" />
      <path d="M12 4c-2 1-3 2.5-2.5 4C8 7.5 6.5 8 6 9.5c1.5.5 2.5 1.5 2.5 3-1.5 0-3 .8-3.2 2.3 2 .7 4.4.2 6.7-1.8 2.3 2 4.7 2.5 6.7 1.8-.2-1.5-1.7-2.3-3.2-2.3 0-1.5 1-2.5 2.5-3-.5-1.5-2-2-3.5-1.5.5-1.5-.5-3-2.5-4Z" />
    </>
  ),
  // Eight-pointed star over a crescent
  wizard: (
    <>
      <path d="M12 3l1.6 4.4L18 6l-1.4 4.4L21 12l-4.4 1.6L18 18l-4.4-1.4L12 21l-1.6-4.4L6 18l1.4-4.4L3 12l4.4-1.6L6 6l4.4 1.4Z" />
      <circle cx="12" cy="12" r="2.2" />
    </>
  ),
  // Radiant sun
  cleric: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  // Crossed swords
  fighter: (
    <>
      <path d="M5 4l10.5 10.5M19 4L8.5 14.5" />
      <path d="M13.5 16.5l4-4M10.5 16.5l-4-4" />
      <path d="M16 17l3 3M8 17l-3 3" />
    </>
  ),
  // Dagger, point down
  rogue: (
    <>
      <path d="M12 21l-2-6V7h4v8Z" />
      <path d="M7 7h10M12 7V3.5" />
      <circle cx="12" cy="3" r=".8" />
    </>
  ),
  // Drawn bow and arrow
  ranger: (
    <>
      <path d="M6 3c7 3 7 15 0 18" />
      <path d="M6 3v18" strokeDasharray="1.5 1" />
      <path d="M4 12h16M17 9.5l3 2.5-3 2.5" />
    </>
  ),
  // Heater shield with a cross
  paladin: (
    <>
      <path d="M12 3l7 2.5V11c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V5.5Z" />
      <path d="M12 7v10M8.5 11h7" />
    </>
  ),
  // Double-bitted axe
  barbarian: (
    <>
      <path d="M12 3v18" />
      <path d="M12 6c-3-2-6-1.5-7.5 0 1 2 1 4 0 6 1.5 1.5 4.5 2 7.5 0" />
      <path d="M12 6c3-2 6-1.5 7.5 0-1 2-1 4 0 6-1.5 1.5-4.5 2-7.5 0" />
    </>
  ),
  // Lyre
  bard: (
    <>
      <path d="M7 4c-2 3-2 7 1 10h8c3-3 3-7 1-10" />
      <path d="M8 14l1 4h6l1-4M7 18h10" />
      <path d="M10.5 6.5v7.5M13.5 6.5v7.5M9 6.5h6" />
    </>
  ),
  // Yin-yang style balance circle
  monk: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a4.25 4.25 0 0 1 0 8.5 4.25 4.25 0 0 0 0 8.5" />
      <circle cx="12" cy="7.75" r="1" />
      <circle cx="12" cy="16.25" r="1" />
    </>
  ),
  // Flame
  sorcerer: (
    <>
      <path d="M12 21c-4 0-6.5-2.8-6.5-6.2 0-3.6 3-5.3 3.5-9.3 2 1.3 3 3 3 5 1-1 1.5-2.4 1.3-4 3 2.3 5.2 5.2 5.2 8.3 0 3.4-2.5 6.2-6.5 6.2Z" />
      <path d="M12 21c-1.8 0-3-1.2-3-3 0-1.8 1.6-2.7 2.2-4.5 2 1.2 3.8 2.6 3.8 4.5 0 1.8-1.2 3-3 3Z" />
    </>
  ),
  // Eldritch eye
  warlock: (
    <>
      <path d="M2.5 12C5 7.5 8.3 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-5.8 6.5-9.5 6.5S5 16.5 2.5 12Z" />
      <path d="M12 8.5c1.2 1 1.2 6 0 7-1.2-1-1.2-6 0-7Z" />
      <path d="M12 2v2M12 20v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M19.5 4.5l-1.4 1.4M5.9 18.1l-1.4 1.4" />
    </>
  ),
};

/** Crossed keys: the neutral castle charge for unknown classes. */
const FALLBACK = (
  <>
    <circle cx="7" cy="7" r="3" />
    <path d="M9.2 9.2L20 20M17 17l2-2M15 15l1.5-1.5" />
  </>
);

export function ClassEmblem({ classKey, className = 'emblem', title }: { classKey: string | null | undefined; className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {(classKey && CHARGES[classKey]) || FALLBACK}
    </svg>
  );
}
