import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { equipOptions } from './creation';
import { buildCharacter } from '../src/lib/character';
import { CLASSES, maxSpellLevel, unlockLevel } from '../src/lib/rules';
import { buildSheet, customBackground, emptyDraft, stepIssues, stepsFor, type CreateData, type CreateDraft } from '../src/lib/create';
import { seedInventory } from '../src/shared/state';
import { ABILITY_KEYS, type CreateBackground, type CreateClass, type CreateSpecies } from '../src/shared/types';

/* Fixtures shaped like server/creation.ts output (no network). */

const SKILLS_BY_CLASS: Record<string, string[]> = {
  fighter: ['Athletics', 'Perception', 'Survival'],
  wizard: ['Arcana', 'Investigation', 'Medicine'],
};

function cls(index: string): CreateClass {
  const r = CLASSES[index];
  return {
    index,
    name: index[0].toUpperCase() + index.slice(1),
    hitDie: r.hitDie,
    primary: 'Strength',
    saves: r.saves,
    spellAbility: r.spellAbility,
    skills: { choose: 2, desc: 'Choose 2', from: SKILLS_BY_CLASS[index] ?? ['Athletics', 'Perception', 'Survival', 'Insight'] },
    toolChoices: [],
    proficiencies: ['Simple Weapons'],
    equipment: [
      { label: 'A', items: [{ name: 'Dagger', qty: 2 }, { name: 'Leather Armor', qty: 1 }], gold: 5 },
      { label: 'B', items: [], gold: 50 },
    ],
    features: [{ index: `${index}-feature`, name: `${index} feature`, description: 'Does a thing.' }],
    cantrips: r.cantripsKnown[1],
    prepared: r.preparedCount[1],
  };
}

const elf: CreateSpecies = {
  index: 'elf',
  name: 'Elf',
  speed: 30,
  sizes: ['Medium'],
  traitNames: ['Keen Senses'],
  traits: [
    {
      index: 'keen-senses',
      name: 'Keen Senses',
      description: 'Insight, Perception or Survival.',
      skills: { choose: 1, desc: 'Choose one', from: ['Insight', 'Perception', 'Survival'] },
      spells: [],
    },
  ],
  lineageLabel: 'Elven Lineage',
  lineages: [
    {
      index: 'elven-lineage-wood-elf',
      name: 'Elven Lineage: Wood Elf',
      label: 'Wood',
      traits: [{ index: 'wood-elf-speed-increase', name: 'Wood Elf: Speed', description: '35 feet.', spells: [], speed: 35 }],
    },
    {
      index: 'elven-lineage-drow',
      name: 'Elven Lineage: Drow',
      label: 'Drow',
      traits: [{ index: 'lineage-spell-dancing-lights', name: 'Dancing Lights', description: '', spells: [{ name: 'Dancing Lights', level: 0 }] }],
    },
  ],
};

const sage: CreateBackground = {
  index: 'sage',
  name: 'Sage',
  abilities: ['CON', 'INT', 'WIS'],
  feat: { index: 'magic-initiate', name: 'Magic Initiate', description: 'Two cantrips and a level 1 spell.' },
  skills: ['Arcana', 'History'],
  tools: ["Calligrapher's Supplies"],
  toolChoice: null,
  equipment: [
    { label: 'A', items: [{ name: 'Quarterstaff', qty: 1 }, { name: 'Parchment', qty: 8 }], gold: 8 },
    { label: 'B', items: [], gold: 50 },
  ],
};

const originFeats = [
  { index: 'alert', name: 'Alert', description: 'Add your Proficiency Bonus to Initiative.' },
  { index: 'magic-initiate', name: 'Magic Initiate', description: '…' },
  { index: 'skilled', name: 'Skilled', description: 'Three skills.' },
];
const alignments = [{ name: 'Neutral', description: 'Takes no sides.' }];

function draftFor(c: CreateClass, over: Partial<CreateDraft> = {}): CreateDraft {
  return {
    ...emptyDraft(),
    classIndex: c.index,
    speciesIndex: 'elf',
    lineage: 'elven-lineage-wood-elf',
    speciesSkills: { 'keen-senses': ['Insight'] },
    backgroundIndex: 'sage',
    method: 'array',
    array: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 },
    bonusMode: '2-1',
    plus2: 'CON',
    plus1: 'INT',
    classSkills: c.skills.from.filter((s) => !['Insight', 'Arcana', 'History'].includes(s)).slice(0, 2),
    classEquip: 'A',
    bgEquip: 'A',
    cantrips: Array.from({ length: c.cantrips }, (_, i) => `Cantrip ${i + 1}`),
    prepared: Array.from({ length: c.prepared }, (_, i) => `Spell ${i + 1}`),
    magicInitiate: { background: { list: 'wizard', cantrips: ['Light', 'Mage Hand'], spell: 'Shield' } },
    name: `Test ${c.name}`,
    alignment: 'Neutral',
    ...over,
  };
}

const dataFor = (c: CreateClass, background: CreateBackground = sage): CreateData => ({
  cls: c,
  species: elf,
  background,
  originFeats,
  alignments,
});

describe('class rules', () => {
  test('every 2024 class has full tables', () => {
    expect(Object.keys(CLASSES).sort()).toEqual(
      ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'],
    );
    for (const r of Object.values(CLASSES)) {
      for (const t of [r.slots, r.cantripsKnown, r.preparedCount, r.wildShapeUses]) expect(t).toHaveLength(21);
    }
  });

  test('highest spell level follows the slot table, including Pact Magic', () => {
    expect(maxSpellLevel(CLASSES.wizard, 5)).toBe(3);
    expect(maxSpellLevel(CLASSES.paladin, 5)).toBe(2);
    expect(maxSpellLevel(CLASSES.fighter, 20)).toBe(0);
    expect(CLASSES.warlock.slots[3]).toEqual([0, 2]);
    expect(maxSpellLevel(CLASSES.warlock, 9)).toBe(5);
    expect(unlockLevel(CLASSES.wizard, 9)).toBe(17);
    expect(unlockLevel(CLASSES.paladin, 5)).toBe(17);
    expect(unlockLevel(CLASSES.paladin, 6)).toBeNull();
    expect(unlockLevel(CLASSES.warlock, 3)).toBe(5);
  });
});

describe('buildSheet', () => {
  for (const index of Object.keys(CLASSES)) {
    test(`a finished ${index} builds a playable level 1 sheet`, () => {
      const c = cls(index);
      const d = draftFor(c);
      const data = dataFor(c);
      expect(Object.values(stepIssues(d, data)).flat()).toEqual([]);
      expect(stepsFor(d, data)).toContain('spells'); // Magic Initiate asks for spells even without Spellcasting
      const { sheet, extras } = buildSheet(d, data);
      const ch = buildCharacter(sheet, extras);
      const con = 13 + 2; // array 13 + background +2
      expect(ch.name).toBe(`Test ${c.name}`);
      expect(ch.level).toBe(1);
      expect(ch.classKey).toBe(index);
      expect(ch.race).toBe('Wood Elf');
      expect(ch.background).toBe('Sage');
      expect(ch.hitPoints).toBe(CLASSES[index].hitDie + Math.floor((con - 10) / 2));
      expect(ch.speed).toBe(35);
      expect(ch.abilities.filter((a) => a.saveProf).map((a) => a.key)).toEqual(ABILITY_KEYS.filter((k) => CLASSES[index].saves.includes(k)));
      expect(ch.slots).toEqual(CLASSES[index].slots[1]);
      if (CLASSES[index].spellAbility) expect(ch.spellSaveDC).toBeGreaterThan(8);
      else expect(ch.spellSaveDC).toBe(0);
      // Skills: background, species pick and class picks, each with its source
      const prof = Object.fromEntries(ch.skills.filter((s) => s.proficient).map((s) => [s.name, s.source]));
      expect(prof).toMatchObject({ Arcana: 'Background', History: 'Background', Insight: 'Elf' });
      for (const s of d.classSkills) expect(prof[s]).toBe('Class');
      expect(ch.features.map((f) => f.name)).toContain(`${index} feature`);
      expect(ch.features.map((f) => f.name)).toContain('Magic Initiate');
      expect(ch.bonusSpells.map((s) => [s.name, s.source])).toEqual([
        ['Light', 'Magic Initiate'],
        ['Mage Hand', 'Magic Initiate'],
        ['Shield', 'Magic Initiate'],
      ]);
      expect(ch.gold).toBe(13);
    });
  }

  test('lineage spells, Alert, unarmored defense and a custom background', () => {
    const c = cls('barbarian');
    const custom = { name: 'Hermit', abilities: ['STR', 'DEX', 'CON'] as never, skills: ['Medicine', 'Religion'], tool: 'Herbalism Kit', feat: 'alert' };
    const d = draftFor(c, { lineage: 'elven-lineage-drow', backgroundIndex: 'custom', custom, plus2: 'CON', plus1: 'DEX', magicInitiate: {} });
    const data = dataFor(c, customBackground(custom, originFeats));
    expect(stepsFor(d, data)).not.toContain('spells');
    expect(Object.values(stepIssues(d, data)).flat()).toEqual([]);
    const ch = buildCharacter(...(Object.values(buildSheet(d, data)) as [unknown, never]));
    expect(ch.background).toBe('Hermit');
    expect(ch.race).toBe('Drow Elf');
    expect(ch.speed).toBe(30);
    expect(ch.bonusSpells).toEqual([{ name: 'Dancing Lights', level: 0, source: 'Species', note: 'Dancing Lights: always known' }]);
    // DEX 14+1 = 15 (+2), CON 13+2 = 15 (+2): Unarmored Defense 10 + 2 + 2, Alert adds proficiency to initiative
    expect(ch.armorClass).toBe(14);
    expect(ch.initiative).toBe(4);
    expect(ch.tools).toEqual([{ name: 'Herbalism Kit', description: 'Hermit proficiency', source: 'Hermit' }]);
    expect(ch.gold).toBe(5 + 50);
  });

  test('step issues explain what is missing', () => {
    const c = cls('wizard');
    const d = draftFor(c, { classSkills: ['Arcana'], plus1: 'CON', prepared: [], magicInitiate: {} });
    const issues = stepIssues(d, dataFor(c));
    expect(issues.abilities).toEqual(['The +2 and +1 must go to different abilities.']);
    expect(issues.skills).toEqual(['Choose 2 class skills.', 'You already have Arcana; choose other class skills.']);
    expect(issues.spells).toEqual(['Prepare 4 level 1 spells (0 so far).', 'Magic Initiate: choose a spell list.']);
  });

  test('repeated items stack in the starting inventory', () => {
    const c = cls('fighter');
    const ch = buildCharacter(...(Object.values(buildSheet(draftFor(c), dataFor(c))) as [unknown, never]));
    let n = 0;
    const inv = seedInventory(ch, () => String(n++));
    expect(inv.items.map((i) => [i.name, i.qty])).toEqual([
      ['Dagger', 2],
      ['Leather Armor', 1],
      ['Quarterstaff', 1],
      ['Parchment', 8],
    ]);
  });
});

describe('creating through the API', () => {
  test('a created sheet and its extras are accepted and derive the same character', async () => {
    const app = createApp(openDb(':memory:'));
    const c = cls('warlock');
    const { sheet, extras } = buildSheet(draftFor(c, { lineage: 'elven-lineage-drow' }), dataFor(c));
    const res = await app.fetch(new Request('http://x/api/characters', { method: 'POST', body: JSON.stringify({ sheet, extras }) }));
    expect(res.status).toBe(201);
    const dto = (await res.json()) as any;
    expect(dto.extras.bonusSpells.map((s: any) => s.source)).toEqual(['Species', 'Magic Initiate', 'Magic Initiate', 'Magic Initiate']);
    const list = (await (await app.fetch(new Request('http://x/api/characters'))).json()) as any[];
    expect(list[0]).toMatchObject({ name: 'Test Warlock', subtitle: 'Drow Elf · Warlock 1', classKey: 'warlock' });
    const play = (await (await app.fetch(new Request(`http://x/api/characters/${dto.id}/play`))).json()) as any;
    expect(play.state.chosenCantrips).toEqual(['Cantrip 1', 'Cantrip 2']);
    expect(play.state.slotsUsed).toEqual([0]);
  });
});

/* Normalising the SRD */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('creation lookups', () => {
  test('equipment options: packages, counts, notes, money and "your choice" items', () => {
    const opts = equipOptions([
      {
        choose: 1,
        from: {
          options: [
            {
              option_type: 'multiple',
              items: [
                { option_type: 'counted_reference', count: 20, of: { name: 'Arrows' } },
                { option_type: 'counted_reference', count: 1, of: { name: 'Book', note: 'History' } },
                { option_type: 'choice', choice: { choose: 1, from: { equipment_category: { name: 'Gaming Sets' } } } },
                { option_type: 'money', count: 14, unit: 'gp' },
              ],
            },
            { option_type: 'money', count: 50, unit: 'gp' },
          ],
        },
      },
    ]);
    expect(opts).toEqual([
      {
        label: 'A',
        items: [
          { name: 'Arrows', qty: 20 },
          { name: 'Book (History)', qty: 1 },
          { name: 'Gaming Sets (your choice)', qty: 1, choice: true },
        ],
        gold: 14,
      },
      { label: 'B', items: [], gold: 50 },
    ]);
  });

  test('class lookup: skills, tools, training, level 1 features; cached after the first call', async () => {
    const upstream: Record<string, unknown> = {
      '/api/2024/classes/monk': {
        index: 'monk',
        name: 'Monk',
        hit_die: 8,
        primary_ability: { desc: 'Dexterity and Wisdom' },
        saving_throws: [{ name: 'STR' }, { name: 'DEX' }],
        proficiency_choices: [
          {
            desc: 'Choose 2',
            choose: 2,
            from: { options: ['acrobatics', 'stealth'].map((s) => ({ option_type: 'reference', item: { name: `Skill: ${s[0].toUpperCase()}${s.slice(1)}` } })) },
          },
          {
            desc: 'Tools or instrument',
            choose: 1,
            from: {
              options: [
                { option_type: 'choice', choice: { from: { options: [{ option_type: 'reference', item: { name: "Brewer's Supplies" } }] } } },
                { option_type: 'reference', item: { name: 'Flute' } },
              ],
            },
          },
        ],
        proficiencies: [{ name: 'Simple Weapons' }, { name: 'Saving Throw: STR' }],
        starting_equipment_options: [],
      },
      '/api/2024/classes/monk/levels': [{ level: 1, features: [{ index: 'monk-martial-arts' }] }],
      '/api/2024/features/monk-martial-arts': { index: 'monk-martial-arts', name: 'Martial Arts', description: ['Punch well.'] },
    };
    const fn = mock(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      return path in upstream ? Response.json(upstream[path]) : new Response('nope', { status: 404 });
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const app = createApp(openDb(':memory:'));
    const get = () => app.fetch(new Request('http://x/api/srd/create/class/monk'));
    const r = await get();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      name: 'Monk',
      hitDie: 8,
      saves: ['STR', 'DEX'],
      spellAbility: null,
      skills: { choose: 2, from: ['Acrobatics', 'Stealth'] },
      toolChoices: [{ choose: 1, from: ["Brewer's Supplies", 'Flute'] }],
      proficiencies: ['Simple Weapons'],
      features: [{ name: 'Martial Arts', description: 'Punch well.' }],
      cantrips: 0,
      prepared: 0,
    });
    const calls = fn.mock.calls.length;
    expect((await get()).status).toBe(200);
    expect(fn.mock.calls.length).toBe(calls);
    expect((await app.fetch(new Request('http://x/api/srd/create/class/BAD!'))).status).toBe(400);
  });
});
