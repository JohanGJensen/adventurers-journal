import type { ElementType, HTMLAttributes, ReactNode } from 'react';

const Corner = ({ at }: { at: 'tl' | 'tr' | 'bl' | 'br' }) => (
  <svg className={`k-corner ${at}`} aria-hidden="true" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
    <path d="M4 36V10a6 6 0 0 1 6-6h26" />
    <path d="M9 30c0-10 5-17 17-21" />
    <circle cx="9" cy="9" r="2.5" fill="currentColor" />
  </svg>
);

type Props = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  /** A hairline gilt rule just inside the edge. */
  gilt?: boolean;
  /** Gilt filigree in the corners: the top two, or all four. */
  corners?: 'top' | 'all';
  children?: ReactNode;
};

/** The surface everything readable sits on: textured paper hung on the stone. */
export function Parchment({ as: Tag = 'div', gilt, corners, className = '', children, ...rest }: Props) {
  return (
    <Tag className={`k-parch ${gilt ? 'k-gilt' : ''} ${className}`} {...rest}>
      {corners && (
        <>
          <Corner at="tl" />
          <Corner at="tr" />
          {corners === 'all' && (
            <>
              <Corner at="bl" />
              <Corner at="br" />
            </>
          )}
        </>
      )}
      {children}
    </Tag>
  );
}
