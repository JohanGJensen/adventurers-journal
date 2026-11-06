import { knownSpells, type Character } from '../lib/character';
import type { PlayApi } from '../hooks/usePlayState';
import type { SpellEntry } from '../data/supplement';
import { useDice } from '../lib/dice';
import { fmt } from '../lib/rules';
import { cachedSpellLevel } from '../lib/api';
import { useSpellInfo } from '../hooks/useSpellInfo';

/** Used until the spell's SRD details have loaded. */
const CONCENTRATION_FALLBACK = new Set(['Entangle', 'Guidance', 'Resistance']);

export function SpellList({
  c,
  play,
  onOpen,
  onBrowse,
}: {
  c: Character;
  play: PlayApi;
  onOpen: (name: string) => void;
  onBrowse: () => void;
}) {
  const { roll } = useDice();
  const { state } = play;
  const spells = knownSpells(c, state, (n) => cachedSpellLevel('druid', n));
  const info = useSpellInfo(spells.map((s) => s.name));
  const isConc = (name: string) => info.get(name)?.concentration ?? CONCENTRATION_FALLBACK.has(name);

  const cantrips = spells.filter((s) => s.level === 0);
  const levels = [...new Set(spells.filter((s) => s.level > 0).map((s) => s.level))].sort((a, b) => a - b);

  const cast = (s: SpellEntry, useMagicInitiate = false) => {
    if (s.level > 0) {
      if (useMagicInitiate) play.update(() => ({ goodberryUsed: true }));
      else play.useSlot(s.level);
    }
    if (isConc(s.name)) play.update(() => ({ concentration: s.name }));
  };

  const slotsLeft = (lvl: number) => (c.slots[lvl - 1] ?? 0) - (state.slotsUsed[lvl - 1] ?? 0);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Spellcasting</h2>
        <button className="btn ghost small" onClick={onBrowse}>Browse spells</button>
      </div>
      <div className="stat-boxes">
        <div className="stat"><span className="stat-label">Ability</span><span className="stat-val">{c.spellAbility}</span></div>
        <div className="stat"><span className="stat-label">Save DC</span><span className="stat-val">{c.spellSaveDC}</span></div>
        <button className="stat" onClick={() => roll('Spell attack', 20, 1, c.spellAttack)}>
          <span className="stat-label">Attack</span><span className="stat-val">{fmt(c.spellAttack)}</span>
        </button>
      </div>

      {c.slots.map((total, i) => (
        <div className="slots" key={i}>
          <span>Level {i + 1} slots</span>
          <span className="slot-pips">
            {Array.from({ length: total }, (_, j) => {
              const used = j < (state.slotsUsed[i] ?? 0);
              return (
                <button
                  key={j}
                  className={`slot ${used ? 'used' : ''}`}
                  onClick={() => (used ? play.restoreSlot(i + 1) : play.useSlot(i + 1))}
                  aria-label={used ? 'Restore slot' : 'Use slot'}
                />
              );
            })}
          </span>
        </div>
      ))}

      <h3>Cantrips <small>{state.chosenCantrips.length}/{c.cantripCap} chosen</small></h3>
      <ul className="spells">
        {cantrips.map((s) => (
          <SpellRow key={s.name} s={s} onOpen={onOpen} active={state.concentration === s.name}>
            {isConc(s.name) && <button className="btn ghost small" onClick={() => cast(s)}>Cast</button>}
          </SpellRow>
        ))}
      </ul>

      {levels.map((lvl) => (
        <div key={lvl}>
          <h3>Level {lvl} {lvl === 1 && <small>{state.prepared.length}/{c.preparedCap} prepared</small>}</h3>
          <ul className="spells">
            {spells
              .filter((s) => s.level === lvl)
              .map((s) => {
                const mi = s.source === 'Magic Initiate';
                return (
                  <SpellRow key={s.name} s={s} onOpen={onOpen} active={state.concentration === s.name}>
                    {mi && (
                      <button className="btn ghost small" disabled={state.goodberryUsed} onClick={() => cast(s, true)} title="Magic Initiate: once per long rest without a slot">
                        {state.goodberryUsed ? 'Free cast used' : 'Free cast'}
                      </button>
                    )}
                    <button className="btn small" disabled={slotsLeft(s.level) <= 0} onClick={() => cast(s)}>Cast (slot)</button>
                  </SpellRow>
                );
              })}
          </ul>
        </div>
      ))}
      {state.prepared.length < c.preparedCap && (
        <p className="hint">
          You can prepare {c.preparedCap - state.prepared.length} more spell{c.preparedCap - state.prepared.length === 1 ? '' : 's'}.{' '}
          <button className="link" onClick={onBrowse}>Choose spells</button>
        </p>
      )}
    </section>
  );
}

function SpellRow({ s, onOpen, active, children }: { s: SpellEntry; onOpen: (n: string) => void; active: boolean; children?: React.ReactNode }) {
  return (
    <li className={`spell ${active ? 'active' : ''}`}>
      <button className="link" onClick={() => onOpen(s.name)}>{s.name}</button>
      <span className={`src src-${s.source.replace(/\s/g, '').toLowerCase()}`}>{s.source}</span>
      <span className="spell-actions">{children}</span>
    </li>
  );
}
