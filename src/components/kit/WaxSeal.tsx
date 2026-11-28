import type { CSSProperties, ReactNode } from 'react';

type Props = {
  /** red = wax, blue = concentration and magic, green = the class colour. */
  colour?: 'red' | 'blue' | 'green';
  /** What's stamped in the wax: a letter or two. */
  children?: ReactNode;
  /** The seal's accessible name (required when it's a button). */
  label?: string;
  /** For a toggle: pressed seals are full colour and tilted, others greyed. */
  pressed?: boolean;
  onClick?: () => void;
  /** Stamp in with a thud when it appears. */
  stamp?: boolean;
  size?: number;
};

/** A wax seal: a badge, or a toggle when it has onClick. */
export function WaxSeal({ colour = 'red', children, label, pressed, onClick, stamp, size }: Props) {
  const className = `k-seal ${colour === 'red' ? '' : colour} ${stamp ? 'stamp' : ''}`;
  const style = size ? ({ '--seal-size': `${size}px` } as CSSProperties) : undefined;
  if (onClick)
    return (
      <button type="button" className={className} style={style} aria-label={label} aria-pressed={pressed} onClick={onClick}>
        <span aria-hidden="true">{children}</span>
      </button>
    );
  return (
    <span className={className} style={style} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {children}
    </span>
  );
}
