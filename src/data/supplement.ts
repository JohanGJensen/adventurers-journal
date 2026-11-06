// Data that lives in the Obsidian note (or in the rules) but not in the exported JSON.

import type { CharacterExtras, SpellEntry, SpellInfo } from '../shared/types';

export type { SpellEntry, SpellSource } from '../shared/types';

/** Spells listed in the Obsidian note that the JSON export doesn't contain. */
export const NOTE_SPELLS: SpellEntry[] = [
  { name: 'Druidcraft', level: 0, source: 'Magic Initiate' },
  { name: 'Guidance', level: 0, source: 'Magic Initiate' },
  { name: 'Minor Illusion', level: 0, source: 'Gnome' },
  { name: 'Goodberry', level: 1, source: 'Magic Initiate', note: 'Once per long rest without a slot' },
];

export interface LocalDetail {
  name: string;
  spell?: SpellInfo;
  meta: [string, string][];
  paragraphs: string[];
}

/** The export doesn't record Primal Order; Faelan is a Magician (+1 druid cantrip). */
export const PRIMAL_ORDER: 'Magician' | 'Warden' = 'Magician';
export const BONUS_CANTRIPS = PRIMAL_ORDER === 'Magician' ? 1 : 0;

/** Druid spells that aren't in the SRD class list. Add more here as needed. */
export const EXTRA_CLASS_SPELLS: { name: string; level: number }[] = [{ name: 'Gust', level: 0 }];

/** Faelan's extras, stored with the seeded character in the database. */
export const FAELAN_EXTRAS: CharacterExtras = {
  portrait: '/faelanmosswalker.png',
  bonusSpells: NOTE_SPELLS,
  bonusCantrips: BONUS_CANTRIPS,
  extraClassSpells: EXTRA_CLASS_SPELLS,
};

/** Fallback text for things the SRD API doesn't have. Paraphrased summaries, not book text. */
export const LOCAL_DETAILS: Record<string, LocalDetail> = {
  gust: {
    name: 'Gust',
    spell: { level: 0, school: 'Transmutation', concentration: false, ritual: false, castingTime: '1 action', range: '30 feet' },
    meta: [
      ['Level', 'Transmutation cantrip'],
      ['Casting time', '1 action'],
      ['Range', '30 feet'],
      ['Components', 'V, S'],
      ['Duration', 'Instantaneous'],
    ],
    paragraphs: [
      'You seize the air and make it do one of the following at a point you can see within range:',
      '• Push a Medium or smaller creature up to 5 feet away from you (Strength save to resist).',
      '• Push an unattended object weighing 5 pounds or less up to 10 feet away from you.',
      '• Create a harmless sensory effect with air, such as rustling leaves, slamming shutters or making clothing ripple.',
      'Not part of the SRD (Elemental Evil / Xanathar’s). This is a local summary, so check your book for the exact wording.',
    ],
  },
};

export interface Feature {
  name: string;
  source: string;
  description: string;
}

export const CLASS_FEATURES: Record<string, Feature[]> = {
  druid: [
    {
      name: 'Spellcasting',
      source: 'Druid 1',
      description:
        'Wisdom is your spellcasting ability. You prepare spells from the druid list after a long rest, and can use a Druidic Focus (such as a sprig of mistletoe or a quarterstaff) as your focus.',
    },
    {
      name: 'Druidic',
      source: 'Druid 1',
      description:
        'You know Druidic, the secret language of druids, and always have Speak with Animals prepared. You can leave hidden messages in Druidic.',
    },
    {
      name: 'Primal Order',
      source: 'Druid 1',
      description:
        'Magician: you know one extra druid cantrip, and add your Wisdom modifier (min +1) to Intelligence (Arcana) and (Nature) checks.',
    },
  ],
};

/** What a level-up feature asks the player for. Features not listed here are info only. */
export type LevelChoiceKind =
  | { kind: 'subclass' }
  | { kind: 'asi' }
  | { kind: 'option'; options: { name: string; description: string }[] }
  | { kind: 'boon' };

/** Keyed by dnd5eapi.co 2024 feature index. The API describes these choices in prose only. */
export const LEVEL_CHOICES: Record<string, LevelChoiceKind> = {
  'druid-subclass': { kind: 'subclass' },
  'druid-ability-score-improvement': { kind: 'asi' },
  'druid-elemental-fury': {
    kind: 'option',
    options: [
      { name: 'Potent Spellcasting', description: 'Add your Wisdom modifier to the damage you deal with any Druid cantrip.' },
      {
        name: 'Primal Strike',
        description:
          "Once on each of your turns when you hit a creature with a weapon attack or a Beast form's attack in Wild Shape, the target takes an extra 1d8 Cold, Fire, Lightning or Thunder damage (your choice).",
      },
    ],
  },
  'druid-epic-boon': { kind: 'boon' },
};

/** Circle of the Land: the land types to choose from (changes on each long rest). */
export const LAND_TYPES = ['Arid', 'Polar', 'Temperate', 'Tropical'] as const;
export const LAND_SUBCLASS = 'circle-of-the-land';
