import type { Character } from '../lib/character';
import { ABILITY_NAMES, fmt } from '../lib/rules';
import { toolRules } from '../data/tools';

/** Tool proficiencies as a table reference: the bonus to roll, each Utilize action's DC, and which skills add advantage. */
export function ToolKit({ c }: { c: Character }) {
  if (!c.tools.length) return null;

  return (
    <section className="card tool-kit">
      <h2>Tools</h2>
      {c.tools.map((t) => {
        const rules = toolRules(t.name);
        const bonus = rules ? c.mods[rules.ability] + c.profBonus : 0;
        const skills = rules ? rules.skills.filter((s) => c.skills.some((k) => k.name === s && k.proficient)) : [];
        return (
          <details key={`${t.name}|${t.source}`} className="feature tool" open={!!rules}>
            <summary>
              {t.name} <small>{t.source}</small>
              {rules && (
                <span className="tool-ability" title={`Roll d20 ${fmt(bonus)}: ${ABILITY_NAMES[rules.ability]} + proficiency`}>
                  {rules.ability} {fmt(bonus)}
                </span>
              )}
            </summary>
            {t.description && <p className="pre">{t.description}</p>}
            {rules && (
              <>
                <ul className="rows tool-uses">
                  {rules.utilize.map((u) => (
                    <li key={u.action} className="row">
                      <span className="tool-dc">DC {u.dc}</span>
                      <span className="row-name">{u.action}</span>
                    </li>
                  ))}
                </ul>
                {skills.length > 0 && (
                  <p className="hint">Advantage when {skills.join(' or ')} also applies (you're proficient).</p>
                )}
                {rules.craft && <p className="hint">Craft: {rules.craft.join(', ')}</p>}
              </>
            )}
          </details>
        );
      })}
    </section>
  );
}
