import type { CSSProperties, MouseEvent, ReactNode } from 'react';

type Props = {
  /** The big number in the middle (a modifier). */
  value: ReactNode;
  /** The small number on the diamond (a score). */
  score?: ReactNode;
  /** The name on the ribbon. */
  ribbon: string;
  /** Class-coloured ribbon and inner ring (a proficient save). */
  proficient?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  title?: string;
  /** Diameter in px (default 132). */
  size?: number;
};

/** A number minted on a gilt medallion, its name on a ribbon. A button when it rolls. */
export function Coin({ value, score, ribbon, proficient, onClick, ariaLabel, title, size }: Props) {
  const className = `k-coin ${proficient ? 'proficient' : ''}`;
  const style = size ? ({ '--coin': `${size}px` } as CSSProperties) : undefined;
  const inner = (
    <>
      <span className="k-coin-face" />
      <span className="k-coin-value">{value}</span>
      {score !== undefined && (
        <span className="k-coin-score">
          <b>{score}</b>
        </span>
      )}
      <span className="k-ribbon">{ribbon}</span>
      <span className="k-coin-shine" />
    </>
  );
  return (
    <span className="k-coin-wrap">
      {onClick ? (
        <button type="button" className={className} style={style} onClick={onClick} aria-label={ariaLabel} title={title}>
          {inner}
        </button>
      ) : (
        <span className={className} style={style} role="img" aria-label={ariaLabel} title={title}>
          {inner}
        </span>
      )}
    </span>
  );
}
