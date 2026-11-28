import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { SpellEntry } from '../../data/supplement';
import type { Spellbook } from '../../hooks/useSpellbook';
import type { PlayApi } from '../../hooks/usePlayState';
import { spellColour } from '../../lib/spellColour';
import { SchoolIcon } from '../SchoolIcon';
import { Parchment, WaxSeal } from '../kit';

const ROMAN = ['✦', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const CAST_MS = 2900;

/** The same scatter every render. */
const rnd = (i: number) => {
  const x = Math.sin(i * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};
const SPARKS = Array.from({ length: 40 }, (_, k) => ({
  '--a': `${Math.round(k * 9 + rnd(k) * 12)}deg`,
  '--dist': `${Math.round(140 + rnd(k + 3) * 240)}px`,
  '--t': `${(rnd(k + 11) * 0.35).toFixed(2)}s`,
  '--s': `${Math.round(4 + rnd(k + 21) * 8)}px`,
}));

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

type Casting = { name: string; school?: string; glow: string; deep: string; key: number };

/**
 * Today's spells as a fanned hand of cards in their element colours. Tap or click a card to pick it (it lifts and its
 * details open beside the hand); click it again, or a Cast button, to cast. Casting plays a short effect over the
 * page; with reduced motion it doesn't, and the live region still says what was cast.
 */
export function SpellDeck({ book, play, spells, onOpen }: { book: Spellbook; play: PlayApi; spells: SpellEntry[]; onOpen: (name: string) => void }) {
  const { state } = play;
  const [picked, setPicked] = useState<string | null>(null);
  const pickedAt = useRef(0);
  const [casting, setCasting] = useState<Casting | null>(null);
  const [said, setSaid] = useState('');
  const hand = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useLayoutEffect(() => {
    const el = hand.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const pick = spells.find((s) => s.name === picked) ?? null;

  const doCast = (s: SpellEntry, opts: { slotLevel?: number; free?: boolean } = {}) => {
    const used = book.cast(s, opts);
    if (used === null) return;
    setPicked(s.name);
    setSaid(`Cast ${s.name}${used ? ` with a ${ORD[used]}-level slot` : ''}.`);
    if (reducedMotion()) return;
    const school = book.details(s.name)?.school;
    const colour = spellColour(s.name, school);
    clearTimeout(timer.current);
    setCasting({ name: s.name, school, ...colour, key: Date.now() });
    timer.current = setTimeout(() => setCasting(null), CAST_MS);
  };
  const onCard = (s: SpellEntry) => {
    if (picked !== s.name) {
      setPicked(s.name);
      pickedAt.current = Date.now();
    } else if (book.castable(s) && Date.now() - pickedAt.current > 450) {
      // A quick double-click picks; it doesn't also spend a slot.
      doCast(s);
    }
  };

  // The fan: a gentle arc on wide hands, tighter as the hand grows; a sideways row on phones.
  const row = width < 560;
  const n = spells.length;
  const cardW = 150;
  const rotStep = Math.min(5, 36 / Math.max(n, 1));
  const half = (n - 1) / 2;
  // A tilted card reaches further sideways than its width: keep the outermost inside the table.
  const spill = cardW * 1.55 * Math.sin((half * rotStep * Math.PI) / 180);
  const step = n > 1 ? Math.max(24, Math.min(112, (width - cardW - 2 * spill - 8) / (n - 1))) : 0;
  const sag = half > 0 ? 28 / (half * half) : 0;

  return (
    <div className="k-deck">
      <Parchment as="section" gilt corners="all" className="k-table" aria-label="Your hand of spells">
        <span className="k-candle" aria-hidden="true" />
        <svg className="k-ink-circle" aria-hidden="true" viewBox="0 0 200 200" fill="none" stroke="currentColor">
          <circle cx="100" cy="100" r="96" strokeWidth="1" />
          <circle cx="100" cy="100" r="88" strokeWidth="3" strokeDasharray="2 7" />
          <circle cx="100" cy="100" r="62" strokeWidth="1" />
          <path d="M100 4L183 148H17z" strokeWidth="1" />
          <path d="M100 196L17 52h166z" strokeWidth="1" />
        </svg>
        <p className="k-hint k-table-hint">{row ? 'Tap a card to read it; tap again to cast.' : 'Click a card to pick it, and again to cast. Hover to look closer.'}</p>
        <div className={`k-hand ${row ? 'row' : 'fan'}`} ref={hand}>
          {n === 0 && <p className="k-hint">No spells match.</p>}
          {spells.map((s, i) => {
            const d = book.details(s.name);
            const colour = spellColour(s.name, d?.school);
            const off = i - half;
            const spent = !book.castable(s);
            const style = {
              '--c': colour.glow,
              '--d': colour.deep,
              '--x': `${Math.round(off * step)}px`,
              '--y': `${Math.round(off * off * sag)}px`,
              '--rot': `${(off * rotStep).toFixed(1)}deg`,
              '--z': 10 + i,
            } as CSSProperties;
            return (
              <button
                key={s.name}
                type="button"
                className={`k-card-spell ${picked === s.name ? 'picked' : ''} ${spent ? 'spent' : ''} ${state.concentration === s.name ? 'conc' : ''}`}
                style={style}
                aria-pressed={picked === s.name}
                aria-label={`${s.name}, ${s.level ? `${ORD[s.level]} level` : 'cantrip'}${spent ? ', no slot left' : ''}. ${picked === s.name ? 'Press again to cast.' : 'Press to pick.'}`}
                onClick={() => onCard(s)}
              >
                <span className="k-card-lv">{ROMAN[s.level] ?? s.level}</span>
                <span className="k-card-art">
                  <SchoolIcon school={d?.school} className="k-card-sigil" />
                </span>
                <span className="k-card-name">{s.name}</span>
                <span className="k-card-meta">{d ? `${d.castingTime} · ${d.range}` : ' '}</span>
                <span className="k-card-seals">
                  {book.isConc(s.name) && <WaxSeal colour="blue" size={22} label="Concentration">C</WaxSeal>}
                  {d?.ritual && <WaxSeal size={22} label="Ritual">R</WaxSeal>}
                  {s.source !== 'Class' && <span className="k-card-src">{s.source}</span>}
                </span>
                <svg className="k-crack" viewBox="0 0 150 230" fill="none" stroke="#3a2405" strokeWidth="1.6" aria-hidden="true">
                  <path d="M75 0l-7 34 12 19-17 26 10 22-14 34 9 26-5 69" />
                  <path d="M68 34l-26 12M80 53l29 7M63 79l-24 19M73 101l31 15M59 135l-29 5" />
                </svg>
              </button>
            );
          })}
        </div>
        {casting && <CastEffect casting={casting} />}
      </Parchment>

      <Parchment as="aside" gilt className="k-card k-deck-detail" aria-live="polite">
        {pick ? <Detail s={pick} book={book} play={play} onCast={doCast} onOpen={onOpen} /> : <p className="k-hint">Pick a card to see what it does and how to cast it.</p>}
        <p className="k-sr" role="status">{said}</p>
      </Parchment>
    </div>
  );
}

function Detail({ s, book, play, onCast, onOpen }: { s: SpellEntry; book: Spellbook; play: PlayApi; onCast: (s: SpellEntry, o?: { slotLevel?: number; free?: boolean }) => void; onOpen: (name: string) => void }) {
  const d = book.details(s.name);
  const colour = spellColour(s.name, d?.school);
  const slots = s.level > 0 ? book.slotsFor(s.level) : [];
  const mi = s.source === 'Magic Initiate' && s.level > 0;
  return (
    <>
      <h2 className="k-h2" style={{ '--c': colour.glow } as CSSProperties}>
        <span className="k-detail-dot" aria-hidden="true" />
        {s.name}
      </h2>
      <p className="k-detail-sub">
        {s.level ? `${ORD[s.level]}-level` : 'Cantrip'}
        {d?.school ? ` ${d.school.toLowerCase()}` : ''} · {s.source}
      </p>
      {d && (
        <dl className="k-detail-facts">
          <div><dt>Casting time</dt><dd>{d.castingTime}</dd></div>
          <div><dt>Range</dt><dd>{d.range}</dd></div>
          {(d.concentration || d.ritual) && (
            <div><dt>Also</dt><dd>{[d.concentration && 'Concentration', d.ritual && 'Ritual'].filter(Boolean).join(', ')}</dd></div>
          )}
        </dl>
      )}
      <div className="k-detail-cast">
        {s.level === 0 ? (
          <button className="btn" onClick={() => onCast(s)}>Cast {s.name}</button>
        ) : slots.length ? (
          slots.map((l, i) => (
            <button key={l} className={`btn ${i ? 'ghost' : ''}`} onClick={() => onCast(s, { slotLevel: l })}>
              {i === 0 && l === s.level ? 'Cast' : 'Upcast'} at {ORD[l]}
            </button>
          ))
        ) : null}
        {mi && (
          <button className="btn ghost" disabled={play.state.goodberryUsed} onClick={() => onCast(s, { free: true })} title="Magic Initiate: once per long rest without a slot">
            {play.state.goodberryUsed ? 'Free cast used' : 'Free cast'}
          </button>
        )}
        <button className="btn ghost" onClick={() => onOpen(s.name)}>Read the spell</button>
      </div>
      {s.level > 0 && !slots.length && !mi && <p className="k-hint">No {ORD[s.level]}-level slots or higher left. A long rest refills them.</p>}
      {book.isConc(s.name) && <p className="k-hint">Casting it stamps a concentration seal on the banner until you end it.</p>}
    </>
  );
}

function CastEffect({ casting }: { casting: Casting }) {
  const style = { '--c': casting.glow, '--d': casting.deep } as CSSProperties;
  return (
    <div className="k-cast" style={style} key={casting.key} aria-hidden="true">
      <span className="k-cast-dim" />
      <span className="k-cast-pillar" />
      <svg className="k-cast-ring a" viewBox="0 0 200 200" fill="none" stroke="currentColor">
        <circle cx="100" cy="100" r="96" strokeWidth="2" />
        <circle cx="100" cy="100" r="88" strokeWidth="6" strokeDasharray="1 9" />
        <circle cx="100" cy="100" r="78" strokeWidth="1.5" />
        <path d="M100 22l9 16h-18zM178 100l-16 9v-18zM100 178l-9-16h18zM22 100l16-9v18z" fill="currentColor" stroke="none" />
      </svg>
      <svg className="k-cast-ring b" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="100" cy="100" r="94" />
        <path d="M100 6L155 176 11 71h178L45 176z" />
        <circle cx="100" cy="100" r="40" strokeDasharray="4 6" />
      </svg>
      <span className="k-cast-shock" />
      <span className="k-cast-ghost">
        <SchoolIcon school={casting.school} className="k-card-sigil" />
      </span>
      {SPARKS.map((s, i) => (
        <span key={i} className="k-cast-spark" style={s as CSSProperties} />
      ))}
      <span className="k-cast-word">{casting.name}</span>
      <span className="k-cast-edge" />
    </div>
  );
}
