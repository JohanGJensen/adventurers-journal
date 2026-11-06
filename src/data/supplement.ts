// Data that lives in the Obsidian note (or in the rules) but not in the exported JSON.

export type SpellSource = 'Class' | 'Magic Initiate' | 'Gnome';

export interface SpellEntry {
  name: string;
  level: number;
  source: SpellSource;
  note?: string;
}

/** Spells listed in the Obsidian note that the JSON export doesn't contain. */
export const NOTE_SPELLS: SpellEntry[] = [
  { name: 'Druidcraft', level: 0, source: 'Magic Initiate' },
  { name: 'Guidance', level: 0, source: 'Magic Initiate' },
  { name: 'Minor Illusion', level: 0, source: 'Gnome' },
  { name: 'Goodberry', level: 1, source: 'Magic Initiate', note: 'Once per long rest without a slot' },
];

export interface LocalDetail {
  name: string;
  spell?: import('../lib/api').SpellInfo;
  meta: [string, string][];
  paragraphs: string[];
}

/** The export doesn't record Primal Order; Faelan is a Magician (+1 druid cantrip). */
export const PRIMAL_ORDER: 'Magician' | 'Warden' = 'Magician';
export const BONUS_CANTRIPS = PRIMAL_ORDER === 'Magician' ? 1 : 0;

/** Druid spells that aren't in the SRD class list. Add more here as needed. */
export const EXTRA_CLASS_SPELLS: { name: string; level: number }[] = [{ name: 'Gust', level: 0 }];

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
