// The colour a spell card glows in: its element where the name gives it away, otherwise its school.
// `glow` is the bright light of the aura and sparks; `deep` is the dark of the card's art window.

export interface SpellColour {
  glow: string;
  deep: string;
}

const ELEMENTS: [RegExp, SpellColour][] = [
  [/fire|flame|burn|scorch|ember|heat|sun/i, { glow: '#ff8a3d', deep: '#7a2408' }],
  [/frost|ice|cold|freez|snow|winter/i, { glow: '#a8e4ff', deep: '#163f5c' }],
  [/thunder|lightning|storm|shock|call lightning/i, { glow: '#86b6ff', deep: '#152f62' }],
  [/moon|radiant|light|daylight|dawn|guiding/i, { glow: '#cfe1ff', deep: '#2b3d7a' }],
  [/heal|cure|healing|restor|revivify|life|goodberry|aid/i, { glow: '#ffd36b', deep: '#7a5208' }],
  [/poison|acid|toxic|blight|rot/i, { glow: '#b8e65a', deep: '#33470d' }],
  [/entangle|thorn|vine|plant|tree|bark|grow|spike growth|druid/i, { glow: '#62d67e', deep: '#164a22' }],
  [/mist|fog|step|blink|teleport|gust|wind|air/i, { glow: '#c9a8ff', deep: '#3b2366' }],
  [/shadow|dark|necrot|chill touch|death/i, { glow: '#9ee6c5', deep: '#173d33' }],
];

const SCHOOLS: Record<string, SpellColour> = {
  abjuration: { glow: '#ffd36b', deep: '#7a5208' },
  conjuration: { glow: '#62d67e', deep: '#164a22' },
  divination: { glow: '#cfe1ff', deep: '#2b3d7a' },
  enchantment: { glow: '#ff6b96', deep: '#6a1430' },
  evocation: { glow: '#ff8a3d', deep: '#7a2408' },
  illusion: { glow: '#c9a8ff', deep: '#3b2366' },
  necromancy: { glow: '#9ee6c5', deep: '#173d33' },
  transmutation: { glow: '#7fd6d0', deep: '#14504c' },
};

const FALLBACK: SpellColour = { glow: '#e0b456', deep: '#4a3008' };

export function spellColour(name: string, school?: string | null): SpellColour {
  for (const [re, colour] of ELEMENTS) if (re.test(name)) return colour;
  return SCHOOLS[school?.trim().toLowerCase() ?? ''] ?? FALLBACK;
}
