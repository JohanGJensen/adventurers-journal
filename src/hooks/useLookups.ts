import { useEffect, useState } from 'react';
import { lookup, type Detail, type Kind } from '../lib/api';

const MAX_CONCURRENT = 6;
const known = new Map<string, Detail | null>();
const inflight = new Map<string, Promise<void>>();
const queue: (() => void)[] = [];
let running = 0;

const keyOf = (kind: Kind, name: string) => `${kind}:${name}`;

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    running++;
    queue.shift()!();
  }
}

function load(kind: Kind, name: string): Promise<void> {
  const key = keyOf(kind, name);
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = new Promise<void>((resolve) => {
    queue.push(() => {
      lookup(kind, name)
        .then((d) => known.set(key, d))
        .catch(() => {
          /* leave unknown; retried next mount */
          inflight.delete(key);
        })
        .finally(() => {
          running--;
          resolve();
          pump();
        });
    });
    pump();
  });
  inflight.set(key, p);
  return p;
}

export interface Lookups<T> {
  /** undefined while unknown, null when the lookup found nothing */
  get(name: string): T | null | undefined;
}

/** Details for the given names, loaded lazily (a few at a time) and shared across components. */
export function useLookups<T>(kind: Kind, names: string[], pick: (d: Detail) => T | undefined): Lookups<T> {
  const [, bump] = useState(0);
  const key = names.join('|');

  useEffect(() => {
    let live = true;
    for (const n of names) {
      if (known.has(keyOf(kind, n))) continue;
      load(kind, n).then(() => live && bump((x) => x + 1));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key]);

  return {
    get(name) {
      const k = keyOf(kind, name);
      if (!known.has(k)) return undefined;
      const d = known.get(k);
      return d ? (pick(d) ?? null) : null;
    },
  };
}
