import { useEffect, useMemo, useState } from 'react';
import { buildCharacter, type Character } from '../lib/character';
import { fetchLevelUpInfo, slugify } from '../lib/api';
import { api } from '../lib/client';
import { useDice } from '../lib/dice';
import { ABILITIES, ABILITY_NAMES, fixedHitDie, fmt, type Ability } from '../lib/rules';
import { toast } from '../lib/toast';
import { levelChoiceFor, type LevelChoiceKind } from '../data/supplement';
import { navigate } from '../lib/router';
import type { PlayApi } from '../hooks/usePlayState';
import { homebrewId, homebrewIndex, type AbilityBonus, type CharacterDto, type HomebrewSubclass, type LevelChoice, type LevelUpInfo, type PlayState } from '../shared/types';
import { SpellPicker, useSpellFilters } from './SpellPicker';
import { SpellCounters } from './SpellBrowser';
import { Loader } from './Loader';

type Status<T> = { state: 'idle' | 'loading' } | { state: 'done'; data: T } | { state: 'error'; message: string };
type Option = { index: string; name: string; description: string; homebrew?: boolean };
/** An SRD pick, or a custom one typed in by the player. */
type PickDraft = { custom: false; option: Option } | { custom: true; name: string; notes: string };
type AsiMode = 'plus2' | 'plus1' | 'feat';
type Step = 'confirm' | 'hp' | 'subclass' | 'asi' | 'option' | 'boon' | 'spells' | 'review';

const STEP_LABEL: Record<Step, string> = {
  confirm: 'Level up', hp: 'Hit points', subclass: 'Subclass', asi: 'Ability scores or feat',
  option: 'Feature option', boon: 'Epic boon', spells: 'Spells', review: 'Review',
};

function useLevelInfo(cls: string, level: number, subclass: string | undefined, enabled: boolean, attempt: number) {
  const [status, setStatus] = useState<Status<LevelUpInfo>>({ state: 'idle' });
  useEffect(() => {
    if (!enabled) return setStatus({ state: 'idle' });
    let live = true;
    setStatus({ state: 'loading' });
    fetchLevelUpInfo(cls, level, subclass)
      .then((data) => live && setStatus({ state: 'done', data }))
      .catch((e: Error) => live && setStatus({ state: 'error', message: e.message }));
    return () => {
      live = false;
    };
  }, [cls, level, subclass, enabled, attempt]);
  return status;
}

const pickReady = (p: PickDraft | null) => !!p && (p.custom ? !!p.name.trim() : true);
const toPick = (p: PickDraft) =>
  p.custom
    ? { index: `custom-${slugify(p.name) || 'pick'}`, name: p.name.trim(), custom: true, ...(p.notes.trim() ? { notes: p.notes.trim() } : {}) }
    : p.option.homebrew
      ? { index: p.option.index, name: p.option.name, homebrew: true }
      : { index: p.option.index, name: p.option.name, description: p.option.description };
const bonus = (k: Ability | '', n = 1): AbilityBonus | undefined => (k ? { [k]: n } : undefined);

/** Wizard state kept while the player detours to the homebrew editor (sessionStorage, read once). */
interface SavedDraft {
  stepIdx: number;
  hp: LevelChoice['hp'] | null;
  rolled: number | null;
  subclass: PickDraft | null;
  variant: string | null;
  asiMode: AsiMode;
  plus2: Ability | '';
  plus1: Ability[];
  feat: PickDraft | null;
  featPlus: Ability | '';
  option: string;
  boon: PickDraft | null;
  boonPlus: Ability | '';
  chosenCantrips: string[];
  prepared: string[];
}
const draftKey = (id: number, level: number) => `levelup-draft-${id}-${level}`;
function takeDraft(id: number, level: number): Partial<SavedDraft> {
  try {
    const raw = sessionStorage.getItem(draftKey(id, level));
    sessionStorage.removeItem(draftKey(id, level));
    return raw ? (JSON.parse(raw) as SavedDraft) : {};
  } catch {
    return {};
  }
}

export function LevelUp({
  dto,
  c,
  play,
  onClose,
  onDone,
  onOpenSpell,
  covered,
  initialPick,
}: {
  /** subclass index to preselect, e.g. a homebrew subclass just created from the wizard */
  initialPick?: string;
  dto: CharacterDto;
  c: Character;
  play: PlayApi;
  onClose: () => void;
  onDone: (character: CharacterDto) => void;
  onOpenSpell: (name: string) => void;
  covered: boolean;
}) {
  const { roll, active: diceShowing } = useDice();
  const level = c.level + 1;
  const hitDie = c.rules.hitDie;
  const [attempt, setAttempt] = useState(0);
  const [saved] = useState(() => takeDraft(dto.id, level));
  const [stepIdx, setStepIdx] = useState(saved.stepIdx ?? 0);
  const [saving, setSaving] = useState(false);

  // Drafts
  const [hp, setHp] = useState<LevelChoice['hp'] | null>(saved.hp ?? null);
  /** the one roll this level-up gets; kept when switching to the average and back */
  const [rolled, setRolled] = useState<number | null>(saved.rolled ?? null);
  const [subclass, setSubclass] = useState<PickDraft | null>(saved.subclass ?? null);
  const [variant, setVariant] = useState<string | null>(saved.variant ?? null);
  const [asiMode, setAsiMode] = useState<AsiMode>(saved.asiMode ?? 'plus2');
  const [plus2, setPlus2] = useState<Ability | ''>(saved.plus2 ?? '');
  const [plus1, setPlus1] = useState<Ability[]>(saved.plus1 ?? []);
  const [feat, setFeat] = useState<PickDraft | null>(saved.feat ?? null);
  const [featPlus, setFeatPlus] = useState<Ability | ''>(saved.featPlus ?? '');
  const [option, setOption] = useState(saved.option ?? '');
  const [boon, setBoon] = useState<PickDraft | null>(saved.boon ?? null);
  const [boonPlus, setBoonPlus] = useState<Ability | ''>(saved.boonPlus ?? '');
  const [chosenCantrips, setChosenCantrips] = useState<string[]>(() => saved.chosenCantrips ?? play.state.chosenCantrips);
  const [prepared, setPrepared] = useState<string[]>(() => saved.prepared ?? play.state.prepared);
  const filters = useSpellFilters();

  // Homebrew subclasses of this class, offered next to the SRD ones.
  const [homebrew, setHomebrew] = useState<HomebrewSubclass[]>([]);
  useEffect(() => {
    api<HomebrewSubclass[]>('GET', `/homebrew/subclasses?class=${c.classKey}`).then((r) => r.data && setHomebrew(r.data));
  }, [c.classKey]);

  const knownSub = c.subclass && !c.subclass.custom && !c.subclass.homebrew ? c.subclass.index : undefined;
  const base = useLevelInfo(c.classKey, level, knownSub, true, attempt);
  const info = base.state === 'done' ? base.data : null;

  const choiceKinds = useMemo(() => {
    const out: { feature: string; choice: LevelChoiceKind }[] = [];
    for (const f of info?.features ?? []) {
      const choice = levelChoiceFor(f.index);
      if (!choice || (choice.kind === 'subclass' && c.subclass)) continue;
      out.push({ feature: f.name, choice });
    }
    return out;
  }, [info, c.subclass]);
  const needs = (k: LevelChoiceKind['kind']) => choiceKinds.some((x) => x.choice.kind === k);
  const optionChoice = choiceKinds.find((x) => x.choice.kind === 'option') as
    | { feature: string; choice: Extract<LevelChoiceKind, { kind: 'option' }> }
    | undefined;

  const subclassOptions: Option[] = [
    ...(info?.subclasses ?? []),
    ...homebrew.map((h) => ({ index: homebrewIndex(h.id), name: h.name, description: h.description, homebrew: true })),
  ];
  // Preselect a homebrew subclass the player just created from here.
  useEffect(() => {
    if (!initialPick || subclass) return;
    const o = subclassOptions.find((x) => x.index === initialPick);
    if (o) setSubclass({ custom: false, option: o });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPick, homebrew.length, info]);

  // Subclass features of an SRD subclass picked at this level.
  const pickedSub =
    needs('subclass') && subclass && !subclass.custom && !subclass.option.homebrew ? subclass.option.index : undefined;
  const pickedHomebrew =
    needs('subclass') && subclass && !subclass.custom ? (homebrew.find((h) => homebrewIndex(h.id) === subclass.option.index) ?? null) : null;
  const subInfo = useLevelInfo(c.classKey, level, pickedSub, !!pickedSub, attempt);
  const features = (pickedSub ? (subInfo.state === 'done' ? subInfo.data.features : []) : info?.features ?? [])
    .filter((f) => !levelChoiceFor(f.index))
    .map(({ name, source, description }) => ({ name, source, description }));

  const steps: Step[] = [
    'confirm',
    'hp',
    ...(['subclass', 'asi', 'option', 'boon'] as const).filter((k) => needs(k)),
    ...(c.spellAbility ? (['spells'] as const) : []),
    'review',
  ];
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  const choice: LevelChoice = useMemo(() => {
    const out: LevelChoice = { level, hp: hp ?? { method: 'fixed', die: fixedHitDie(hitDie) }, features };
    if (needs('subclass') && subclass && pickReady(subclass)) out.subclass = toPick(subclass);
    if (needs('asi')) {
      if (asiMode === 'plus2' && plus2) out.asi = { kind: 'scores', plus: { [plus2]: 2 } };
      if (asiMode === 'plus1' && plus1.length === 2) out.asi = { kind: 'scores', plus: { [plus1[0]]: 1, [plus1[1]]: 1 } };
      if (asiMode === 'feat' && feat && pickReady(feat)) {
        const p = bonus(featPlus);
        out.asi = { kind: 'feat', ...toPick(feat), ...(p ? { plus: p } : {}) };
      }
    }
    if (optionChoice && option) {
      out.option = {
        feature: optionChoice.feature,
        choice: option,
        description: optionChoice.choice.options.find((o) => o.name === option)?.description,
      };
    }
    if (needs('boon') && boon && pickReady(boon)) {
      const p = bonus(boonPlus);
      out.boon = { ...toPick(boon), ...(p ? { plus: p } : {}) };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, hp, hitDie, JSON.stringify(features), choiceKinds, subclass, asiMode, plus2, plus1, feat, featPlus, option, boon, boonPlus]);

  const previewHomebrew = homebrewId(choice.subclass?.index) !== null ? pickedHomebrew : dto.homebrew;
  const preview = useMemo(
    () => buildCharacter(dto.sheet, dto.extras, [...dto.levels, choice], previewHomebrew),
    [dto, choice, previewHomebrew],
  );
  // The subclass picked now brings a variant choice (Circle of the Land's land type, homebrew variants).
  const variantChoice = choice.subclass ? preview.variants : null;

  // Keep the spell draft inside the new caps (an ability change can't lower them, but be safe).
  const cantripsDone = chosenCantrips.length >= preview.cantripCap;

  const ready: Record<Step, boolean> = {
    confirm: base.state === 'done' && (!pickedSub || subInfo.state === 'done'),
    hp: !!hp,
    subclass: !!choice.subclass && (!variantChoice || !!variant),
    asi: !!choice.asi,
    option: !!choice.option,
    boon: !!choice.boon,
    spells: cantripsDone && prepared.length <= preview.preparedCap,
    review: true,
  };
  const allReady = steps.every((s) => ready[s]);

  useEffect(() => {
    // Esc belongs to whatever is on top: the detail drawer or the dice stage.
    if (covered || diceShowing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [covered, diceShowing, saving, onClose]);

  const rollHp = () => {
    if (rolled !== null) return setHp({ method: 'roll', die: rolled });
    const r = roll(`Hit points (level ${level})`, hitDie, 1, c.mods.CON);
    setRolled(r.kept[0]);
    setHp({ method: 'roll', die: r.kept[0] });
  };

  const toggle = (list: string[], set: (v: string[]) => void, cap: number) => (name: string) =>
    list.includes(name) ? set(list.filter((x) => x !== name)) : list.length < cap && set([...list, name]);

  const lockIn = async () => {
    setSaving(true);
    await play.settle();
    const r = await api<{ character: CharacterDto; play: { state: PlayState; version: number } }>(
      'POST',
      `/characters/${dto.id}/levels`,
      { choice, spells: { chosenCantrips, prepared }, ...(variantChoice ? { variant } : {}) },
    );
    setSaving(false);
    if (!r.data) return toast(`Could not level up: ${r.error}`, 'error');
    play.replace(r.data.play.state, r.data.play.version);
    onDone(r.data.character);
    toast(`${c.name} reached level ${level}!`);
  };

  const createHomebrew = () => {
    const d: SavedDraft = {
      stepIdx, hp, rolled, subclass, variant, asiMode, plus2, plus1, feat, featPlus, option, boon, boonPlus, chosenCantrips, prepared,
    };
    try {
      sessionStorage.setItem(draftKey(dto.id, level), JSON.stringify(d));
    } catch {
      /* storage unavailable: the wizard starts over */
    }
    const back = `/c/${dto.id}?levelup=1`;
    navigate(`/homebrew/new?class=${c.classKey}&return=${encodeURIComponent(back)}`);
  };

  const hpGain = preview.hitPoints - c.hitPoints;

  return (
    <>
      <div className="scrim browser-scrim" onClick={() => !saving && onClose()} />
      <div className="browser levelup tome" role="dialog" aria-label={`Level up to ${level}`}>
        <header className="browser-head">
          <div>
            <h2>{STEP_LABEL[step]}</h2>
            <p className="muted small-print">
              {c.className} {c.level} → {level} · step {steps.indexOf(step) + 1} of {steps.length}
            </p>
          </div>
          {step === 'spells' && <SpellCounters c={preview} chosenCantrips={chosenCantrips} prepared={prepared} />}
          <button className="close" onClick={onClose} disabled={saving} aria-label="Close">×</button>
        </header>

        {step === 'spells' ? (
          <SpellPicker
            c={preview}
            chosenCantrips={chosenCantrips}
            prepared={prepared}
            onToggleCantrip={toggle(chosenCantrips, setChosenCantrips, preview.cantripCap)}
            onTogglePrepared={toggle(prepared, setPrepared, preview.preparedCap)}
            onOpenSpell={onOpenSpell}
            filters={filters}
          />
        ) : (
          <div className="browser-body levelup-body">
            {step === 'confirm' && (
              <>
                <p>
                  Advance <strong>{c.name}</strong> to {c.className.toLowerCase()} level {level}?
                </p>
                {(base.state === 'loading' || subInfo.state === 'loading') && <Loader label="Consulting the archives" />}
                {(base.state === 'error' || subInfo.state === 'error') && (
                  <p className="muted">
                    Couldn’t load the level {level} features (
                    {base.state === 'error' ? base.message : subInfo.state === 'error' ? subInfo.message : ''}).{' '}
                    <button className="btn ghost small" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
                  </p>
                )}
                {info && <Changes before={c} after={preview} />}
                {info && choiceKinds.length > 0 && (
                  <p className="hint">You’ll choose: {choiceKinds.map((x) => x.feature).join(', ')}.</p>
                )}
              </>
            )}

            {step === 'hp' && (
              <>
                <p>
                  Gain one {`d${hitDie}`} + CON ({fmt(c.mods.CON)}) hit points. The minimum is 1.
                </p>
                <div className="choice-grid">
                  <button
                    className={`choice ${hp?.method === 'fixed' ? 'sel' : ''}`}
                    onClick={() => setHp(hp?.method === 'fixed' ? null : { method: 'fixed', die: fixedHitDie(hitDie) })}
                  >
                    <strong>Take the average</strong>
                    <span>{fixedHitDie(hitDie)} {fmt(c.mods.CON)} = +{Math.max(1, fixedHitDie(hitDie) + c.mods.CON)} HP</span>
                  </button>
                  <button className={`choice ${hp?.method === 'roll' ? 'sel' : ''}`} onClick={rollHp}>
                    <strong>{rolled === null ? `Roll 1d${hitDie}` : 'Use my roll'}</strong>
                    <span>
                      {rolled !== null
                        ? `Rolled ${rolled} ${fmt(c.mods.CON)} = +${Math.max(1, rolled + c.mods.CON)} HP`
                        : `Between +${Math.max(1, 1 + c.mods.CON)} and +${hitDie + c.mods.CON} HP`}
                    </span>
                  </button>
                </div>
                {rolled !== null && <p className="hint">You can switch between the average and your roll; the roll can’t be repeated.</p>}
                {hp && <p className="hint">Max HP {c.hitPoints} → {preview.hitPoints}.</p>}
              </>
            )}

            {step === 'subclass' && (
              <>
                <PickList
                  options={subclassOptions}
                  value={subclass}
                  onChange={(p) => {
                    setSubclass(p);
                    setVariant(null);
                  }}
                />
                <button className="btn ghost small create-homebrew" onClick={createHomebrew}>
                  ✒&#xFE0E; Create a homebrew subclass…
                </button>
                {variantChoice && (
                  <div className="land-pick">
                    <h3>{variantChoice.label}</h3>
                    <p className="hint">You can change this after each long rest.</p>
                    <div className="chips">
                      {variantChoice.options.map((o) => (
                        <button
                          key={o.name}
                          title={o.description || undefined}
                          className={`chip ${variant === o.name ? 'sel' : ''}`}
                          onClick={() => setVariant(o.name)}
                        >
                          {o.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {pickedHomebrew && (
                  <p className="hint">
                    You gain: {pickedHomebrew.levels.filter((l) => l.level <= level).flatMap((l) => l.features.map((f) => f.name)).join(', ') || 'no features at this level'}.
                  </p>
                )}
                {pickedSub && subInfo.state === 'done' && features.length > 0 && (
                  <p className="hint">You gain: {features.map((f) => f.name).join(', ')}.</p>
                )}
              </>
            )}

            {step === 'asi' && (
              <>
                <div className="chips">
                  {(['plus2', 'plus1', 'feat'] as const).map((m) => (
                    <button key={m} className={`chip ${asiMode === m ? 'sel' : ''}`} onClick={() => setAsiMode(m)}>
                      {m === 'plus2' ? '+2 to one score' : m === 'plus1' ? '+1 to two scores' : 'Take a feat'}
                    </button>
                  ))}
                </div>
                {asiMode !== 'feat' ? (
                  <ul className="rows ability-pick">
                    {ABILITIES.map((k) => {
                      const score = c.abilities.find((a) => a.key === k)!.score;
                      const on = asiMode === 'plus2' ? plus2 === k : plus1.includes(k);
                      const add = asiMode === 'plus2' ? 2 : 1;
                      const blocked = !on && (score + add > 20 || (asiMode === 'plus1' && plus1.length >= 2));
                      return (
                        <li key={k}>
                          <button
                            className={`row ${on ? 'sel' : ''}`}
                            disabled={blocked}
                            onClick={() =>
                              asiMode === 'plus2'
                                ? setPlus2(on ? '' : k)
                                : setPlus1(on ? plus1.filter((x) => x !== k) : [...plus1, k])
                            }
                          >
                            <span className={`pip ${on ? 'on' : ''}`} />
                            <span className="row-name">{ABILITY_NAMES[k]}</span>
                            <span className="row-val">{score}{on ? ` → ${score + add}` : ''}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <>
                    <PickList options={info?.feats ?? []} value={feat} onChange={setFeat} customLabel="Custom feat (not in the SRD)" />
                    <AbilityPlus c={c} cap={20} value={featPlus} onChange={setFeatPlus} label="If the feat raises an ability score by 1:" />
                  </>
                )}
                <p className="hint">Scores can’t go above 20.</p>
              </>
            )}

            {step === 'option' && optionChoice && (
              <>
                <p>{optionChoice.feature}: choose one.</p>
                <div className="choice-grid">
                  {optionChoice.choice.options.map((o) => (
                    <button key={o.name} className={`choice ${option === o.name ? 'sel' : ''}`} onClick={() => setOption(o.name)}>
                      <strong>{o.name}</strong>
                      <span>{o.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 'boon' && (
              <>
                <PickList options={info?.boons ?? []} value={boon} onChange={setBoon} customLabel="Custom boon (not in the SRD)" />
                <AbilityPlus c={c} cap={30} value={boonPlus} onChange={setBoonPlus} label="Epic boons raise one ability score by 1 (up to 30):" />
              </>
            )}

            {step === 'review' && (
              <>
                <Changes before={c} after={preview} />
                <h3>Choices</h3>
                <ul className="review-list">
                  <li>
                    Hit points: {choice.hp.method === 'fixed' ? 'average' : 'rolled'} {choice.hp.die} {fmt(preview.mods.CON)} → +{hpGain} max HP
                    {hpGain !== Math.max(1, choice.hp.die + preview.mods.CON) && ' (CON change applied to earlier levels too)'}
                  </li>
                  {choice.subclass && <li>Subclass: {choice.subclass.name}{choice.subclass.custom && ' (custom)'}{choice.subclass.homebrew && ' (homebrew)'}{variant && ` · ${variant}`}</li>}
                  {choice.asi?.kind === 'scores' && (
                    <li>Ability Score Improvement: {Object.entries(choice.asi.plus).map(([k, n]) => `${k} +${n}`).join(', ')}</li>
                  )}
                  {choice.asi?.kind === 'feat' && (
                    <li>Feat: {choice.asi.name}{choice.asi.custom && ' (custom)'}{choice.asi.plus && ` (${Object.keys(choice.asi.plus)[0]} +1)`}</li>
                  )}
                  {choice.option && <li>{choice.option.feature}: {choice.option.choice}</li>}
                  {choice.boon && <li>Epic boon: {choice.boon.name}{choice.boon.custom && ' (custom)'}{choice.boon.plus && ` (${Object.keys(choice.boon.plus)[0]} +1)`}</li>}
                  <SpellDiff label="Cantrips" before={play.state.chosenCantrips} after={chosenCantrips} />
                  <SpellDiff label="Prepared" before={play.state.prepared} after={prepared} />
                </ul>
                {!allReady && (
                  <p className="hint">
                    Still to do: {steps.filter((s) => !ready[s]).map((s) => STEP_LABEL[s]).join(', ')}.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <footer className="levelup-foot">
          {step === 'spells' && !cantripsDone && (
            <span className="hint">Learn {preview.cantripCap - chosenCantrips.length} more cantrip(s) to continue.</span>
          )}
          <button className="btn ghost" disabled={stepIdx === 0 || saving} onClick={() => setStepIdx((i) => i - 1)}>Back</button>
          {step === 'review' ? (
            <button className="btn" disabled={!allReady || saving} onClick={lockIn}>
              {saving ? 'Saving…' : `Lock in level ${level}`}
            </button>
          ) : (
            <button className="btn" disabled={!ready[step]} onClick={() => setStepIdx(steps.indexOf(step) + 1)}>
              {step === 'confirm' ? `Advance to level ${level}` : 'Next'}
            </button>
          )}
        </footer>
      </div>
    </>
  );
}

/** Automatic changes between two derived sheets. */
function Changes({ before, after }: { before: Character; after: Character }) {
  const rows: [string, string, string][] = [];
  const add = (label: string, a: string | number, b: string | number) => {
    if (String(a) !== String(b)) rows.push([label, String(a), String(b)]);
  };
  add('Level', before.level, after.level);
  add('Proficiency bonus', fmt(before.profBonus), fmt(after.profBonus));
  add('Max HP', before.hitPoints, after.hitPoints);
  for (const a of after.abilities) {
    const b = before.abilities.find((x) => x.key === a.key)!;
    add(ABILITY_NAMES[a.key], `${b.score} (${fmt(b.mod)})`, `${a.score} (${fmt(a.mod)})`);
  }
  add('Spell save DC', before.spellSaveDC, after.spellSaveDC);
  add('Spell attack', fmt(before.spellAttack), fmt(after.spellAttack));
  add('Spell slots', before.slots.join(' / ') || '—', after.slots.join(' / '));
  add('Cantrips known', before.cantripCap, after.cantripCap);
  add('Prepared spells', before.preparedCap, after.preparedCap);
  add('Wild Shape uses', before.wildShapeUses, after.wildShapeUses);
  const known = new Set(before.features.map((f) => `${f.name}|${f.source}`));
  const gained = after.features.filter((f) => !known.has(`${f.name}|${f.source}`));
  return (
    <>
      <dl className="meta changes">
        {rows.map(([label, a, b]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{a} → <strong>{b}</strong></dd>
          </div>
        ))}
      </dl>
      {gained.length > 0 && (
        <>
          <h3>New features</h3>
          {gained.map((f) => (
            <details key={`${f.name}|${f.source}`} className="feature">
              <summary>{f.name} <small className="muted">{f.source}</small></summary>
              <p>{f.description}</p>
            </details>
          ))}
        </>
      )}
    </>
  );
}

function SpellDiff({ label, before, after }: { label: string; before: string[]; after: string[] }) {
  const added = after.filter((x) => !before.includes(x));
  const removed = before.filter((x) => !after.includes(x));
  if (!added.length && !removed.length) return null;
  return (
    <li>
      {label}: {[...added.map((x) => `+${x}`), ...removed.map((x) => `−${x}`)].join(', ')}
    </li>
  );
}

/** SRD options as cards, plus a custom entry with name and notes. */
function PickList({
  options,
  value,
  onChange,
  customLabel,
}: {
  options: Option[];
  value: PickDraft | null;
  onChange: (p: PickDraft | null) => void;
  /** offer a free-text custom entry with this label */
  customLabel?: string;
}) {
  return (
    <div className="pick-list">
      {options.map((o) => {
        const on = !!value && !value.custom && value.option.index === o.index;
        return (
          <div key={o.index} className={`choice ${on ? 'sel' : ''}`}>
            <button className="choice-head" onClick={() => onChange(on ? null : { custom: false, option: o })}>
              <span className={`pip ${on ? 'on' : ''}`} />
              <strong>{o.name}</strong>
              {o.homebrew && <span className="src src-subclass">Homebrew</span>}
            </button>
            <details>
              <summary className="muted">Details</summary>
              <p className="pre">{o.description}</p>
            </details>
          </div>
        );
      })}
      {customLabel && <div className={`choice ${value?.custom ? 'sel' : ''}`}>
        <button className="choice-head" onClick={() => onChange(value?.custom ? null : { custom: true, name: '', notes: '' })}>
          <span className={`pip ${value?.custom ? 'on' : ''}`} />
          <strong>{customLabel}</strong>
        </button>
        {value?.custom && (
          <div className="custom-fields">
            <input
              placeholder="Name"
              value={value.name}
              autoFocus
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
            <textarea
              placeholder="Notes (what it does)"
              rows={3}
              value={value.notes}
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
            />
          </div>
        )}
      </div>}
    </div>
  );
}

function AbilityPlus({
  c,
  cap,
  value,
  onChange,
  label,
}: {
  c: Character;
  cap: number;
  value: Ability | '';
  onChange: (k: Ability | '') => void;
  label: string;
}) {
  return (
    <label className="ability-plus">
      <span className="hint">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Ability | '')}>
        <option value="">None</option>
        {c.abilities.map((a) => (
          <option key={a.key} value={a.key} disabled={a.score >= cap}>
            {ABILITY_NAMES[a.key]} ({a.score} → {a.score + 1})
          </option>
        ))}
      </select>
    </label>
  );
}
