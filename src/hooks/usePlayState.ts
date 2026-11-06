import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character } from '../lib/character';
import { api } from '../lib/client';
import { toast } from '../lib/toast';
import { freshPlayState } from '../shared/state';
import type { EventIn, PlayState } from '../shared/types';

export type { PlayState } from '../shared/types';
export { CONDITIONS } from '../shared/state';

const SAVE_DELAY = 300;
const RETRY_DELAY = 3000;

type Patch = Partial<PlayState>;
type Describe = EventIn | ((before: PlayState, after: PlayState) => EventIn | null) | null;

/**
 * Play state for one character, loaded from and saved to the server.
 * Changes apply locally at once; saves are debounced and carry the version they were based on,
 * so a stale write (another tab) is rejected with 409 and the server copy is adopted.
 */
export function usePlayState(c: Character, characterId: number) {
  const [state, setState] = useState<PlayState>(() => freshPlayState(c));
  const [ready, setReady] = useState(false);
  const [rev, setRev] = useState(0);
  const cur = useRef(state);
  const version = useRef(0);
  const pending = useRef<EventIn[]>([]);
  const dirty = useRef(false);
  const saving = useRef(false);
  const again = useRef(false);

  const adopt = useCallback((s: PlayState, v: number) => {
    cur.current = s;
    version.current = v;
    setState(s);
  }, []);

  useEffect(() => {
    let live = true;
    setReady(false);
    dirty.current = false;
    pending.current = [];
    api<{ state: PlayState; version: number }>('GET', `/characters/${characterId}/play`).then((r) => {
      if (!live) return;
      if (r.data) {
        adopt(r.data.state, r.data.version);
        setReady(true);
      } else if (r.status !== 0) toast(`Could not load play state: ${r.error}`, 'error');
    });
    return () => {
      live = false;
    };
  }, [characterId, adopt]);

  const flush = useCallback(async () => {
    if (saving.current) {
      again.current = true;
      return;
    }
    if (!dirty.current) return;
    dirty.current = false;
    saving.current = true;
    const events = pending.current.splice(0);
    const sent = cur.current;
    const r = await api<{ version: number }>('PUT', `/characters/${characterId}/play`, {
      state: sent,
      version: version.current,
      events,
    });
    saving.current = false;
    if (r.data) {
      version.current = r.data.version;
    } else if (r.status === 409 && r.body?.state) {
      // Another tab saved first. Its state wins; our unsaved changes are dropped.
      pending.current = [];
      dirty.current = false;
      again.current = false;
      adopt(r.body.state, r.body.version);
      toast('Changed in another tab — reloaded the latest play state');
      return;
    } else if (r.status === 0) {
      pending.current.unshift(...events);
      dirty.current = true;
      setTimeout(() => void flush(), RETRY_DELAY);
      return;
    } else {
      toast(`Could not save: ${r.error}`, 'error');
    }
    if (again.current) {
      again.current = false;
      void flush();
    }
  }, [characterId, adopt]);

  // Debounced save after each change.
  useEffect(() => {
    if (!rev || !dirty.current) return;
    const t = setTimeout(() => void flush(), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [rev, flush]);

  // Don't lose the last change when the tab closes.
  useEffect(() => {
    const onHide = () => {
      if (!dirty.current) return;
      dirty.current = false;
      void fetch(`/api/characters/${characterId}/play`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: cur.current, version: version.current, events: pending.current.splice(0) }),
      });
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [characterId]);

  /** Applies a change and queues an event describing it. Computed outside setState so StrictMode can't double it. */
  const update = useCallback((fn: (s: PlayState) => Patch, describe: Describe = null) => {
    const before = cur.current;
    const after = { ...before, ...fn(before) };
    cur.current = after;
    setState(after);
    const e = typeof describe === 'function' ? describe(before, after) : describe;
    if (e) pending.current.push(e);
    dirty.current = true;
    setRev((r) => r + 1);
  }, []);

  const damage = (n: number) =>
    update(
      (s) => {
        const fromTemp = Math.min(s.tempHp, n);
        const hp = Math.max(0, s.hp - (n - fromTemp));
        return { tempHp: s.tempHp - fromTemp, hp, conditions: hp === 0 && !s.conditions.includes('Unconscious') ? [...s.conditions, 'Unconscious'] : s.conditions };
      },
      (a, b) => ({
        type: 'damage',
        summary: `Took ${n} damage (${a.hp} → ${b.hp}${a.tempHp !== b.tempHp ? `, temp ${a.tempHp} → ${b.tempHp}` : ''})`,
        data: { amount: n, before: { hp: a.hp, tempHp: a.tempHp }, after: { hp: b.hp, tempHp: b.tempHp } },
      }),
    );

  const heal = (n: number) =>
    update(
      (s) => ({
        hp: Math.min(c.hitPoints, s.hp + n),
        deathSaves: { success: 0, fail: 0 },
        conditions: s.hp === 0 ? s.conditions.filter((x) => x !== 'Unconscious') : s.conditions,
      }),
      (a, b) => ({ type: 'heal', summary: `Healed ${n} (${a.hp} → ${b.hp})`, data: { amount: n, before: a.hp, after: b.hp } }),
    );

  const setTemp = (n: number) =>
    update(
      () => ({ tempHp: Math.max(0, n) }),
      (a, b) => (a.tempHp === b.tempHp ? null : { type: 'temp_hp', summary: `Temp HP ${a.tempHp} → ${b.tempHp}` }),
    );

  const slotSummary = (verb: string, level: number) => (_: PlayState, b: PlayState): EventIn => ({
    type: 'slot',
    summary: `${verb} a level ${level} slot (${(c.slots[level - 1] ?? 0) - (b.slotsUsed[level - 1] ?? 0)}/${c.slots[level - 1] ?? 0} left)`,
  });

  const useSlot = (level: number) =>
    update((s) => {
      const used = [...s.slotsUsed];
      used[level - 1] = Math.min(c.slots[level - 1], (used[level - 1] ?? 0) + 1);
      return { slotsUsed: used };
    }, slotSummary('Used', level));

  const restoreSlot = (level: number) =>
    update((s) => {
      const used = [...s.slotsUsed];
      used[level - 1] = Math.max(0, (used[level - 1] ?? 0) - 1);
      return { slotsUsed: used };
    }, slotSummary('Restored', level));

  const toggleCondition = (name: string) =>
    update(
      (s) => ({
        conditions: s.conditions.includes(name) ? s.conditions.filter((x) => x !== name) : [...s.conditions, name],
      }),
      (a) => ({ type: 'condition', summary: `${a.conditions.includes(name) ? 'No longer' : 'Now'} ${name}` }),
    );

  const longRest = () =>
    update(
      (s) => ({
        ...freshPlayState(c),
        conditions: s.conditions.filter((x) => x !== 'Unconscious'),
        chosenCantrips: s.chosenCantrips,
        prepared: s.prepared,
        variant: s.variant,
      }),
      (a, b) => ({ type: 'rest', summary: `Long rest (HP ${a.hp} → ${b.hp}, slots restored)` }),
    );

  const reset = async () => {
    const r = await api<{ state: PlayState; version: number }>('POST', `/characters/${characterId}/play/reset`);
    if (r.data) {
      pending.current = [];
      dirty.current = false;
      adopt(r.data.state, r.data.version);
    } else toast(`Could not reset: ${r.error}`, 'error');
  };

  const toggleIn = (key: 'chosenCantrips' | 'prepared', name: string, cap: number) =>
    update(
      (s) => {
        const list = s[key];
        if (list.includes(name)) return { [key]: list.filter((x) => x !== name) };
        if (list.length >= cap) return {};
        return { [key]: [...list, name] };
      },
      (a, b) =>
        a[key] === b[key]
          ? null
          : { type: 'spells', summary: `${b[key].includes(name) ? (key === 'prepared' ? 'Prepared' : 'Learned') : key === 'prepared' ? 'Unprepared' : 'Dropped'} ${name}` },
    );

  const toggleCantrip = (name: string) => toggleIn('chosenCantrips', name, c.cantripCap);
  const togglePrepared = (name: string) => toggleIn('prepared', name, c.preparedCap);

  const wildShape = (delta: 1 | -1) =>
    update(
      (s) => ({ wildShapeUsed: Math.max(0, Math.min(c.wildShapeUses, s.wildShapeUsed + delta)) }),
      (a, b) =>
        a.wildShapeUsed === b.wildShapeUsed
          ? null
          : { type: 'rest', summary: `${delta > 0 ? 'Used' : 'Regained'} a Wild Shape use (${c.wildShapeUses - b.wildShapeUsed}/${c.wildShapeUses} left)` },
    );

  const setVariant = (variant: string) =>
    update(
      () => ({ variant }),
      (a, b) => (a.variant === b.variant ? null : { type: 'rest', summary: `${c.variants?.label ?? 'Variant'}: ${b.variant}` }),
    );

  const resource = (key: string, delta: 1 | -1) => {
    const r = c.resources.find((x) => x.key === key);
    if (!r) return;
    update(
      (s) => ({ resourcesUsed: { ...s.resourcesUsed, [key]: Math.max(0, Math.min(r.max, (s.resourcesUsed[key] ?? 0) + delta)) } }),
      (a, b) =>
        (a.resourcesUsed[key] ?? 0) === (b.resourcesUsed[key] ?? 0)
          ? null
          : { type: 'rest', summary: `${delta > 0 ? 'Used' : 'Regained'} ${r.name} (${r.max - (b.resourcesUsed[key] ?? 0)}/${r.max} left)` },
    );
  };

  /** Short rest: short-recharge resources come back, and one Wild Shape use (2024 rule). Hit dice are spent separately. */
  const shortRest = () =>
    update(
      (s) => ({
        wildShapeUsed: Math.max(0, s.wildShapeUsed - 1),
        resourcesUsed: Object.fromEntries(
          Object.entries(s.resourcesUsed).filter(([k]) => c.resources.find((r) => r.key === k)?.recharge !== 'short'),
        ),
      }),
      { type: 'rest', summary: 'Short rest (short-rest resources restored)' },
    );

  /** Waits until every local change is saved, so a server-side change (level-up) builds on it. */
  const settle = async () => {
    for (let i = 0; i < 50 && (saving.current || dirty.current); i++) {
      if (!saving.current) await flush();
      else await new Promise((r) => setTimeout(r, 50));
    }
  };

  /** Takes over a state the server wrote (level-up, undo). */
  const replace = (s: PlayState, v: number) => {
    pending.current = [];
    dirty.current = false;
    adopt(s, v);
  };

  return {
    state, ready, update, damage, heal, setTemp, useSlot, restoreSlot, toggleCondition, longRest, reset,
    toggleCantrip, togglePrepared, useWildShape: () => wildShape(1), restoreWildShape: () => wildShape(-1),
    setVariant, useResource: (key: string) => resource(key, 1), restoreResource: (key: string) => resource(key, -1), shortRest,
    settle, replace,
  };
}

export type PlayApi = ReturnType<typeof usePlayState>;
