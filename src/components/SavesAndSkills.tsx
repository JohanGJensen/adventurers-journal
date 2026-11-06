import type { Character } from '../lib/character';
import { modeFromEvent, useDice } from '../lib/dice';
import { ABILITY_NAMES, fmt } from '../lib/rules';

export function SavesAndSkills({ c }: { c: Character }) {
  const { roll } = useDice();
  return (
    <section className="card">
      <h2>Saving Throws</h2>
      <ul className="rows">
        {c.abilities.map((a) => (
          <li key={a.key}>
            <button className="row" onClick={(e) => roll(`${ABILITY_NAMES[a.key]} save`, 20, 1, a.save, modeFromEvent(e))}>
              <span className={`pip ${a.saveProf ? 'on' : ''}`} />
              <span className="row-name">{ABILITY_NAMES[a.key]}</span>
              <span className="row-val">{fmt(a.save)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">Gnome Cunning: advantage on INT, WIS and CHA saves against magic.</p>

      <h2>Skills</h2>
      <ul className="rows">
        {c.skills.map((s) => (
          <li key={s.name}>
            <button
              className="row"
              title={s.source ? `Proficient (${s.source})` : undefined}
              onClick={(e) => roll(s.name, 20, 1, s.bonus, modeFromEvent(e))}
            >
              <span className={`pip ${s.proficient ? 'on' : ''}`} />
              <span className="row-name">
                {s.name} <small>{s.ability}</small>
              </span>
              <span className="row-val">{fmt(s.bonus)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">Passive Perception {10 + (c.skills.find((s) => s.name === 'Perception')?.bonus ?? 0)}</p>
    </section>
  );
}
