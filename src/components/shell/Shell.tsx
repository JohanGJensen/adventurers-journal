import type { ReactNode } from 'react';
import { Embers } from '../kit';
import { Sidebar, type ShellPage } from './Sidebar';

/**
 * The frame of every character page: the parchment sidebar beside the page, embers drifting up the wall behind.
 * `compact` folds the sidebar to its icon rail on laptops too (the Notes reader needs the width).
 */
export function Shell({ characterId, current, compact, children }: { characterId: number; current: ShellPage; compact?: boolean; children: ReactNode }) {
  return (
    <div className={`k-shell ${compact ? 'compact' : ''}`}>
      <Embers />
      <Sidebar characterId={characterId} current={current} />
      <div className="k-shell-main">{children}</div>
    </div>
  );
}
