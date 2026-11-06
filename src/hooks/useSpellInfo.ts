import type { EquipmentInfo, SpellInfo } from '../lib/api';
import { useLookups } from './useLookups';

/** Structured info (school, concentration, ritual…) for the given spells. */
export const useSpellInfo = (names: string[]) => useLookups<SpellInfo>('spells', names, (d) => d.spell);

/** Weapon/armor stats for the given items; null for items without any (tools, packs, unknown). */
export const useEquipmentInfo = (names: string[]) =>
  useLookups<EquipmentInfo>('equipment', names, (d) => d.equipment);
