import type { ReactNode } from 'react';
import { Parchment } from './Parchment';

/** A brass plaque hanging on two chains, for naming a group (a campaign). */
export function Plaque({ title, subtitle, id }: { title: ReactNode; subtitle?: ReactNode; id?: string }) {
  return (
    <div className="k-plaque-wrap">
      <span className="k-chain" style={{ left: 'calc(50% - 90px)' }} aria-hidden="true" />
      <span className="k-chain" style={{ left: 'calc(50% + 88px)' }} aria-hidden="true" />
      <div className="k-plaque">
        <span className="k-rivet" style={{ left: 10 }} aria-hidden="true" />
        <span className="k-rivet" style={{ right: 10 }} aria-hidden="true" />
        <h2 id={id}>{title}</h2>
        {subtitle && <small>{subtitle}</small>}
      </div>
    </div>
  );
}

/** A page title on a parchment plaque: nothing is written straight on the stone. */
export function ParchmentPlaque({ title, subtitle, level = 1, children }: { title: ReactNode; subtitle?: ReactNode; level?: 1 | 2; children?: ReactNode }) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <Parchment gilt className="k-pplaque">
      <H>{title}</H>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </Parchment>
  );
}
