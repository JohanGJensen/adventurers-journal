import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface Roll {
  id: number;
  label: string;
  expr: string;
  sides: number;
  dice: number[];
  kept: number[];
  modifier: number;
  total: number;
  /** set for d20 rolls only */
  natural?: number;
  mode: RollMode;
}

export const rollDie = (sides: number) => 1 + Math.floor(Math.random() * sides);

let nextId = 1;

/** Rolls `count`d`sides` + modifier. For a single d20, advantage/disadvantage rolls two and keeps one. */
export function makeRoll(label: string, sides: number, count = 1, modifier = 0, mode: RollMode = 'normal'): Roll {
  const isD20 = sides === 20 && count === 1;
  const effectiveMode = isD20 ? mode : 'normal';
  let dice: number[];
  let kept: number[];
  if (effectiveMode === 'normal') {
    dice = Array.from({ length: count }, () => rollDie(sides));
    kept = dice;
  } else {
    dice = [rollDie(20), rollDie(20)];
    kept = [effectiveMode === 'advantage' ? Math.max(...dice) : Math.min(...dice)];
  }
  const sum = kept.reduce((a, b) => a + b, 0);
  const modStr = modifier ? (modifier > 0 ? ` + ${modifier}` : ` − ${-modifier}`) : '';
  return {
    id: nextId++,
    label,
    expr: `${count}d${sides}${modStr}`,
    sides,
    dice,
    kept,
    modifier,
    total: sum + modifier,
    natural: isD20 ? kept[0] : undefined,
    mode: effectiveMode,
  };
}

export const modeFromEvent = (e: { shiftKey: boolean; altKey: boolean }): RollMode =>
  e.shiftKey ? 'advantage' : e.altKey ? 'disadvantage' : 'normal';

interface DiceApi {
  log: Roll[];
  roll: (label: string, sides: number, count?: number, modifier?: number, mode?: RollMode) => Roll;
  clear: () => void;
  /** the roll currently shown on the cinematic stage */
  active: Roll | null;
  dismiss: () => void;
  cinematic: boolean;
  setCinematic: (on: boolean) => void;
}

const CINEMATIC_KEY = 'dice-cinematic';

function readCinematic(): boolean {
  try {
    return localStorage.getItem(CINEMATIC_KEY) !== 'off';
  } catch {
    return true;
  }
}

const DiceContext = createContext<DiceApi | null>(null);

export function DiceProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<Roll[]>([]);
  const [active, setActive] = useState<Roll | null>(null);
  const [cinematic, setCinematicState] = useState(readCinematic);

  // The result is decided here, synchronously; the stage only presents it.
  const roll = useCallback<DiceApi['roll']>(
    (label, sides, count = 1, modifier = 0, mode = 'normal') => {
      const r = makeRoll(label, sides, count, modifier, mode);
      setLog((l) => [r, ...l].slice(0, 20));
      if (cinematic) setActive(r);
      return r;
    },
    [cinematic],
  );
  const clear = useCallback(() => setLog([]), []);
  const dismiss = useCallback(() => setActive(null), []);
  const setCinematic = useCallback((on: boolean) => {
    setCinematicState(on);
    if (!on) setActive(null);
    try {
      localStorage.setItem(CINEMATIC_KEY, on ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
  }, []);

  return (
    <DiceContext.Provider value={{ log, roll, clear, active, dismiss, cinematic, setCinematic }}>
      {children}
    </DiceContext.Provider>
  );
}

export function useDice() {
  const ctx = useContext(DiceContext);
  if (!ctx) throw new Error('useDice must be used inside DiceProvider');
  return ctx;
}
