import { useEffect, useState } from 'react';
import { ClassEmblem } from '../ClassEmblem';
import { CandleLight, Coin, Embers, Parchment, ParchmentPlaque, Pennant, Pips, Plaque, Vial, WaxSeal } from '.';

const CLASSES = ['', 'druid', 'wizard', 'warlock', 'sorcerer', 'cleric', 'paladin', 'rogue'];
const ABILITIES = [
  { key: 'STR', name: 'Strength', score: 8, prof: false },
  { key: 'DEX', name: 'Dexterity', score: 14, prof: false },
  { key: 'CON', name: 'Constitution', score: 14, prof: false },
  { key: 'INT', name: 'Intelligence', score: 12, prof: true },
  { key: 'WIS', name: 'Wisdom', score: 16, prof: true },
  { key: 'CHA', name: 'Charisma', score: 10, prof: false },
];
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Dev-only (/kit): every kit piece in every state, for checking day, night, classes and reduced motion. */
export function KitPage() {
  const [cls, setCls] = useState('druid');
  const [hp, setHp] = useState(22);
  const [temp, setTemp] = useState(0);
  const [slots, setSlots] = useState(3);
  const [inspired, setInspired] = useState(true);
  const [stampKey, setStampKey] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    if (cls) root.dataset.class = cls;
    else delete root.dataset.class;
    return () => {
      delete root.dataset.class;
    };
  }, [cls]);

  return (
    <main className="kit-page" style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '24px 16px 96px', display: 'grid', gap: 22 }}>
      <Embers />
      <ParchmentPlaque title="The redesign kit" subtitle="Every piece, every state. Switch the OS theme for night; turn on reduced motion to check the off switch.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }} role="group" aria-label="Class colours">
          {CLASSES.map((k) => (
            <button key={k || 'none'} className={`btn ${cls === k ? '' : 'ghost'} small`} aria-pressed={cls === k} onClick={() => setCls(k)}>
              {k || 'no class'}
            </button>
          ))}
        </div>
      </ParchmentPlaque>

      <Parchment as="section" gilt corners="top" style={{ padding: '22px 24px' }}>
        <h2>Coins</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 28vw), 1fr))', gap: '26px 14px', justifyItems: 'center', paddingTop: 12 }}>
          {ABILITIES.map((a) => {
            const mod = Math.floor((a.score - 10) / 2);
            return <Coin key={a.key} value={sign(mod)} score={a.score} ribbon={a.name} proficient={a.prof} onClick={() => {}} ariaLabel={`${a.name} check ${sign(mod)}`} />;
          })}
          <Coin value="+2" ribbon="Initiative" size={96} ariaLabel="Initiative +2" />
          <Coin value="25" ribbon="Speed" size={96} ariaLabel="Speed 25 feet" />
        </div>
      </Parchment>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 22 }}>
        <Parchment as="section" gilt style={{ padding: '22px 24px', display: 'grid', gap: 12 }}>
          <h2>Vial</h2>
          <Vial value={hp} max={27} temp={temp} />
          <p style={{ margin: 0 }}>
            {hp} / 27{temp ? ` (+${temp} temp)` : ''}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn danger" onClick={() => setHp((v) => Math.max(0, v - 5))}>Damage 5</button>
            <button className="btn" onClick={() => setHp((v) => Math.min(27, v + 5))}>Heal 5</button>
            <button className="btn ghost" onClick={() => setTemp((t) => (t ? 0 : 5))}>{temp ? 'Clear temp' : '+5 temp'}</button>
          </div>
        </Parchment>

        <Parchment as="section" gilt style={{ padding: '22px 24px', display: 'grid', gap: 12 }}>
          <h2>Pips</h2>
          <Pips total={4} filled={slots} label={`1st-level slots: ${slots} of 4`} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setSlots((s) => Math.max(0, s - 1))}>Spend a slot</button>
            <button className="btn ghost" onClick={() => setSlots(4)}>Long rest</button>
          </div>
        </Parchment>

        <Parchment as="section" gilt style={{ padding: '22px 24px', display: 'grid', gap: 12 }}>
          <h2>Wax seals</h2>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <WaxSeal label="Ritual">R</WaxSeal>
            <WaxSeal colour="blue" label="Concentration">C</WaxSeal>
            <WaxSeal colour="green" label="Always prepared">✦</WaxSeal>
            <WaxSeal size={58} label="Heroic inspiration" pressed={inspired} onClick={() => setInspired((v) => !v)}>
              IN-<br />SPIRED
            </WaxSeal>
            <span key={stampKey}>
              <WaxSeal colour="blue" stamp label="Concentrating">C</WaxSeal>
            </span>
            <button className="btn ghost small" onClick={() => setStampKey((k) => k + 1)}>Stamp again</button>
          </div>
        </Parchment>

        <Parchment as="section" gilt style={{ padding: '22px 24px', display: 'flex', gap: 22, alignItems: 'flex-start' }}>
          <Pennant>
            <ClassEmblem classKey={cls || null} className="emblem" />
          </Pennant>
          <div>
            <h2>Pennant</h2>
            <p style={{ margin: 0 }}>The class banner hangs from the top of the sheet and sways a little.</p>
          </div>
        </Parchment>
      </div>

      <Parchment as="section" gilt style={{ padding: '0 24px 24px' }}>
        <Plaque title="Thornwood" subtitle="session 7 was on 21 November" />
        <p className="k-drop" style={{ margin: '18px 0 0', fontSize: 17, lineHeight: 1.55 }}>
          A market town built where the old toll road fords the Greywater. The first letter of a reading page is set as an illuminated
          drop cap in the class colour, framed in gilt.
        </p>
      </Parchment>

      <Parchment as="section" gilt corners="all" style={{ padding: '22px 24px', minHeight: 160, overflow: 'hidden' }}>
        <CandleLight />
        <h2 style={{ position: 'relative' }}>Candlelight</h2>
        <p style={{ position: 'relative', margin: 0 }}>A warm glow that flickers over a surface. Four filigree corners on this one.</p>
      </Parchment>
    </main>
  );
}
