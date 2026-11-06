// Reads the pre-server localStorage saves and packages them as a LocalExport.
import { LOCAL_KEYS, type LocalExport } from '../shared/types';

const MIGRATED = /\.migrated-(\d{4}-\d{2}-\d{2})(?:-\d+)?$/;

function storageKeys(): string[] {
  try {
    return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter(Boolean);
  } catch {
    return [];
  }
}

const read = (key: string): unknown => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? undefined : JSON.parse(v);
  } catch {
    return undefined;
  }
};

/** The live key, or else the newest `<key>.migrated-<date>` copy. */
function newest(base: string, includeMigrated: boolean): string | null {
  const keys = storageKeys();
  if (keys.includes(base)) return base;
  if (!includeMigrated) return null;
  const copies = keys.filter((k) => k.startsWith(`${base}.migrated-`) && MIGRATED.test(k)).sort();
  return copies.at(-1) ?? null;
}

/** Null when there is nothing to export. `includeMigrated` also looks at already-migrated copies. */
export function buildLocalExport(includeMigrated = false): LocalExport | null {
  const playKey = newest(LOCAL_KEYS.play, includeMigrated);
  const invKey = newest(LOCAL_KEYS.inventory, includeMigrated);
  const playState = playKey ? read(playKey) : undefined;
  const inventory = invKey ? read(invKey) : undefined;
  if (!playState && !inventory) return null;
  return {
    format: 'dnd-tool/local-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...(playState && typeof playState === 'object' ? { playState } : {}),
    ...(inventory && typeof inventory === 'object' ? { inventory } : {}),
  } as LocalExport;
}

export const hasUnmigratedData = () => storageKeys().some((k) => k === LOCAL_KEYS.play || k === LOCAL_KEYS.inventory);

/** Renames the live keys to `<key>.migrated-YYYY-MM-DD` (never deletes, so a re-run is possible). */
export function markMigrated() {
  const date = new Date().toISOString().slice(0, 10);
  for (const key of [LOCAL_KEYS.play, LOCAL_KEYS.inventory]) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) continue;
      let target = `${key}.migrated-${date}`;
      for (let n = 2; localStorage.getItem(target) !== null && localStorage.getItem(target) !== v; n++) target = `${key}.migrated-${date}-${n}`;
      localStorage.setItem(target, v);
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}

/** Saves the export as a JSON file, the input for scripts/import-local.ts. Returns false if there was nothing. */
export function downloadLocalExport(): boolean {
  const data = buildLocalExport(true);
  if (!data) return false;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `dnd-tool-local-${data.exportedAt.slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}
