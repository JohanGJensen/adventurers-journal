import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { rollDie, useDice, type Roll } from '../lib/dice';

/** Timing, in ms. */
const TUMBLE = 900;
const STAGGER = 90;
const SETTLE = 160;
const HOLD = 1500;
const HOLD_CRIT = 2600;
const MAX_VISIBLE_DICE = 8;

type Phase = 'tumble' | 'impact' | 'reveal';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function DiceStage() {
  const { active, dismiss } = useDice();
  if (!active) return null;
  // Keyed by roll id so a new roll restarts the whole sequence.
  return <Stage key={active.id} r={active} onDone={dismiss} />;
}

function Stage({ r, onDone }: { r: Roll; onDone: () => void }) {
  const reduced = useRef(prefersReducedMotion()).current;
  const [phase, setPhase] = useState<Phase>(reduced ? 'reveal' : 'tumble');
  const dieSides = r.sides;
  const shown = r.dice.slice(0, MAX_VISIBLE_DICE);
  const landAt = (i: number) => TUMBLE + i * STAGGER;
  const lastLand = landAt(shown.length - 1);
  const isCrit = r.natural === 20;
  const isFumble = r.natural === 1;
  const keptIndex = r.mode === 'normal' ? -1 : r.dice.indexOf(r.kept[0]);

  // Phase timeline.
  useEffect(() => {
    if (phase === 'tumble') {
      const t = setTimeout(() => setPhase('impact'), lastLand);
      return () => clearTimeout(t);
    }
    if (phase === 'impact') {
      const t = setTimeout(() => setPhase('reveal'), SETTLE);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onDone, isCrit || isFumble ? HOLD_CRIT : HOLD);
    return () => clearTimeout(t);
  }, [phase, lastLand, isCrit, isFumble, onDone]);

  // Click or key: first skips to the result, second closes.
  const advance = () => (phase === 'reveal' ? onDone() : setPhase('reveal'));
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      else advanceRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  // Dim, blur and shake the sheet behind the stage.
  useEffect(() => {
    document.body.dataset.stage = phase;
    document.body.dataset.stageMood = isCrit ? 'crit' : isFumble ? 'fumble' : '';
    return () => {
      delete document.body.dataset.stage;
      delete document.body.dataset.stageMood;
    };
  }, [phase, isCrit, isFumble]);

  const mood = isCrit ? 'crit' : isFumble ? 'fumble' : '';
  const settled = phase !== 'tumble';

  return (
    <div
      className={`stage phase-${phase} ${mood} ${reduced ? 'reduced' : ''}`}
      onClick={advance}
      role="dialog"
      aria-live="assertive"
      aria-label={`${r.label}: ${r.total}`}
    >
      <div className="stage-vignette" />
      {isCrit && phase === 'reveal' && <div className="stage-rays" />}

      {!reduced && (
        <div className="stage-dice">
          {shown.map((value, i) => (
            <Die
              key={i}
              sides={dieSides}
              value={value}
              landAt={landAt(i)}
              index={i}
              count={shown.length}
              forceSettled={settled}
              dropped={keptIndex >= 0 && i !== keptIndex}
              mood={keptIndex < 0 || i === keptIndex ? mood : ''}
            />
          ))}
          {r.dice.length > MAX_VISIBLE_DICE && <span className="stage-more">+{r.dice.length - MAX_VISIBLE_DICE} more</span>}
        </div>
      )}

      {phase === 'reveal' && <Result r={r} mood={mood} />}
      <span className="stage-hint">{phase === 'reveal' ? 'Click to close' : 'Click to skip'}</span>
    </div>
  );
}

function Die({
  sides,
  value,
  landAt,
  index,
  count,
  forceSettled,
  dropped,
  mood,
}: {
  sides: number;
  value: number;
  landAt: number;
  index: number;
  count: number;
  forceSettled: boolean;
  dropped: boolean;
  mood: string;
}) {
  const [face, setFace] = useState(() => rollDie(sides));
  const [landed, setLanded] = useState(false);

  // Cycle random faces, slowing down as the die approaches its landing time.
  useEffect(() => {
    if (forceSettled) {
      setLanded(true);
      setFace(value);
      return;
    }
    const start = performance.now();
    let last = 0;
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      if (t >= landAt) {
        setFace(value);
        setLanded(true);
        return;
      }
      const progress = t / landAt;
      const interval = 40 + progress * progress * 180;
      if (now - last > interval) {
        last = now;
        setFace(rollDie(sides));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [forceSettled, landAt, sides, value]);

  // Fan the dice out from the centre.
  const spread = Math.min(140, 520 / count);
  const style = {
    '--x': `${(index - (count - 1) / 2) * spread}px`,
    '--from-x': `${(index % 2 ? 1 : -1) * (40 + index * 15)}vw`,
    '--spin': `${(index % 2 ? -1 : 1) * (720 + index * 90)}deg`,
    '--dur': `${landAt}ms`,
  } as CSSProperties;

  return (
    <div className={`die3-wrap ${landed ? 'landed' : ''} ${dropped && landed ? 'dropped' : ''} ${mood}`} style={style}>
      <div className="die3-tumble">
        <div className={`die3 d${sides === 100 ? 10 : sides}`}>
          <div className="die3-facet" />
          <span className="die3-num">{sides === 100 && face === 100 ? '00' : face}</span>
          {mood === 'fumble' && landed && (
            <svg className="die3-crack" viewBox="0 0 100 100" aria-hidden>
              <path d="M30 8 L44 34 L36 48 L56 62 L48 80 L62 96" />
              <path d="M44 34 L60 30 M56 62 L72 58" />
            </svg>
          )}
        </div>
      </div>
      <div className="die3-dust" />
      <span className="die3-label">d{sides}</span>
    </div>
  );
}

function Result({ r, mood }: { r: Roll; mood: string }) {
  const total = useCountUp(r.total, 450);
  const sum = r.kept.reduce((a, b) => a + b, 0);
  const parts =
    r.kept.length > 1 ? r.kept.join(' + ') : r.mode !== 'normal' ? `${r.kept[0]} (${r.mode === 'advantage' ? 'adv' : 'dis'})` : `${sum}`;
  const mod = r.modifier ? (r.modifier > 0 ? ` + ${r.modifier}` : ` − ${-r.modifier}`) : '';

  return (
    <div className="stage-result">
      <span className="stage-label">{r.label}</span>
      {mood === 'crit' && <span className="stage-title">Critical!</span>}
      {mood === 'fumble' && <span className="stage-title">Fumble</span>}
      <strong className="stage-total">{total}</strong>
      {(mod || r.kept.length > 1 || r.mode !== 'normal') && <span className="stage-expr">{parts}{mod}</span>}
    </div>
  );
}

function useCountUp(target: number, ms: number) {
  const [n, setN] = useState(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion()) return setN(target);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}
