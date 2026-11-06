import { useState } from 'react';
import type { Character } from '../lib/character';
import { modeFromEvent, useDice } from '../lib/dice';
import { CONDITIONS, type PlayApi } from '../hooks/usePlayState';
import { armorClassFrom, fmt } from '../lib/rules';
import type { InventoryApi } from '../hooks/useInventory';

export function CombatStats({ c, play, inventory }: { c: Character; play: PlayApi; inventory: InventoryApi }) {
  const { roll } = useDice();
  const { state } = play;
  const [amount, setAmount] = useState('');
  const n = Math.max(0, parseInt(amount, 10) || 0);
  const pct = Math.round((state.hp / c.hitPoints) * 100);
  const hitDiceLeft = c.level - state.hitDiceUsed;
  const ac = armorClassFrom(inventory.inv.items, c.mods.DEX, c.armorClass);

  const spendHitDie = () => {
    if (hitDiceLeft <= 0) return;
    const r = roll('Hit die (short rest)', c.rules.hitDie, 1, c.mods.CON);
    play.heal(Math.max(0, r.total));
    play.update((s) => ({ hitDiceUsed: s.hitDiceUsed + 1 }), { type: 'rest', summary: `Spent a hit die (rolled ${r.total})` });
  };

  return (
    <section className="card">
      <h2>Combat</h2>
      <div className="stat-boxes">
        <div className="stat"><span className="stat-label">AC</span><span className="stat-val">{ac.value}</span></div>
        <button className="stat" onClick={(e) => roll('Initiative', 20, 1, c.initiative, modeFromEvent(e))}>
          <span className="stat-label">Initiative</span><span className="stat-val">{fmt(c.initiative)}</span>
        </button>
        <div className="stat"><span className="stat-label">Speed</span><span className="stat-val">{c.speed} ft</span></div>
        <div className="stat"><span className="stat-label">Hit dice</span><span className="stat-val">{hitDiceLeft}/{c.level}<small>d{c.rules.hitDie}</small></span></div>
      </div>
      <p className="hint">AC from {ac.source}. Make armor or a shield active under Equipment to update it.</p>

      <div className="hp">
        <div className="hp-top">
          <span className="hp-num">{state.hp}<small> / {c.hitPoints}</small></span>
          {state.tempHp > 0 && <span className="temp">+{state.tempHp} temp</span>}
        </div>
        <div className="bar"><div className={`bar-fill ${pct <= 30 ? 'low' : ''}`} style={{ width: `${pct}%` }} /></div>
        <div className="hp-controls">
          <input type="number" min="0" inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
          <button className="btn danger" disabled={!n} onClick={() => { play.damage(n); setAmount(''); }}>Damage</button>
          <button className="btn" disabled={!n} onClick={() => { play.heal(n); setAmount(''); }}>Heal</button>
          <button className="btn ghost" onClick={() => { play.setTemp(n); setAmount(''); }}>Set temp</button>
        </div>
      </div>

      {state.hp === 0 && (
        <div className="death">
          <span>Death saves</span>
          <Track label="✓" count={state.deathSaves.success} onSet={(v) => play.update((s) => ({ deathSaves: { ...s.deathSaves, success: v } }), (_, b) => ({ type: 'condition', summary: `Death saves: ${b.deathSaves.success} ✓ / ${b.deathSaves.fail} ✗` }))} />
          <Track label="✗" count={state.deathSaves.fail} onSet={(v) => play.update((s) => ({ deathSaves: { ...s.deathSaves, fail: v } }), (_, b) => ({ type: 'condition', summary: `Death saves: ${b.deathSaves.success} ✓ / ${b.deathSaves.fail} ✗` }))} />
          <button className="btn ghost" onClick={() => roll('Death save', 20)}>Roll</button>
        </div>
      )}

      {state.concentration && (
        <div className="concentration">
          Concentrating on <strong>{state.concentration}</strong>
          <button className="btn ghost small" onClick={() => roll('Concentration (CON save)', 20, 1, c.abilities[2].save)}>CON save</button>
          <button className="btn ghost small" onClick={() => play.update(() => ({ concentration: null }), { type: 'spells', summary: `Ended concentration on ${state.concentration}` })}>End</button>
        </div>
      )}

      <details className="conditions">
        <summary>Conditions {state.conditions.length > 0 && <span className="badge">{state.conditions.join(', ')}</span>}</summary>
        <div className="chips">
          {CONDITIONS.map((name) => (
            <button key={name} className={`chip ${state.conditions.includes(name) ? 'on' : ''}`} onClick={() => play.toggleCondition(name)}>{name}</button>
          ))}
        </div>
      </details>

      <div className="rest">
        <button className="btn ghost" disabled={hitDiceLeft <= 0 || state.hp >= c.hitPoints} onClick={spendHitDie}>Short rest: spend hit die</button>
        <button className="btn" onClick={play.longRest}>Long rest</button>
      </div>
    </section>
  );
}

function Track({ label, count, onSet }: { label: string; count: number; onSet: (v: number) => void }) {
  return (
    <span className="track">
      {[1, 2, 3].map((i) => (
        <button key={i} className={`dot ${i <= count ? 'on' : ''}`} onClick={() => onSet(i === count ? i - 1 : i)} aria-label={`${label} ${i}`}>{label}</button>
      ))}
    </span>
  );
}
