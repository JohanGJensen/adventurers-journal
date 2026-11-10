import { useEffect } from 'react';
import type { Character } from '../lib/character';
import type { PlayApi } from '../hooks/usePlayState';
import { SpellPicker, useSpellFilters } from './SpellPicker';

export function SpellBrowser({
  c,
  play,
  open,
  onClose,
  onOpenSpell,
  covered = false,
}: {
  c: Character;
  play: PlayApi;
  open: boolean;
  onClose: () => void;
  onOpenSpell: (name: string) => void;
  /** another dialog (the detail drawer) is on top; let it handle Esc */
  covered?: boolean;
}) {
  const filters = useSpellFilters();
  const { state } = play;

  useEffect(() => {
    if (!open || covered) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, covered, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="scrim browser-scrim" onClick={onClose} />
      <div className="browser tome" role="dialog" aria-label={`${c.className} spells`}>
        <header className="browser-head">
          <div>
            <h2>{c.className} spells</h2>
            <p className="muted small-print">
              Level {c.level} · spells up to level {c.maxSpellLevel}
            </p>
          </div>
          <SpellCounters c={c} chosenCantrips={state.chosenCantrips} prepared={state.prepared} />
          <button className="close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <SpellPicker
          c={c}
          chosenCantrips={state.chosenCantrips}
          prepared={state.prepared}
          onToggleCantrip={play.toggleCantrip}
          onTogglePrepared={play.togglePrepared}
          onOpenSpell={onOpenSpell}
          filters={filters}
        />
      </div>
    </>
  );
}

export function SpellCounters({ c, chosenCantrips, prepared }: { c: Character; chosenCantrips: string[]; prepared: string[] }) {
  return (
    <div className="counters">
      <span className={`counter ${chosenCantrips.length >= c.cantripCap ? 'full' : ''}`}>
        Cantrips <strong>{chosenCantrips.length}/{c.cantripCap}</strong>
      </span>
      <span className={`counter ${prepared.length >= c.preparedCap ? 'full' : ''}`}>
        Prepared <strong>{prepared.length}/{c.preparedCap}</strong>
      </span>
    </div>
  );
}
