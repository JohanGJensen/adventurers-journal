// One-time import of pre-server localStorage data into the seeded character.
import type { CharacterSummary, LocalExport } from '../shared/types';
import { api } from './client';
import { buildLocalExport, hasUnmigratedData, markMigrated } from './localExport';
import { toast } from './toast';

export type AutoImport =
  | { status: 'none' }
  | { status: 'imported' }
  | { status: 'conflict'; characterId: number; payload: LocalExport }
  | { status: 'error'; message: string };

export async function autoImport(characters: CharacterSummary[]): Promise<AutoImport> {
  if (!hasUnmigratedData()) return { status: 'none' };
  const target = characters.find((c) => c.seedKey === 'faelan');
  if (!target) return { status: 'none' };
  const payload = buildLocalExport(false);
  if (!payload) return { status: 'none' };
  const r = await api<{ already: boolean }>('POST', '/import/local', { characterId: target.id, payload });
  if (r.status === 409) return { status: 'conflict', characterId: target.id, payload };
  if (r.error !== undefined) return { status: 'error', message: r.error };
  markMigrated();
  if (!r.data.already) toast(`Moved this browser's saved data for ${target.name} to the server`);
  return { status: 'imported' };
}

export async function forceImport(characterId: number, payload: LocalExport): Promise<boolean> {
  const r = await api('POST', '/import/local', { characterId, payload, force: true });
  if (r.error !== undefined) {
    toast(`Import failed: ${r.error}`, 'error');
    return false;
  }
  markMigrated();
  toast('Overwrote server data with this browser’s data');
  return true;
}
