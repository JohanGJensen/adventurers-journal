// Manual check: compares the hand-typed class tables in src/lib/rules.ts with dnd5eapi.co.
// Usage: bun scripts/check-levels.ts [class]   (needs network)
// Note: the API's 2024 druid `cantrips_known` has known glitches (levels 7, 8, 16); the PHB table wins there.
import { CLASSES } from '../src/lib/rules';

const cls = process.argv[2] ?? 'druid';
const rules = CLASSES[cls];
if (!rules) throw new Error(`No rules for ${cls}`);
const levels = (await (await fetch(`https://www.dnd5eapi.co/api/2024/classes/${cls}/levels`)).json()) as any[];

let problems = 0;
const check = (level: number, what: string, ours: unknown, theirs: unknown) => {
  if (JSON.stringify(ours) === JSON.stringify(theirs)) return;
  problems++;
  console.log(`level ${level} ${what}: ours ${JSON.stringify(ours)}, API ${JSON.stringify(theirs)}`);
};

for (const l of levels) {
  const sc = l.spellcasting ?? {};
  const slots = Array.from({ length: 9 }, (_, i) => sc[`spell_slots_level_${i + 1}`] ?? 0).filter((n) => n > 0);
  check(l.level, 'prof bonus', 2 + Math.floor((l.level - 1) / 4), l.prof_bonus);
  check(l.level, 'slots', rules.slots[l.level], slots);
  check(l.level, 'cantrips', rules.cantripsKnown[l.level], sc.cantrips_known);
  check(l.level, 'prepared', rules.preparedCount[l.level], sc.prepared_spells);
  check(l.level, 'wild shape', rules.wildShapeUses[l.level], l.class_specific?.wild_shape_uses ?? 0);
}
console.log(problems ? `${problems} difference(s)` : 'All tables match the API');
