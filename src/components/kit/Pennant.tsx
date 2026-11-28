import type { ReactNode } from 'react';

/** The swallowtail banner in the class colour, with the class emblem stitched on. */
export function Pennant({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <span className={`k-pennant ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}
