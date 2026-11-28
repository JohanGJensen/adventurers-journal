import { useEffect, useRef, useState } from 'react';
import type { Character } from '../../lib/character';
import { modeFromEvent, useDice } from '../../lib/dice';
import { CONDITIONS, type PlayApi } from '../../hooks/usePlayState';
import type { InventoryApi } from '../../hooks/useInventory';
import { armorClassFrom, fmt, MAX_LEVEL } from '../../lib/rules';
import type { CharacterDto } from '../../shared/types';
import { ClassEmblem } from '../ClassEmblem';
import { PortraitUpload } from '../PortraitUpload';
import { Coin, Parchment, Pennant, Pips, Vial, WaxSeal } from '../kit';

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

type Props = {
  c: Character;
  play: PlayApi;
  inventory: InventoryApi;
  characterId: number;
  onPortraitSaved: (dto: CharacterDto) => void;
  onLevelUp: () => void;
  onUndoLevel?: () => void;
};

/**
 * The top of the sheet: who the character is, and everything you reach for mid-fight (HP, AC, slots, uses,
 * conditions, rests). When it scrolls away, a one-line copy pins to the top of the window.
 */
export function Banner({ c, play, inventory, characterId, onPortraitSaved, onLevelUp, onUndoLevel }: Props) {
  const { roll } = useDice();
  const { state } = play;
  const [amount, setAmount] = useState('');
  const [askVariant, setAskVariant] = useState(false);
  const [menu, setMenu] = useState(false);
  const [addingCondition, setAddingCondition] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const [pinned, setPinned] = useState(false);

  // Pin the one-line copy once the banner's vitals have scrolled out of view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // The ⋯ menu closes on Esc or a click elsewhere.
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest?.('.k-banner-menu')) setMenu(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('mousedown', close);
    };
  }, [menu]);

  const n = Math.max(0, parseInt(amount, 10) || 0);
  const hitDiceLeft = c.level - state.hitDiceUsed;
  const armor = armorClassFrom(inventory.inv.items, c.mods.DEX, c.armorClass);
  const ac = c.acBonus ? { value: armor.value + c.acBonus, source: `${armor.source} ${fmt(c.acBonus)} (${c.subclass?.name})` } : armor;
  const wildLeft = c.wildShapeUses - state.wildShapeUsed;
  const slotRows = c.slots.map((max, i) => ({ level: i + 1, max, left: max - (state.slotsUsed[i] ?? 0) })).filter((r) => r.max > 0);

  const longRest = () => {
    play.longRest();
    if (c.variants) setAskVariant(true);
  };
  const spendHitDie = () => {
    if (hitDiceLeft <= 0) return;
    const r = roll('Hit die (short rest)', c.rules.hitDie, 1, c.mods.CON);
    play.heal(Math.max(0, r.total));
    play.update((s) => ({ hitDiceUsed: s.hitDiceUsed + 1 }), { type: 'rest', summary: `Spent a hit die (rolled ${r.total})` });
  };
  const endConcentration = () =>
    play.update(() => ({ concentration: null }), { type: 'spells', summary: `Ended concentration on ${state.concentration}` });
  const applyAmount = (fn: (n: number) => void) => {
    fn(n);
    setAmount('');
  };

  const portrait = c.portrait ? (
    <img className="k-banner-portrait" src={c.portrait} alt={`Portrait of ${c.name}`} />
  ) : (
    <div className="k-banner-portrait initials" aria-hidden="true">
      {c.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
    </div>
  );

  return (
    <>
      <PinBar c={c} play={play} ac={ac.value} show={pinned} slotRows={slotRows} />
      <Parchment as="header" gilt className="k-banner" ref={ref}>
        <span className="k-banner-stitch" aria-hidden="true" />
        <Pennant className="k-banner-pennant">
          <ClassEmblem classKey={c.classKey} className="emblem" />
        </Pennant>

        <div className="k-banner-who">
          <div className="k-laurel">
            <svg className="k-laurel-wreath" viewBox="0 0 132 132" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M66 124C30 122 10 96 10 64S28 14 50 8" />
              <path d="M66 124c36-2 56-28 56-60S104 14 82 8" />
              <g fill="currentColor" stroke="none">
                {[[14, 88, -60], [10, 66, -85], [14, 44, -115], [27, 25, -140], [28, 108, -30], [118, 88, 60], [122, 66, 85], [118, 44, 115], [105, 25, 140], [104, 108, 30]].map(([x, y, r]) => (
                  <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="9" ry="4" transform={`rotate(${r} ${x} ${y})`} />
                ))}
              </g>
            </svg>
            <PortraitUpload characterId={characterId} name={c.name} hasPortrait={!!c.portrait} onSaved={onPortraitSaved}>
              {portrait}
            </PortraitUpload>
          </div>
          <div className="k-banner-name">
            <h1>{c.name}</h1>
            <p>
              {c.race} · {c.className} {c.level}
              {c.subclass && <> · {c.subclass.name}</>}
            </p>
            <dl className="k-banner-tags">
              <div><dt>Background</dt><dd>{c.background}</dd></div>
              <div title={c.alignmentDescription}><dt>Alignment</dt><dd>{c.alignment}</dd></div>
              <div><dt>Proficiency</dt><dd>+{c.profBonus}</dd></div>
            </dl>
          </div>
          <div className="k-banner-actions">
            <WaxSeal size={58} label="Heroic Inspiration" pressed={state.inspiration} onClick={play.toggleInspiration}>
              IN-<br />SPIRED
            </WaxSeal>
            {c.level < MAX_LEVEL && <button className="btn" onClick={onLevelUp}>Level up to {c.level + 1}</button>}
            <div className="k-banner-menu">
              <button className="btn ghost" aria-label="More: reset play state, undo level" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                ⋯
              </button>
              {menu && (
                <div className="k-menu k-parch" role="menu">
                  <button role="menuitem" onClick={() => { setMenu(false); if (confirm('Reset all play state (HP, slots, conditions)?')) void play.reset(); }}>
                    Reset play state
                  </button>
                  {onUndoLevel && (
                    <button role="menuitem" onClick={() => { setMenu(false); onUndoLevel(); }}>
                      Undo level {c.level}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {(state.concentration || state.hp === 0) && (
          <div className="k-banner-alerts">
            {state.concentration && (
              <span className="k-conc" key={state.concentration}>
                <WaxSeal colour="blue" stamp>C</WaxSeal>
                <span>Concentrating: <strong>{state.concentration}</strong></span>
                <button className="btn ghost small" onClick={() => roll('Concentration (CON save)', 20, 1, c.abilities[2].save)}>CON save</button>
                <button className="k-x" aria-label={`End concentration on ${state.concentration}`} onClick={endConcentration}>×</button>
              </span>
            )}
            {state.hp === 0 && (
              <span className="k-death">
                <span className="k-vl">Death saves</span>
                <Track label="Success" mark="✓" count={state.deathSaves.success} onSet={(v) => play.update((s) => ({ deathSaves: { ...s.deathSaves, success: v } }), (_, b) => ({ type: 'condition', summary: `Death saves: ${b.deathSaves.success} ✓ / ${b.deathSaves.fail} ✗` }))} />
                <Track label="Failure" mark="✗" count={state.deathSaves.fail} onSet={(v) => play.update((s) => ({ deathSaves: { ...s.deathSaves, fail: v } }), (_, b) => ({ type: 'condition', summary: `Death saves: ${b.deathSaves.success} ✓ / ${b.deathSaves.fail} ✗` }))} />
                <button className="btn ghost small" onClick={() => roll('Death save', 20)}>Roll</button>
              </span>
            )}
          </div>
        )}

        <div className="k-vitals">
          <div className="k-hp">
            <div className="k-hp-top">
              <span className="k-vl">Hit points</span>
              <span className="k-hp-n">{state.hp}</span>
              <span className="k-hp-max">/ {c.hitPoints}</span>
              {state.tempHp > 0 && <span className="k-chip blue">+{state.tempHp} temp</span>}
            </div>
            <Vial value={state.hp} max={c.hitPoints} temp={state.tempHp} />
            <div className="k-hp-controls">
              <label className="k-sr" htmlFor="k-hp-amount">Amount</label>
              <input id="k-hp-amount" type="number" min="0" inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className="btn danger small" disabled={!n} onClick={() => applyAmount(play.damage)}>Damage</button>
              <button className="btn small" disabled={!n} onClick={() => applyAmount(play.heal)}>Heal</button>
              <button className="btn ghost small" onClick={() => applyAmount(play.setTemp)}>Set temp</button>
            </div>
          </div>

          <div className="k-crest" role="img" aria-label={`Armour class ${ac.value}`} title={`AC from ${ac.source}. Make armor or a shield active under Inventory to update it.`}>
            <span>
              <span className="k-vl">AC</span>
              <b>{ac.value}</b>
            </span>
          </div>
          <Coin value={fmt(c.initiative)} ribbon="Initiative" size={92} ariaLabel={`Roll initiative, ${fmt(c.initiative)}`} onClick={(e) => roll('Initiative', 20, 1, c.initiative, modeFromEvent(e))} />
          <Coin value={c.speed} ribbon="Speed" size={92} ariaLabel={`Speed ${c.speed} feet`} title={`${c.speed} feet`} />

          <div className="k-box">
            <span className="k-vl">Hit dice</span>
            <span className="k-box-n">
              {hitDiceLeft}<small>/{c.level} d{c.rules.hitDie}</small>
            </span>
            <button className="btn ghost small" disabled={hitDiceLeft <= 0 || state.hp >= c.hitPoints} onClick={spendHitDie}>Spend one</button>
          </div>

          {slotRows.length > 0 && (
            <div className="k-box">
              <span className="k-vl">Spell slots</span>
              {slotRows.map((r) => (
                <span className="k-box-row" key={r.level}>
                  <small>{ORD[r.level - 1]}</small>
                  <Pips total={r.max} filled={r.left} label={`${ORD[r.level - 1]}-level slots: ${r.left} of ${r.max} left`} />
                </span>
              ))}
            </div>
          )}

          {(c.wildShapeUses > 0 || c.resources.length > 0) && (
            <div className="k-box">
              <span className="k-vl">Uses</span>
              {c.wildShapeUses > 0 && (
                <Uses name="Wild Shape" left={wildLeft} max={c.wildShapeUses} onUse={play.useWildShape} onRegain={play.restoreWildShape} />
              )}
              {c.resources.map((r) => (
                <Uses key={r.key} name={r.name} note={`${r.recharge} rest`} left={r.max - (state.resourcesUsed[r.key] ?? 0)} max={r.max} onUse={() => play.useResource(r.key)} onRegain={() => play.restoreResource(r.key)} />
              ))}
            </div>
          )}

          <div className="k-box k-conditions">
            <span className="k-vl">Conditions</span>
            <span className="k-chips">
              {state.conditions.map((name) => (
                <button key={name} className="k-chip red" title={`Remove ${name}`} onClick={() => play.toggleCondition(name)}>
                  {name} <span aria-hidden="true">×</span>
                </button>
              ))}
              <button className="k-chip add" aria-expanded={addingCondition} onClick={() => setAddingCondition((v) => !v)}>+ Add</button>
            </span>
            {addingCondition && (
              <span className="k-chips k-condition-pick">
                {CONDITIONS.filter((x) => !state.conditions.includes(x)).map((name) => (
                  <button key={name} className="k-chip" onClick={() => { play.toggleCondition(name); setAddingCondition(false); }}>{name}</button>
                ))}
              </span>
            )}
          </div>

          <div className="k-rests">
            <button className="btn ghost" onClick={play.shortRest} title="Restores short-rest resources and one Wild Shape use">Short rest</button>
            <button className="btn" onClick={longRest}>Long rest</button>
          </div>
        </div>

        {c.variants && (
          <p className="k-variant">
            {c.variants.label}: <strong>{state.variant ?? 'not chosen'}</strong>{' '}
            <button className="btn ghost small" onClick={() => setAskVariant(true)}>Change</button>
          </p>
        )}
      </Parchment>

      {askVariant && c.variants && (
        <>
          <div className="scrim" onClick={() => setAskVariant(false)} />
          <div className="dialog tome" role="dialog" aria-label={`Choose ${c.variants.label}`}>
            <h2>{c.subclass?.name}</h2>
            <p className="muted">Choose your {c.variants.label.toLowerCase()} for today.</p>
            <div className="chips">
              {c.variants.options.map((o) => (
                <button
                  key={o.name}
                  title={o.description || undefined}
                  className={`chip ${state.variant === o.name ? 'sel' : ''}`}
                  onClick={() => {
                    play.setVariant(o.name);
                    setAskVariant(false);
                  }}
                >
                  {o.name}
                </button>
              ))}
            </div>
            <button className="btn ghost small" onClick={() => setAskVariant(false)}>
              {state.variant ? `Keep ${state.variant}` : 'Later'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Uses({ name, note, left, max, onUse, onRegain }: { name: string; note?: string; left: number; max: number; onUse: () => void; onRegain: () => void }) {
  return (
    <span className="k-box-row k-uses">
      <small title={note}>{name}</small>
      <Pips total={max} filled={left} label={`${name}: ${left} of ${max} left`} />
      <button className="btn ghost small" disabled={left <= 0} onClick={onUse}>Use</button>
      <button className="k-x" disabled={left >= max} onClick={onRegain} aria-label={`Regain a use of ${name}`} title="Regain one">+</button>
    </span>
  );
}

function Track({ label, mark, count, onSet }: { label: string; mark: string; count: number; onSet: (v: number) => void }) {
  return (
    <span className="track">
      {[1, 2, 3].map((i) => (
        <button key={i} className={`dot ${i <= count ? 'on' : ''}`} onClick={() => onSet(i === count ? i - 1 : i)} aria-label={`${label} ${i}`}>{mark}</button>
      ))}
    </span>
  );
}

/** The one-line banner that pins to the top once the full banner has scrolled away. */
function PinBar({ c, play, ac, show, slotRows }: { c: Character; play: PlayApi; ac: number; show: boolean; slotRows: { level: number; max: number; left: number }[] }) {
  const { state } = play;
  return (
    <div className={`k-pinbar ${show ? 'show' : ''}`} aria-hidden={!show}>
      <div className="k-pinbar-in k-parch">
        {c.portrait ? <img src={c.portrait} alt="" /> : <span className="k-pinbar-dot" />}
        <strong className="k-pinbar-name">{c.name}</strong>
        <span className="k-pinbar-hp">
          <span className="k-vl">HP</span> <b>{state.hp}</b>/{c.hitPoints}
          {state.tempHp > 0 && <span className="k-chip blue">+{state.tempHp}</span>}
        </span>
        <span className="k-pinbar-vial"><Vial value={state.hp} max={c.hitPoints} temp={state.tempHp} /></span>
        <span><span className="k-vl">AC</span> <b>{ac}</b></span>
        {slotRows.slice(0, 3).map((r) => (
          <span key={r.level} className="k-pinbar-slots"><small>{ORD[r.level - 1]}</small><Pips total={r.max} filled={r.left} /></span>
        ))}
        {state.concentration && <span className="k-chip blue">C: {state.concentration}</span>}
        {state.conditions.map((x) => <span key={x} className="k-chip red">{x}</span>)}
      </div>
    </div>
  );
}
