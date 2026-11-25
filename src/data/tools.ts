// Tool rules from SRD 5.2 (2024 PHB "Tools"): each tool's ability, its Utilize actions with their DCs and what it can craft.
// Proficiency adds the proficiency bonus to checks with the tool. Proficiency in a skill that also applies to the check
// gives advantage too; `skills` lists the usual candidates (the DM has the final say).
import type { Ability } from '../lib/rules';

export interface ToolUse {
  action: string;
  dc: number;
}

export interface ToolRules {
  ability: Ability;
  utilize: ToolUse[];
  craft?: string[];
  /** skills that commonly combine with the tool for advantage */
  skills: string[];
}

const TOOLS: Record<string, ToolRules> = {
  "alchemist's supplies": {
    ability: 'INT',
    utilize: [{ action: 'Identify a substance', dc: 15 }, { action: 'Start a fire', dc: 15 }],
    craft: ['Acid', "Alchemist's Fire", 'Component Pouch', 'Oil', 'Paper', 'Perfume'],
    skills: ['Arcana', 'Investigation'],
  },
  "brewer's supplies": {
    ability: 'INT',
    utilize: [{ action: 'Detect poisoned drink', dc: 15 }, { action: 'Identify alcohol', dc: 10 }],
    craft: ['Antitoxin'],
    skills: ['Medicine', 'Persuasion'],
  },
  "calligrapher's supplies": {
    ability: 'DEX',
    utilize: [{ action: 'Write text with flourishes that guard against forgery', dc: 15 }],
    craft: ['Ink', 'Spell Scroll'],
    skills: ['Arcana', 'History'],
  },
  "carpenter's tools": {
    ability: 'STR',
    utilize: [{ action: 'Seal or pry open a door or container', dc: 20 }],
    craft: ['Club', 'Greatclub', 'Quarterstaff', 'Barrel', 'Chest', 'Ladder', 'Pole', 'Portable Ram', 'Torch'],
    skills: ['Investigation', 'Perception'],
  },
  "cartographer's tools": {
    ability: 'WIS',
    utilize: [{ action: 'Draft a map of a small area', dc: 15 }],
    craft: ['Map'],
    skills: ['Survival', 'Nature', 'History'],
  },
  "cobbler's tools": {
    ability: 'DEX',
    utilize: [{ action: "Modify footwear: advantage on the wearer's next DEX (Acrobatics) check", dc: 10 }],
    craft: ["Climber's Kit"],
    skills: ['Investigation', 'Arcana'],
  },
  "cook's utensils": {
    ability: 'WIS',
    utilize: [{ action: "Improve food's flavor", dc: 10 }, { action: 'Detect spoiled or poisoned food', dc: 15 }],
    craft: ['Rations'],
    skills: ['Medicine', 'Survival'],
  },
  "glassblower's tools": {
    ability: 'INT',
    utilize: [{ action: 'Discern what a glass object held in the past 24 hours', dc: 15 }],
    craft: ['Glass Bottle', 'Magnifying Glass', 'Spyglass', 'Vial'],
    skills: ['Arcana', 'Investigation'],
  },
  "jeweler's tools": {
    ability: 'INT',
    utilize: [{ action: "Discern a gem's value", dc: 15 }],
    craft: ['Arcane Focus', 'Holy Symbol'],
    skills: ['Arcana', 'Investigation'],
  },
  "leatherworker's tools": {
    ability: 'DEX',
    utilize: [{ action: 'Add a design to a leather item', dc: 10 }],
    craft: ['Sling', 'Whip', 'Hide Armor', 'Leather Armor', 'Studded Leather Armor', 'Backpack', 'Crossbow Bolt Case', 'Map or Scroll Case', 'Parchment', 'Pouch', 'Quiver', 'Waterskin'],
    skills: ['Arcana', 'Investigation'],
  },
  "mason's tools": {
    ability: 'STR',
    utilize: [{ action: 'Chisel a symbol or hole in stone', dc: 10 }],
    craft: ['Block and Tackle'],
    skills: ['History', 'Perception'],
  },
  "painter's supplies": {
    ability: 'WIS',
    utilize: [{ action: "Paint a recognizable image of something you've seen", dc: 10 }],
    craft: ['Druidic Focus', 'Holy Symbol'],
    skills: ['Religion', 'Investigation'],
  },
  "potter's tools": {
    ability: 'INT',
    utilize: [{ action: 'Discern what a ceramic object held in the past 24 hours', dc: 15 }],
    craft: ['Jug', 'Lamp'],
    skills: ['History', 'Perception'],
  },
  "smith's tools": {
    ability: 'STR',
    utilize: [{ action: 'Pry open a door or container', dc: 20 }],
    craft: ['Any Melee weapon (except Club, Greatclub, Quarterstaff, Whip)', 'Medium armor (except Hide)', 'Heavy armor', 'Ball Bearings', 'Bucket', 'Caltrops', 'Chain', 'Crowbar', 'Firearm Bullets', 'Grappling Hook', 'Iron Pot', 'Iron Spikes', 'Sling Bullets'],
    skills: ['Arcana', 'History'],
  },
  "tinker's tools": {
    ability: 'DEX',
    utilize: [{ action: 'Assemble a Tiny item from scrap (falls apart in 1 minute)', dc: 20 }],
    craft: ['Musket', 'Pistol', 'Bell', 'Bullseye Lantern', 'Flask', 'Hooded Lantern', 'Hunting Trap', 'Lock', 'Manacles', 'Mirror', 'Shovel', 'Signal Whistle', 'Tinderbox'],
    skills: ['History', 'Investigation'],
  },
  "weaver's tools": {
    ability: 'DEX',
    utilize: [{ action: 'Mend a tear in clothing', dc: 10 }, { action: 'Sew a Tiny design', dc: 10 }],
    craft: ['Padded Armor', 'Basket', 'Bedroll', 'Blanket', 'Fine Clothes', 'Net', 'Robe', 'Rope', 'Sack', 'String', 'Tent', "Traveler's Clothes"],
    skills: ['Arcana', 'History'],
  },
  "woodcarver's tools": {
    ability: 'DEX',
    utilize: [{ action: 'Carve a pattern in wood', dc: 10 }],
    craft: ['Club', 'Greatclub', 'Quarterstaff', 'Ranged weapons (except Pistol, Musket, Sling)', 'Arcane Focus', 'Arrows', 'Bolts', 'Druidic Focus', 'Ink Pen', 'Needles'],
    skills: ['Arcana', 'History'],
  },
  'disguise kit': {
    ability: 'CHA',
    utilize: [{ action: 'Apply makeup', dc: 10 }],
    craft: ['Costume'],
    skills: ['Deception', 'Performance'],
  },
  'forgery kit': {
    ability: 'DEX',
    utilize: [{ action: "Mimic 10 or fewer words of someone else's handwriting", dc: 15 }, { action: 'Duplicate a wax seal', dc: 20 }],
    skills: ['Deception', 'Sleight of Hand'],
  },
  'gaming set': {
    ability: 'WIS',
    utilize: [{ action: 'Discern whether someone is cheating', dc: 10 }, { action: 'Win the game', dc: 20 }],
    skills: ['Insight', 'Deception'],
  },
  'herbalism kit': {
    ability: 'INT',
    utilize: [{ action: 'Identify a plant', dc: 10 }],
    craft: ['Antitoxin', 'Candle', "Healer's Kit", 'Potion of Healing'],
    skills: ['Medicine', 'Nature', 'Survival'],
  },
  'musical instrument': {
    ability: 'CHA',
    utilize: [{ action: 'Play a known tune', dc: 10 }, { action: 'Improvise a song', dc: 15 }],
    skills: ['Performance'],
  },
  "navigator's tools": {
    ability: 'WIS',
    utilize: [{ action: 'Plot a course', dc: 10 }, { action: 'Determine position by stargazing', dc: 15 }],
    skills: ['Survival'],
  },
  "poisoner's kit": {
    ability: 'INT',
    utilize: [{ action: 'Detect a poisoned object', dc: 10 }],
    craft: ['Basic Poison'],
    skills: ['Medicine', 'Nature'],
  },
  "thieves' tools": {
    ability: 'DEX',
    utilize: [{ action: 'Pick a lock', dc: 15 }, { action: 'Disarm a trap', dc: 15 }],
    skills: ['Sleight of Hand', 'Investigation'],
  },
};

const GAMING = ['dice', 'dragonchess', 'playing card', 'three-dragon ante', 'gaming set'];
const INSTRUMENTS = ['bagpipes', 'drum', 'dulcimer', 'flute', 'horn', 'lute', 'lyre', 'pan flute', 'shawm', 'viol', 'instrument'];

/** "Cartographer’s Tools" → "cartographer's tools" (curly quotes and case folded). */
const key = (name: string) => name.trim().toLowerCase().replace(/[‘’`]/g, "'");

/** Rules for a tool by name; gaming sets and instruments map to their family. null for unknown/homebrew tools. */
export function toolRules(name: string): ToolRules | null {
  const k = key(name);
  if (TOOLS[k]) return TOOLS[k];
  if (GAMING.some((g) => k.includes(g))) return TOOLS['gaming set'];
  if (INSTRUMENTS.some((i) => k.includes(i))) return TOOLS['musical instrument'];
  return null;
}

export const hasTool = (tools: { name: string }[], name: string) => tools.some((t) => key(t.name) === key(name));
