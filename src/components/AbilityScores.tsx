import type { Character } from '../lib/character';
import { modeFromEvent, useDice } from '../lib/dice';
import { ABILITY_NAMES, fmt } from '../lib/rules';

export function AbilityScores({ c }: { c: Character }) {
  const { roll } = useDice();
  return (
    <section className="card">
      <h2>Abilities</h2>
      <div className="abilities">
        {c.abilities.map((a) => {
          const bonus = a.score - a.base;
          return (
            <button
              key={a.key}
              className="ability"
              title={`${ABILITY_NAMES[a.key]} check · base ${a.base}${bonus ? ` + ${bonus} background` : ''}`}
              onClick={(e) => roll(`${ABILITY_NAMES[a.key]} check`, 20, 1, a.mod, modeFromEvent(e))}
            >
              <span className="ability-key">{a.key}</span>
              <span className="ability-mod">{fmt(a.mod)}</span>
              <span className="ability-score">
                {a.score}
                {bonus > 0 && <sup>+{bonus}</sup>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="hint">Click to roll · Shift = advantage · Alt = disadvantage</p>
    </section>
  );
}
