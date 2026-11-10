// Manual check: compares the hand-typed class tables in src/lib/rules.ts with dnd5eapi.co.
// Usage: bun scripts/check-levels.ts [class | all]   (needs network)
// Note: the API's 2024 druid `cantrips_known` has known glitches (levels 7 and 16); the PHB table wins there.
import { CLASSES } from '../src/lib/rules';

const arg = process.argv[2] ?? 'druid';
const classes = arg === 'all' ? Object.keys(CLASSES) : [arg];

let problems = 0;
for (const cls of classes) {
  const rules = CLASSES[cls];
  if (!rules) throw new Error(`No rules for ${cls}`);
  const levels = ((await (await fetch(`https://www.dnd5eapi.co/api/2024/classes/${cls}/levels`)).json()) as any[])
    .filter((l) => !l.subclass)
    .sort((a, b) => a.level - b.level);

  const check = (level: number, what: string, ours: unknown, theirs: unknown) => {
    if (JSON.stringify(ours) === JSON.stringify(theirs)) return;
    problems++;
    console.log(`${cls} level ${level} ${what}: ours ${JSON.stringify(ours)}, API ${JSON.stringify(theirs)}`);
  };

  for (const l of levels) {
    const sc = l.spellcasting ?? {};
    // Slots per spell level with trailing empty levels dropped; Pact Magic keeps its leading zeros.
    const slots = Array.from({ length: 9 }, (_, i) => sc[`spell_slots_level_${i + 1}`] ?? 0);
    while (slots.length && slots[slots.length - 1] === 0) slots.pop();
    check(l.level, 'prof bonus', 2 + Math.floor((l.level - 1) / 4), l.prof_bonus);
    check(l.level, 'slots', rules.slots[l.level], slots);
    check(l.level, 'cantrips', rules.cantripsKnown[l.level], sc.cantrips_known ?? 0);
    check(l.level, 'prepared', rules.preparedCount[l.level], sc.prepared_spells ?? 0);
    check(l.level, 'wild shape', rules.wildShapeUses[l.level], l.class_specific?.wild_shape_uses ?? 0);
  }
  const subLevels = levels.filter((l) => l.features.some((f: any) => f.index === `${cls}-subclass`)).map((l) => l.level);
  check(0, 'subclass levels', rules.subclassLevels, subLevels);
}
console.log(problems ? `${problems} difference(s)` : 'All tables match the API');
