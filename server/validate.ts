// Hand-written guards for request bodies.
import { ABILITY_KEYS, COINS, EVENT_TYPES, type AbilityBonus, type AbilityKey, type Coins, type EventIn, type FeatureText, type HomebrewBuffs, type HomebrewLevel, type HomebrewResource, type HomebrewSubclass, type LevelChoice, type Pick, type PlayState } from '../src/shared/types';
import { CLASSES, SKILLS } from '../src/lib/rules';
import type { ItemPatch } from '../src/shared/inventory';
import { HttpError } from './http';

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number => Number.isInteger(v) && (v as number) >= min;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export const bad = (msg: string): never => {
  throw new HttpError(400, msg);
};

export function asPlayState(v: unknown): PlayState {
  if (!isObj(v)) return bad('state must be an object');
  const ok =
    isInt(v.hp) &&
    isInt(v.tempHp) &&
    Array.isArray(v.slotsUsed) &&
    v.slotsUsed.every((x) => isInt(x)) &&
    typeof v.goodberryUsed === 'boolean' &&
    isInt(v.hitDiceUsed) &&
    (v.concentration === null || typeof v.concentration === 'string') &&
    isStrArr(v.conditions) &&
    isObj(v.deathSaves) &&
    isInt(v.deathSaves.success) &&
    isInt(v.deathSaves.fail) &&
    isStrArr(v.chosenCantrips) &&
    isStrArr(v.prepared) &&
    (v.wildShapeUsed === undefined || isInt(v.wildShapeUsed)) &&
    (v.variant === undefined || v.variant === null || typeof v.variant === 'string') &&
    (v.resourcesUsed === undefined || (isObj(v.resourcesUsed) && Object.values(v.resourcesUsed).every((n) => isInt(n))));
  if (!ok) bad('state is not a valid PlayState');
  return v as unknown as PlayState;
}

export function asEvents(v: unknown): EventIn[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 200) return bad('events must be an array (max 200)');
  return v.map((e) => {
    if (!isObj(e) || !EVENT_TYPES.includes(e.type as never) || typeof e.summary !== 'string' || e.summary.length > 500)
      bad('invalid event');
    return { type: (e as Obj).type, summary: (e as Obj).summary, data: (e as Obj).data } as EventIn;
  });
}

export function asCoins(v: unknown): Coins {
  if (!isObj(v) || !COINS.every((k) => isInt(v[k]))) return bad('coins must have non-negative integer cp, sp, ep, gp, pp');
  return Object.fromEntries(COINS.map((k) => [k, v[k]])) as Coins;
}

export function asItemPatch(v: unknown): ItemPatch {
  if (!isObj(v)) return bad('patch must be an object');
  const out: ItemPatch = {};
  if (v.name !== undefined) out.name = typeof v.name === 'string' ? v.name : bad('name must be a string');
  if (v.qty !== undefined) out.qty = typeof v.qty === 'number' ? v.qty : bad('qty must be a number');
  if (v.equipped !== undefined) out.equipped = typeof v.equipped === 'boolean' ? v.equipped : bad('equipped must be a boolean');
  return out;
}

export const optId = (v: unknown): string | undefined =>
  v === undefined ? undefined : typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : bad('invalid id');

const SPELL_SOURCES = ['Class', 'Magic Initiate', 'Gnome', 'Species', 'Subclass', 'Other'];

/** Upper bound for a stored portrait (data URL length); scaled uploads are far below it. */
const MAX_PORTRAIT_LENGTH = 1_500_000;

/** A portrait is an image data URL or an app path (the seeded "/faelanmosswalker.png"); remote URLs can't load. */
export function asPortrait(v: unknown): string {
  if (typeof v !== 'string') return bad('portrait must be a string');
  if (v.length > MAX_PORTRAIT_LENGTH) return bad('portrait is too large (max 1.5 MB)');
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) && !/^\/[\w./-]+$/.test(v))
    return bad('portrait must be an image data URL (PNG, JPEG, WebP or GIF)');
  return v;
}

export function asExtras(v: unknown): import('../src/shared/types').CharacterExtras {
  if (v === undefined) return {};
  if (!isObj(v)) return bad('extras must be an object');
  const out: import('../src/shared/types').CharacterExtras = {};
  if (v.portrait !== undefined) out.portrait = asPortrait(v.portrait);
  if (v.bonusCantrips !== undefined) out.bonusCantrips = isInt(v.bonusCantrips) ? v.bonusCantrips : bad('bonusCantrips must be an integer');
  const spellList = (x: unknown, name: string, withSource: boolean) => {
    if (!Array.isArray(x)) return bad(`${name} must be an array`);
    return x.map((s) => {
      if (!isObj(s) || typeof s.name !== 'string' || !isInt(s.level) || (s.level as number) > 9) bad(`${name}: each entry needs name and level 0–9`);
      const o = s as Obj;
      if (withSource && !SPELL_SOURCES.includes(o.source as string)) bad(`${name}: source must be one of ${SPELL_SOURCES.join(', ')}`);
      return withSource
        ? { name: o.name as string, level: o.level as number, source: o.source as never, ...(typeof o.note === 'string' ? { note: o.note } : {}) }
        : { name: o.name as string, level: o.level as number };
    });
  };
  if (v.bonusSpells !== undefined) out.bonusSpells = spellList(v.bonusSpells, 'bonusSpells', true) as never;
  if (v.extraClassSpells !== undefined) out.extraClassSpells = spellList(v.extraClassSpells, 'extraClassSpells', false);
  return out;
}

export const optCampaignId = (v: unknown): number | null | undefined =>
  v === undefined ? undefined : v === null ? null : isInt(v, 1) ? v : bad('campaignId must be a positive integer or null');

const str = (v: unknown, name: string, max = 200): string =>
  typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : bad(`${name} must be a non-empty string (max ${max})`);
const optStr = (v: unknown, name: string, max = 4000): string | undefined =>
  v === undefined || v === '' ? undefined : typeof v === 'string' && v.length <= max ? v : bad(`${name} must be a string`);

function asBonus(v: unknown, name: string, total: number): AbilityBonus | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) return bad(`${name} must be an object`);
  const out: AbilityBonus = {};
  let sum = 0;
  for (const [k, n] of Object.entries(v)) {
    if (!ABILITY_KEYS.includes(k as never) || !isInt(n, 1) || (n as number) > 2) bad(`${name}: ${k} must be an ability and 1 or 2`);
    out[k as keyof AbilityBonus] = n as number;
    sum += n as number;
  }
  if (sum > total) bad(`${name} adds up to more than ${total}`);
  return out;
}

function asPick<T extends object>(v: unknown, name: string, extra: (o: Obj) => T): Pick & T {
  if (!isObj(v)) return bad(`${name} must be an object`);
  return {
    index: str(v.index, `${name}.index`, 100),
    name: str(v.name, `${name}.name`),
    ...(v.custom === true ? { custom: true } : {}),
    ...(v.homebrew === true ? { homebrew: true } : {}),
    ...(optStr(v.notes, `${name}.notes`) ? { notes: v.notes as string } : {}),
    ...extra(v),
  };
}

const desc = (o: Obj, name: string) => {
  const d = optStr(o.description, `${name}.description`, 20000);
  return d ? { description: d } : {};
};

/** A level-up record for the level after the character's current one. */
export function asLevelChoice(v: unknown, expectedLevel: number, hitDie: number): LevelChoice {
  if (!isObj(v)) return bad('choice must be an object');
  if (v.level !== expectedLevel) bad(`choice.level must be ${expectedLevel}`);
  const hp = v.hp;
  if (!isObj(hp) || (hp.method !== 'fixed' && hp.method !== 'roll') || !isInt(hp.die, 1) || (hp.die as number) > hitDie)
    bad(`choice.hp must be { method: 'fixed' | 'roll', die: 1–${hitDie} }`);
  const out: LevelChoice = {
    level: expectedLevel,
    hp: { method: (hp as Obj).method as 'fixed' | 'roll', die: (hp as Obj).die as number },
    features: [],
  };
  if (v.subclass !== undefined) out.subclass = asPick(v.subclass, 'subclass', (o) => desc(o, 'subclass'));
  if (v.asi !== undefined) {
    const a = v.asi;
    if (!isObj(a)) bad('asi must be an object');
    const ao = a as Obj;
    if (ao.kind === 'scores') {
      const plus = asBonus(ao.plus, 'asi.plus', 2) ?? {};
      if (Object.values(plus).reduce((x, y) => x + (y ?? 0), 0) !== 2) bad('asi.plus must add up to 2');
      out.asi = { kind: 'scores', plus };
    } else if (ao.kind === 'feat') {
      const plus = asBonus(ao.plus, 'asi.plus', 1);
      out.asi = { kind: 'feat', ...asPick(ao, 'asi', (o) => desc(o, 'asi')), ...(plus ? { plus } : {}) };
    } else bad("asi.kind must be 'scores' or 'feat'");
  }
  if (v.option !== undefined) {
    const o = v.option;
    if (!isObj(o)) bad('option must be an object');
    out.option = { feature: str((o as Obj).feature, 'option.feature'), choice: str((o as Obj).choice, 'option.choice'), ...desc(o as Obj, 'option') };
  }
  if (v.boon !== undefined) {
    const plus = isObj(v.boon) ? asBonus(v.boon.plus, 'boon.plus', 1) : undefined;
    out.boon = { ...asPick(v.boon, 'boon', (o) => desc(o, 'boon')), ...(plus ? { plus } : {}) };
  }
  if (v.features !== undefined) {
    if (!Array.isArray(v.features) || v.features.length > 20) bad('features must be an array (max 20)');
    out.features = (v.features as unknown[]).map((f, i): FeatureText => {
      if (!isObj(f)) return bad(`features[${i}] must be an object`);
      return { name: str(f.name, `features[${i}].name`), source: str(f.source, `features[${i}].source`), description: optStr(f.description, `features[${i}].description`, 20000) ?? '' };
    });
  }
  return out;
}

/* ---- Homebrew subclasses ---- */

const int = (v: unknown, name: string, min: number, max: number): number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : bad(`${name} must be a whole number ${min}–${max}`);
const optInt = (v: unknown, name: string, min: number, max: number) => (v === undefined || v === null || v === 0 ? undefined : int(v, name, min, max));
const text = (v: unknown, name: string, max: number): string =>
  typeof v === 'string' && v.length <= max ? v.trim() : bad(`${name} must be text (max ${max} characters)`);
const arr = (v: unknown, name: string, max: number): unknown[] =>
  v === undefined ? [] : Array.isArray(v) && v.length <= max ? v : bad(`${name} must be a list (max ${max})`);

function asHomebrewSpell(v: unknown, name: string) {
  if (!isObj(v)) return bad(`${name} must be an object`);
  return { name: str(v.name, `${name}.name`, 100), level: int(v.level, `${name}.level`, 0, 9) };
}

function asBuffs(v: unknown, name: string): HomebrewBuffs {
  if (v === undefined) return {};
  if (!isObj(v)) return bad(`${name} must be an object`);
  const out: HomebrewBuffs = {};
  const n = (k: 'ac' | 'speed' | 'initiative' | 'hpPerLevel' | 'cantrips', min: number, max: number) => {
    const x = optInt(v[k], `${name}.${k}`, min, max);
    if (x !== undefined) out[k] = x;
  };
  n('ac', -5, 10);
  n('speed', -30, 60);
  n('initiative', -5, 10);
  n('hpPerLevel', 0, 5);
  n('cantrips', 0, 5);
  if (v.abilities !== undefined) {
    if (!isObj(v.abilities)) bad(`${name}.abilities must be an object`);
    const ab: AbilityBonus = {};
    for (const [k, x] of Object.entries(v.abilities as Obj)) {
      if (!ABILITY_KEYS.includes(k as AbilityKey)) bad(`${name}.abilities: unknown ability ${k}`);
      const b = optInt(x, `${name}.abilities.${k}`, 1, 4);
      if (b) ab[k as AbilityKey] = b;
    }
    if (Object.keys(ab).length) out.abilities = ab;
  }
  const skills = arr(v.skills, `${name}.skills`, 18);
  if (skills.length) out.skills = skills.map((x) => (typeof x === 'string' && x in SKILLS ? x : bad(`${name}.skills: unknown skill ${x}`)));
  const saves = arr(v.saves, `${name}.saves`, 6);
  if (saves.length) out.saves = saves.map((x) => (ABILITY_KEYS.includes(x as AbilityKey) ? (x as AbilityKey) : bad(`${name}.saves: unknown ability ${x}`)));
  const profs = arr(v.proficiencies, `${name}.proficiencies`, 20).map((x, i) => str(x, `${name}.proficiencies[${i}]`, 100));
  if (profs.length) out.proficiencies = profs;
  return out;
}

function asResource(v: unknown, name: string): HomebrewResource {
  if (!isObj(v)) return bad(`${name} must be an object`);
  const uses =
    v.uses === 'prof' || ABILITY_KEYS.includes(v.uses as AbilityKey) ? (v.uses as HomebrewResource['uses']) : int(v.uses, `${name}.uses`, 1, 20);
  if (v.recharge !== 'short' && v.recharge !== 'long') bad(`${name}.recharge must be 'short' or 'long'`);
  return { name: str(v.name, `${name}.name`, 100), uses, recharge: v.recharge as 'short' | 'long' };
}

/** A homebrew subclass body (without id). Levels must be the class's subclass levels. */
export function asHomebrew(v: unknown): Omit<HomebrewSubclass, 'id'> {
  if (!isObj(v)) return bad('subclass must be an object');
  const classKey = str(v.classKey, 'classKey', 40);
  const rules = CLASSES[classKey] ?? bad(`Unknown class ${classKey}`);
  const levels = arr(v.levels, 'levels', rules.subclassLevels.length).map((l, i): HomebrewLevel => {
    if (!isObj(l)) return bad(`levels[${i}] must be an object`);
    const at = `levels[${i}]`;
    const level = l.level as number;
    if (!rules.subclassLevels.includes(level)) bad(`${at}.level must be one of ${rules.subclassLevels.join(', ')}`);
    return {
      level,
      features: arr(l.features, `${at}.features`, 10).map((f, j) => {
        if (!isObj(f)) return bad(`${at}.features[${j}] must be an object`);
        return { name: str(f.name, `${at}.features[${j}].name`, 100), description: text(f.description ?? '', `${at}.features[${j}].description`, 8000) };
      }),
      spells: arr(l.spells, `${at}.spells`, 20).map((x, j) => asHomebrewSpell(x, `${at}.spells[${j}]`)),
      buffs: asBuffs(l.buffs, `${at}.buffs`),
      resources: arr(l.resources, `${at}.resources`, 5).map((x, j) => asResource(x, `${at}.resources[${j}]`)),
    };
  });
  if (new Set(levels.map((l) => l.level)).size !== levels.length) bad('levels must not repeat a level');
  levels.sort((a, b) => a.level - b.level);
  let variants: HomebrewSubclass['variants'] = null;
  if (v.variants != null) {
    const vv = v.variants;
    if (!isObj(vv)) return bad('variants must be an object or null');
    const options = arr(vv.options, 'variants.options', 12).map((o, i) => {
      if (!isObj(o)) return bad(`variants.options[${i}] must be an object`);
      return {
        name: str(o.name, `variants.options[${i}].name`, 60),
        description: text(o.description ?? '', `variants.options[${i}].description`, 4000),
        spells: arr(o.spells, `variants.options[${i}].spells`, 30).map((x, j) => {
          const at = `variants.options[${i}].spells[${j}]`;
          return { ...asHomebrewSpell(x, at), atLevel: int((x as Obj).atLevel, `${at}.atLevel`, 1, 20) };
        }),
      };
    });
    if (options.length) variants = { label: str(vv.label, 'variants.label', 60), options };
  }
  return { classKey, name: str(v.name, 'name', 100), description: text(v.description ?? '', 'description', 8000), levels, variants };
}
