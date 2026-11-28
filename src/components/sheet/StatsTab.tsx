import type { MouseEvent } from 'react';
import { knownSpells, type Character } from '../../lib/character';
import { modeFromEvent, useDice } from '../../lib/dice';
import { ABILITY_NAMES, fmt } from '../../lib/rules';
import { linkTo } from '../../lib/router';
import type { PlayApi } from '../../hooks/usePlayState';
import type { InventoryApi } from '../../hooks/useInventory';
import { useEquipmentInfo, useSpellInfo } from '../../hooks/useSpellInfo';
import { cachedSpellLevel } from '../../lib/api';
import { SchoolIcon } from '../SchoolIcon';
import { Coin, Parchment } from '../kit';

/** "1d6 bludgeoning" → dice and the rest; null when it isn't dice. */
const parseDamage = (s: string | undefined) => {
  const m = /^(\d+)d(\d+)\s*(.*)$/.exec(s?.trim() ?? '');
  return m ? { count: Number(m[1]), sides: Number(m[2]), type: m[3] } : null;
};

/** The Stats tab: ability coins with their check and save, skills and senses, actions, and today's spells. */
export function StatsTab({ c, play, inventory, characterId }: { c: Character; play: PlayApi; inventory: InventoryApi; characterId: number }) {
  const { roll } = useDice();
  const r = (label: string, mod: number) => (e: MouseEvent) => roll(label, 20, 1, mod, modeFromEvent(e));
  const skill = (name: string) => c.skills.find((s) => s.name === name)?.bonus ?? 0;

  return (
    <div className="k-stats">
      <Parchment as="section" gilt corners="top" className="k-card k-abilities" aria-labelledby="k-abilities-h">
        <h2 id="k-abilities-h" className="k-h2">Abilities <span className="k-h2-hint">click a coin to roll its check · Shift advantage, Alt disadvantage</span></h2>
        <div className="k-coins">
          {c.abilities.map((a) => {
            const name = ABILITY_NAMES[a.key];
            const bonus = a.score - a.base;
            return (
              <div className="k-ability" key={a.key}>
                <Coin
                  value={fmt(a.mod)}
                  score={a.score}
                  ribbon={name}
                  proficient={a.saveProf}
                  onClick={r(`${name} check`, a.mod)}
                  ariaLabel={`Roll a ${name} check, ${fmt(a.mod)}`}
                  title={`${name} ${a.score} · base ${a.base}${bonus ? ` + ${bonus} background` : ''}`}
                />
                <span className="k-rolls">
                  <button onClick={r(`${name} check`, a.mod)} aria-label={`${name} check ${fmt(a.mod)}`}>Check <b>{fmt(a.mod)}</b></button>
                  <button className={a.saveProf ? 'pr' : ''} onClick={r(`${name} save`, a.save)} aria-label={`${name} save ${fmt(a.save)}${a.saveProf ? ', proficient' : ''}`}>
                    Save <b>{fmt(a.save)}</b>
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        {c.features.some((f) => f.name === 'Gnome Cunning') && <p className="k-hint">Gnome Cunning: advantage on Intelligence, Wisdom and Charisma saves against magic.</p>}
      </Parchment>

      <Parchment as="section" gilt className="k-card" aria-labelledby="k-skills-h">
        <h2 id="k-skills-h" className="k-h2">Skills</h2>
        <ul className="k-rows">
          {c.skills.map((s) => (
            <li key={s.name}>
              <button className="k-row" title={s.source ? `Proficient (${s.source})` : undefined} onClick={r(s.name, s.bonus)}>
                <span className={`k-gem ${s.proficient ? 'on' : ''}`} aria-label={s.proficient ? 'proficient' : undefined} role={s.proficient ? 'img' : undefined} />
                <span className="k-row-name">{s.name} <small>{s.ability}</small></span>
                <span className="k-row-val">{fmt(s.bonus)}</span>
              </button>
            </li>
          ))}
        </ul>
        <h3 className="k-h3">Senses</h3>
        <dl className="k-senses">
          <div><dt>Passive Perception</dt><dd>{10 + skill('Perception')}</dd></div>
          <div><dt>Passive Insight</dt><dd>{10 + skill('Insight')}</dd></div>
          <div><dt>Passive Investigation</dt><dd>{10 + skill('Investigation')}</dd></div>
        </dl>
      </Parchment>

      <div className="k-stack">
        <Actions c={c} inventory={inventory} />
        <TodaysSpells c={c} play={play} characterId={characterId} />
      </div>
    </div>
  );
}

/** Equipped weapons (attack and damage) and an unarmed strike. Proficiency with the weapon is assumed. */
function Actions({ c, inventory }: { c: Character; inventory: InventoryApi }) {
  const { roll } = useDice();
  const equipped = inventory.inv.items.filter((i) => i.equipped && i.qty > 0);
  const info = useEquipmentInfo(equipped.map((i) => i.name));
  const weapons = equipped
    .map((i) => ({ item: i, stats: info.get(i.name) }))
    .filter((w) => !!parseDamage(w.stats?.damage ?? undefined));
  const unarmed = 1 + c.mods.STR;

  return (
    <Parchment as="section" gilt className="k-card" aria-labelledby="k-actions-h">
      <h2 id="k-actions-h" className="k-h2">Actions</h2>
      <ul className="k-rows">
        {weapons.map(({ item, stats }) => {
          const props = stats?.properties ?? [];
          const ranged = props.some((p) => /ammunition/i.test(p));
          const finesse = props.some((p) => /finesse/i.test(p));
          const abil = ranged ? c.mods.DEX : finesse ? Math.max(c.mods.STR, c.mods.DEX) : c.mods.STR;
          const attack = abil + c.profBonus;
          const dmg = parseDamage(stats?.damage)!;
          return (
            <li key={item.id} className="k-action">
              <span className="k-row-name">
                <strong>{item.name}</strong> <small>{dmg.type}{props.length ? ` · ${props.join(', ')}` : ''}</small>
              </span>
              <button className="btn ghost small" onClick={(e) => roll(`${item.name} attack`, 20, 1, attack, modeFromEvent(e))} aria-label={`${item.name} attack roll ${fmt(attack)}`}>
                {fmt(attack)}
              </button>
              <button className="btn small" onClick={() => roll(`${item.name} damage`, dmg.sides, dmg.count, abil)}>
                {dmg.count}d{dmg.sides}{abil ? fmt(abil) : ''}
              </button>
            </li>
          );
        })}
        <li className="k-action">
          <span className="k-row-name"><strong>Unarmed strike</strong> <small>bludgeoning</small></span>
          <button className="btn ghost small" onClick={(e) => roll('Unarmed strike', 20, 1, c.mods.STR + c.profBonus, modeFromEvent(e))} aria-label={`Unarmed strike attack roll ${fmt(c.mods.STR + c.profBonus)}`}>
            {fmt(c.mods.STR + c.profBonus)}
          </button>
          <span className="k-action-flat">{Math.max(1, unarmed)} damage</span>
        </li>
      </ul>
      {weapons.length === 0 && <p className="k-hint">Equip a weapon under Inventory to see its attack here.</p>}
    </Parchment>
  );
}

/** The spells ready today, as chips that open the Spells tab. */
function TodaysSpells({ c, play, characterId }: { c: Character; play: PlayApi; characterId: number }) {
  const names = knownSpells(c, play.state).map((s) => s.name);
  const info = useSpellInfo(names);
  const spells = knownSpells(c, play.state, (n) => info.get(n)?.level ?? cachedSpellLevel(c.classKey, n));
  if (!spells.length) return null;
  const cantrips = spells.filter((s) => s.level === 0);
  const leveled = spells.filter((s) => s.level > 0);
  const chip = (name: string) => {
    const school = info.get(name)?.school;
    return (
      <li key={name}>
        <a className="k-spell-chip" {...linkTo(`/c/${characterId}/spells`)}>
          {school && <SchoolIcon school={school} />}
          {name}
        </a>
      </li>
    );
  };
  return (
    <Parchment as="section" gilt className="k-card" aria-labelledby="k-today-h">
      <h2 id="k-today-h" className="k-h2">Today’s spells</h2>
      {cantrips.length > 0 && (
        <>
          <h3 className="k-h3">Cantrips</h3>
          <ul className="k-spell-chips">{cantrips.map((s) => chip(s.name))}</ul>
        </>
      )}
      {leveled.length > 0 && (
        <>
          <h3 className="k-h3">Prepared</h3>
          <ul className="k-spell-chips">{leveled.map((s) => chip(s.name))}</ul>
        </>
      )}
    </Parchment>
  );
}
