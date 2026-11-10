// The creation wizard's steps. Each gets the draft, the loaded SRD data and a patch function.
import { useEffect, useState, type ReactNode } from 'react';
import type { Character } from '../../lib/character';
import {
  CUSTOM_BACKGROUND,
  MAGIC_INITIATE_LISTS,
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  backgroundBonus,
  defaultMiList,
  featSkillCount,
  finalScores,
  grantedSkills,
  magicInitiateSources,
  pointCost,
  pointsSpent,
  skillsBeforeClass,
  speciesSkillPicks,
  speciesTraits,
  type CreateData,
  type CreateDraft,
  type MagicInitiatePick,
} from '../../lib/create';
import { fetchClassSpellList, type ClassSpell } from '../../lib/api';
import { portraitFrom } from '../../lib/portrait';
import { ABILITIES, ABILITY_NAMES, SKILLS, fmt, modifier, titleCase, type Ability } from '../../lib/rules';
import type { Campaign, CreateOptions, CreateText, EquipOption, NameChoice } from '../../shared/types';
import { ClassEmblem } from '../ClassEmblem';
import { SpellPicker, useSpellFilters } from '../SpellPicker';
import { SpellCounters } from '../SpellBrowser';
import { Loader } from '../Loader';

export interface StepProps {
  d: CreateDraft;
  data: CreateData;
  options: CreateOptions;
  patch: (p: Partial<CreateDraft>) => void;
}

const SKILL_NAMES = Object.keys(SKILLS);

/** Toggle `name` in `list`, keeping at most `max` entries. */
const toggled = (list: string[], name: string, max: number) =>
  list.includes(name) ? list.filter((x) => x !== name) : list.length < max ? [...list, name] : list;

function Loading({ what }: { what: string }) {
  return <Loader label={`Consulting the archives for ${what}`} />;
}

/** Text entries as collapsible rows, like the sheet's Features card. */
function TextList({ items, source }: { items: { name: string; description: string }[]; source?: string }) {
  return (
    <div>
      {items.map((t) => (
        <details key={t.name} className="feature">
          <summary>
            {t.name} {source && <small>{source}</small>}
          </summary>
          <p className="pre">{t.description}</p>
        </details>
      ))}
    </div>
  );
}

/** Pick `choose` names out of `from` as chips; `locked` ones show as already known. */
function ChipPicker({
  choice,
  value,
  onChange,
  locked = new Map(),
}: {
  choice: NameChoice;
  value: string[];
  onChange: (v: string[]) => void;
  /** name → where it already comes from */
  locked?: Map<string, string>;
}) {
  const full = value.length >= choice.choose;
  return (
    <div className="chips create-chips">
      {choice.from.map((name) => {
        const from = locked.get(name);
        const on = value.includes(name);
        return (
          <button
            key={name}
            type="button"
            className={`chip ${on ? 'sel' : ''} ${from ? 'locked' : ''}`}
            disabled={!!from || (!on && full)}
            title={from ? `Already from ${from}` : undefined}
            aria-pressed={on}
            onClick={() => onChange(toggled(value, name, choice.choose))}
          >
            {name}
            {from && <small> · {from}</small>}
          </button>
        );
      })}
    </div>
  );
}

function Counter({ have, need }: { have: number; need: number }) {
  return <span className={`counter ${have >= need ? 'full' : ''}`}>{have}/{need}</span>;
}

/* 1. Class */

export function ClassStep({ d, data, options, patch }: StepProps) {
  const pick = (index: string) =>
    index !== d.classIndex &&
    patch({ classIndex: index, classSkills: [], classTools: [], classEquip: '', cantrips: [], prepared: [] });
  const cls = data.cls;
  return (
    <>
      <div className="pick-grid">
        {options.classes.map((c) => (
          <button
            key={c.index}
            type="button"
            data-class={c.index}
            className={`card rune-card pick-card ${d.classIndex === c.index ? 'sel' : ''}`}
            aria-pressed={d.classIndex === c.index}
            onClick={() => pick(c.index)}
          >
            <ClassEmblem classKey={c.index} className="emblem pick-emblem" />
            <strong>{c.name}</strong>
            <small>
              d{c.hitDie} · {c.primary}
            </small>
            <span className="pick-tag">{c.spellAbility ? `Spellcaster · ${c.spellAbility}` : 'Martial'}</span>
          </button>
        ))}
      </div>
      {d.classIndex && !cls && <Loading what="the class" />}
      {cls && (
        <section className="card pick-detail" data-class={cls.index}>
          <h2>
            <ClassEmblem classKey={cls.index} className="emblem inline-emblem" /> {cls.name}
          </h2>
          <dl className="facts">
            <div><dt>Hit die</dt><dd>d{cls.hitDie}</dd></div>
            <div><dt>Primary</dt><dd>{cls.primary}</dd></div>
            <div><dt>Saves</dt><dd>{cls.saves.join(', ')}</dd></div>
            <div><dt>Skills</dt><dd>choose {cls.skills.choose}</dd></div>
            {cls.spellAbility && <div><dt>Spells at level 1</dt><dd>{cls.cantrips ? `${cls.cantrips} cantrips, ` : ''}{cls.prepared} prepared</dd></div>}
          </dl>
          {cls.proficiencies.length > 0 && <p className="hint">Training: {cls.proficiencies.join(', ')}.</p>}
          <h3>Level 1 features</h3>
          <TextList items={cls.features} />
        </section>
      )}
    </>
  );
}

/* 2. Species */

export function SpeciesStep({ d, data, options, patch }: StepProps) {
  const pick = (index: string) =>
    index !== d.speciesIndex && patch({ speciesIndex: index, lineage: '', size: '', speciesSkills: {}, speciesFeat: '' });
  const sp = data.species;
  const traits = speciesTraits(d, sp);
  const bgSkills = new Map(grantedSkills(data).map((s) => [s, data.background?.name ?? 'background']));
  return (
    <>
      <div className="pick-grid">
        {options.species.map((s) => (
          <button
            key={s.index}
            type="button"
            className={`card pick-card ${d.speciesIndex === s.index ? 'sel' : ''}`}
            aria-pressed={d.speciesIndex === s.index}
            onClick={() => pick(s.index)}
          >
            <strong>{s.name}</strong>
            <small>
              {s.sizes.join(' or ')} · {s.speed} ft.
            </small>
            <span className="pick-traits">{s.traitNames.join(' · ')}</span>
          </button>
        ))}
      </div>
      {d.speciesIndex && !sp && <Loading what="the species" />}
      {sp && (
        <section className="card pick-detail">
          <h2>{sp.name}</h2>
          {sp.lineages.length > 0 && (
            <>
              <h3>{sp.lineageLabel}</h3>
              <div className="choice-grid">
                {sp.lineages.map((l) => (
                  <button
                    key={l.index}
                    type="button"
                    className={`choice ${d.lineage === l.index ? 'sel' : ''}`}
                    aria-pressed={d.lineage === l.index}
                    onClick={() => patch({ lineage: l.index, speciesSkills: {} })}
                  >
                    <strong>{l.name.replace(/^.*?:\s*/, '')}</strong>
                    <span>{l.traits.map((t) => t.name.replace(/^.*?:\s*/, '')).join(' · ') || 'No level 1 benefit'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {sp.sizes.length > 1 && (
            <>
              <h3>Size</h3>
              <div className="chips">
                {sp.sizes.map((s) => (
                  <button key={s} type="button" className={`chip ${d.size === s ? 'sel' : ''}`} onClick={() => patch({ size: s })}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
          {traits
            .filter((t) => t.skills)
            .map((t) => (
              <div key={t.index}>
                <h3>
                  {t.name} <small>{t.skills!.desc}</small>
                </h3>
                <ChipPicker
                  choice={t.skills!}
                  value={d.speciesSkills[t.index] ?? []}
                  locked={bgSkills}
                  onChange={(v) => patch({ speciesSkills: { ...d.speciesSkills, [t.index]: v } })}
                />
              </div>
            ))}
          {traits.some((t) => t.originFeat) && (
            <>
              <h3>Versatile: origin feat</h3>
              <FeatPicker
                feats={data.originFeats.filter((f) => f.index !== data.background?.feat.index || f.index === 'skilled')}
                value={d.speciesFeat}
                onChange={(speciesFeat) => patch({ speciesFeat, featSkills: [], magicInitiate: { ...d.magicInitiate, species: undefined } })}
              />
            </>
          )}
          <h3>Traits</h3>
          <TextList items={traits} />
        </section>
      )}
    </>
  );
}

function FeatPicker({ feats, value, onChange }: { feats: CreateText[]; value: string; onChange: (index: string) => void }) {
  return (
    <div className="pick-list">
      {feats.map((f) => (
        <div key={f.index} className={`choice ${value === f.index ? 'sel' : ''}`}>
          <button type="button" className="choice-head" aria-pressed={value === f.index} onClick={() => onChange(f.index)}>
            <span className={`pip ${value === f.index ? 'on' : ''}`} />
            <strong>{f.name}</strong>
          </button>
          <details>
            <summary className="muted">Details</summary>
            <p className="pre">{f.description}</p>
          </details>
        </div>
      ))}
    </div>
  );
}

/* 3. Background */

export function BackgroundStep({ d, data, options, patch }: StepProps) {
  const pick = (index: string) =>
    index !== d.backgroundIndex &&
    patch({
      backgroundIndex: index,
      plus2: '',
      plus1: '',
      bgTool: '',
      bgEquip: '',
      featSkills: [],
      magicInitiate: { ...d.magicInitiate, background: undefined },
    });
  const bg = data.background;
  const custom = d.custom;
  const setCustom = (p: Partial<CreateDraft['custom']>) => patch({ custom: { ...custom, ...p }, plus2: '', plus1: '', featSkills: [] });
  return (
    <>
      <div className="pick-grid">
        {options.backgrounds.map((b) => (
          <button
            key={b.index}
            type="button"
            className={`card pick-card ${d.backgroundIndex === b.index ? 'sel' : ''}`}
            aria-pressed={d.backgroundIndex === b.index}
            onClick={() => pick(b.index)}
          >
            <strong>{b.name}</strong>
            <small>{b.abilities.join(' · ')}</small>
            <span className="pick-traits">
              {b.feat.name}
              {b.feat.note ? ` (${b.feat.note})` : ''} · {b.skills.join(', ')}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`card pick-card pick-custom ${d.backgroundIndex === CUSTOM_BACKGROUND ? 'sel' : ''}`}
          aria-pressed={d.backgroundIndex === CUSTOM_BACKGROUND}
          onClick={() => pick(CUSTOM_BACKGROUND)}
        >
          <strong>Custom</strong>
          <small>Your own story</small>
          <span className="pick-traits">Choose three abilities, two skills, a tool and an origin feat</span>
        </button>
      </div>

      {d.backgroundIndex === CUSTOM_BACKGROUND && (
        <section className="card pick-detail custom-bg">
          <h2>Custom background</h2>
          <label className="field">
            <span>Name</span>
            <input value={custom.name} placeholder="e.g. Guide, Hermit, Sailor" onChange={(e) => setCustom({ name: e.target.value })} />
          </label>
          <h3>
            Abilities <Counter have={custom.abilities.length} need={3} />
          </h3>
          <div className="chips">
            {ABILITIES.map((k) => {
              const on = custom.abilities.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={`chip ${on ? 'sel' : ''}`}
                  disabled={!on && custom.abilities.length >= 3}
                  onClick={() => setCustom({ abilities: on ? custom.abilities.filter((x) => x !== k) : [...custom.abilities, k] })}
                >
                  {ABILITY_NAMES[k]}
                </button>
              );
            })}
          </div>
          <h3>
            Skills <Counter have={custom.skills.length} need={2} />
          </h3>
          <ChipPicker choice={{ choose: 2, desc: '', from: SKILL_NAMES }} value={custom.skills} onChange={(skills) => setCustom({ skills })} />
          <label className="field">
            <span>Tool proficiency</span>
            <input value={custom.tool} placeholder="e.g. Cartographer's Tools" onChange={(e) => setCustom({ tool: e.target.value })} />
          </label>
          <h3>Origin feat</h3>
          <FeatPicker
            feats={data.originFeats}
            value={custom.feat}
            onChange={(feat) => patch({ custom: { ...custom, feat }, featSkills: [], magicInitiate: { ...d.magicInitiate, background: undefined } })}
          />
          <p className="hint">A custom background gives 50 GP instead of an equipment package.</p>
        </section>
      )}

      {d.backgroundIndex && d.backgroundIndex !== CUSTOM_BACKGROUND && !bg && <Loading what="the background" />}
      {bg && d.backgroundIndex !== CUSTOM_BACKGROUND && (
        <section className="card pick-detail">
          <h2>{bg.name}</h2>
          <dl className="facts">
            <div><dt>Abilities</dt><dd>{bg.abilities.join(', ')}</dd></div>
            <div><dt>Skills</dt><dd>{bg.skills.join(', ')}</dd></div>
            {(bg.tools.length > 0 || bg.toolChoice) && (
              <div><dt>Tools</dt><dd>{[...bg.tools, ...(bg.toolChoice ? [bg.toolChoice.desc || 'one of your choice'] : [])].join(', ')}</dd></div>
            )}
          </dl>
          <h3>Origin feat</h3>
          <TextList items={[{ name: bg.feat.name + (bg.feat.note ? ` (${bg.feat.note})` : ''), description: bg.feat.description }]} />
        </section>
      )}
    </>
  );
}

/* 4. Ability scores */

export function AbilitiesStep({ d, data, patch }: StepProps) {
  const bg = data.background;
  const final = finalScores(d, bg);
  const plus = backgroundBonus(d, bg);
  const spent = pointsSpent(d.pointBuy);
  const usedArray = (except: Ability) => ABILITIES.filter((k) => k !== except).map((k) => d.array[k]);
  const primary = data.cls?.primary;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Ability scores</h2>
        <div className="chips" role="tablist">
          <button type="button" role="tab" aria-selected={d.method === 'array'} className={`chip ${d.method === 'array' ? 'sel' : ''}`} onClick={() => patch({ method: 'array' })}>
            Standard array
          </button>
          <button type="button" role="tab" aria-selected={d.method === 'pointbuy'} className={`chip ${d.method === 'pointbuy' ? 'sel' : ''}`} onClick={() => patch({ method: 'pointbuy' })}>
            Point buy
          </button>
        </div>
      </div>
      <p className="hint">
        {d.method === 'array'
          ? `Put ${STANDARD_ARRAY.join(', ')} into your six abilities, one each.`
          : `Spend ${POINT_BUY_BUDGET} points: every score starts at 8 and goes up to 15 (14 and 15 cost 2 points each).`}
        {primary && ` ${data.cls!.name}s rely on ${primary}.`}
      </p>
      {d.method === 'pointbuy' && (
        <p>
          Points spent <Counter have={spent} need={POINT_BUY_BUDGET} />
          {spent > POINT_BUY_BUDGET && <span className="warn"> Over budget</span>}
        </p>
      )}
      <div className="score-table">
        {ABILITIES.map((k) => {
          const base = d.method === 'array' ? d.array[k] : d.pointBuy[k];
          return (
            <div key={k} className="score-row">
              <span className="score-name">
                <strong>{k}</strong> <small>{ABILITY_NAMES[k]}</small>
              </span>
              {d.method === 'array' ? (
                <select
                  aria-label={`${ABILITY_NAMES[k]} score`}
                  value={base ?? ''}
                  onChange={(e) => patch({ array: { ...d.array, [k]: e.target.value ? Number(e.target.value) : undefined } })}
                >
                  <option value="">—</option>
                  {STANDARD_ARRAY.map((v) => (
                    <option key={v} value={v} disabled={usedArray(k).includes(v)}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="stepper">
                  <button
                    type="button"
                    className="btn ghost small"
                    aria-label={`Lower ${ABILITY_NAMES[k]}`}
                    disabled={d.pointBuy[k] <= 8}
                    onClick={() => patch({ pointBuy: { ...d.pointBuy, [k]: d.pointBuy[k] - 1 } })}
                  >
                    −
                  </button>
                  <span className="stepper-val">{d.pointBuy[k]}</span>
                  <button
                    type="button"
                    className="btn ghost small"
                    aria-label={`Raise ${ABILITY_NAMES[k]}`}
                    disabled={d.pointBuy[k] >= 15 || spent - pointCost(d.pointBuy[k]) + pointCost(d.pointBuy[k] + 1) > POINT_BUY_BUDGET}
                    onClick={() => patch({ pointBuy: { ...d.pointBuy, [k]: d.pointBuy[k] + 1 } })}
                  >
                    +
                  </button>
                </span>
              )}
              <span className="score-plus">{plus[k] ? `+${plus[k]}` : ''}</span>
              <span className="score-final">
                {final[k]} <small>{fmt(modifier(final[k]))}</small>
              </span>
            </div>
          );
        })}
      </div>

      <h3>Background bonus{bg ? ` (${bg.name}: ${bg.abilities.join(', ')})` : ''}</h3>
      {!bg ? (
        <p className="hint">Choose a background first.</p>
      ) : (
        <>
          <div className="chips">
            <button type="button" className={`chip ${d.bonusMode === '2-1' ? 'sel' : ''}`} onClick={() => patch({ bonusMode: '2-1' })}>
              +2 and +1
            </button>
            <button type="button" className={`chip ${d.bonusMode === '1-1-1' ? 'sel' : ''}`} onClick={() => patch({ bonusMode: '1-1-1', plus2: '', plus1: '' })}>
              +1 to all three
            </button>
          </div>
          {d.bonusMode === '2-1' && (
            <div className="row-form bonus-row">
              {(['plus2', 'plus1'] as const).map((slot) => (
                <label key={slot} className="field inline">
                  <span>{slot === 'plus2' ? '+2 to' : '+1 to'}</span>
                  <select value={d[slot]} onChange={(e) => patch({ [slot]: e.target.value as Ability | '' })}>
                    <option value="">—</option>
                    {bg.abilities.map((k) => (
                      <option key={k} value={k} disabled={(slot === 'plus2' ? d.plus1 : d.plus2) === k}>
                        {ABILITY_NAMES[k]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* 5. Skills & tools */

export function SkillsStep({ d, data, patch }: StepProps) {
  const cls = data.cls;
  const bg = data.background;
  if (!cls || !bg) return <Loading what="your choices" />;
  const sources = new Map<string, string>();
  for (const s of grantedSkills(data)) sources.set(s, bg.name);
  for (const s of speciesSkillPicks(d, data)) sources.set(s, data.species?.name ?? 'species');
  const featCount = featSkillCount(d, data);
  const before = skillsBeforeClass(d, data);
  const lockedForClass = new Map([...sources, ...d.featSkills.map((s) => [s, 'Skilled'] as const)].filter(([s]) => before.has(s)));
  return (
    <section className="card">
      <h2>Skills &amp; tools</h2>
      {sources.size > 0 && (
        <p className="hint">
          Already proficient: {[...sources].map(([s, from]) => `${s} (${from})`).join(', ')}.
        </p>
      )}
      <h3>
        {cls.name} skills <Counter have={d.classSkills.length} need={cls.skills.choose} />
      </h3>
      <ChipPicker choice={cls.skills} value={d.classSkills} locked={lockedForClass} onChange={(classSkills) => patch({ classSkills })} />

      {featCount > 0 && (
        <>
          <h3>
            Skilled <Counter have={d.featSkills.length} need={featCount} />
          </h3>
          <ChipPicker
            choice={{ choose: featCount, desc: '', from: SKILL_NAMES }}
            value={d.featSkills}
            locked={sources}
            onChange={(featSkills) => patch({ featSkills, classSkills: d.classSkills.filter((s) => !featSkills.includes(s)) })}
          />
        </>
      )}

      {cls.toolChoices.map((c, i) => (
        <div key={i}>
          <h3>
            {c.desc || 'Tool proficiency'} <Counter have={d.classTools[i]?.length ?? 0} need={c.choose} />
          </h3>
          <ChipPicker
            choice={c}
            value={d.classTools[i] ?? []}
            onChange={(v) => {
              const next = [...d.classTools];
              next[i] = v;
              patch({ classTools: next });
            }}
          />
        </div>
      ))}
      {bg.toolChoice && (
        <>
          <h3>{bg.toolChoice.desc || `${bg.name} tool`}</h3>
          <ChipPicker choice={{ ...bg.toolChoice, choose: 1 }} value={d.bgTool ? [d.bgTool] : []} onChange={(v) => patch({ bgTool: v[0] ?? '' })} />
        </>
      )}
      {bg.tools.length > 0 && <p className="hint">From {bg.name}: {bg.tools.join(', ')}.</p>}
    </section>
  );
}

/* 6. Equipment */

function EquipChoice({ title, options, value, onChange }: { title: string; options: EquipOption[]; value: string; onChange: (label: string) => void }) {
  return (
    <>
      <h3>{title}</h3>
      <div className="choice-grid">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className={`choice equip-choice ${value === o.label || options.length === 1 ? 'sel' : ''}`}
            aria-pressed={value === o.label}
            onClick={() => onChange(o.label)}
          >
            <strong>
              ({o.label}) {o.items.length ? `${o.items.length} items + ${o.gold} GP` : `${o.gold} GP`}
            </strong>
            {o.items.length > 0 && (
              <ul className="equip-items">
                {o.items.map((i) => (
                  <li key={i.name}>
                    {i.qty > 1 && `${i.qty}× `}
                    {i.name}
                  </li>
                ))}
              </ul>
            )}
            {!o.items.length && <span>Buy your own gear.</span>}
          </button>
        ))}
      </div>
    </>
  );
}

export function EquipmentStep({ d, data, patch }: StepProps) {
  const { cls, background: bg } = data;
  if (!cls || !bg) return <Loading what="your choices" />;
  return (
    <section className="card">
      <h2>Starting equipment</h2>
      <EquipChoice title={cls.name} options={cls.equipment} value={d.classEquip} onChange={(classEquip) => patch({ classEquip })} />
      <EquipChoice title={bg.name} options={bg.equipment} value={d.bgEquip} onChange={(bgEquip) => patch({ bgEquip })} />
      <p className="hint">Items marked “your choice” go into your inventory under that name; rename them there. You can equip armour on the sheet.</p>
    </section>
  );
}

/* 7. Spells */

export function SpellsStep({ d, data, patch, preview, onOpenSpell }: StepProps & { preview: Character | null; onOpenSpell: (name: string) => void }) {
  const filters = useSpellFilters();
  const cls = data.cls;
  const miSources = magicInitiateSources(d, data);
  if (!cls) return <Loading what="your class" />;
  return (
    <>
      {cls.spellAbility && preview && (
        <section className="card spells-card">
          <div className="card-head">
            <h2>{cls.name} spells</h2>
            <SpellCounters c={preview} chosenCantrips={d.cantrips} prepared={d.prepared} />
          </div>
          <p className="hint">
            {cls.cantrips > 0 && `Learn ${cls.cantrips} cantrips and p`}
            {cls.cantrips > 0 ? 'repare' : 'Prepare'} {cls.prepared} level 1 spells. You can change prepared spells after a long rest.
          </p>
          <SpellPicker
            c={preview}
            chosenCantrips={d.cantrips}
            prepared={d.prepared}
            onToggleCantrip={(n) => patch({ cantrips: toggled(d.cantrips, n, cls.cantrips) })}
            onTogglePrepared={(n) => patch({ prepared: toggled(d.prepared, n, cls.prepared) })}
            onOpenSpell={onOpenSpell}
            filters={filters}
            hideLocked
          />
        </section>
      )}
      {miSources.map(({ source, note }) => (
        <MagicInitiateCard
          key={source}
          label={source === 'background' ? `${data.background?.name ?? 'Background'}: Magic Initiate` : 'Versatile: Magic Initiate'}
          value={d.magicInitiate[source] ?? { list: defaultMiList(note), cantrips: [], spell: '' }}
          onChange={(v) => patch({ magicInitiate: { ...d.magicInitiate, [source]: v } })}
          onOpenSpell={onOpenSpell}
        />
      ))}
    </>
  );
}

function MagicInitiateCard({
  label,
  value,
  onChange,
  onOpenSpell,
}: {
  label: string;
  value: MagicInitiatePick;
  onChange: (v: MagicInitiatePick) => void;
  onOpenSpell: (name: string) => void;
}) {
  const [list, setList] = useState<ClassSpell[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!value.list) return;
    let live = true;
    setList(null);
    setError('');
    fetchClassSpellList(value.list)
      .then((l) => live && setList(l))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [value.list]);
  const cantrips = list?.filter((s) => s.level === 0) ?? [];
  const firsts = list?.filter((s) => s.level === 1) ?? [];
  return (
    <section className="card">
      <div className="card-head">
        <h2>{label}</h2>
        <div className="chips">
          {MAGIC_INITIATE_LISTS.map((l) => (
            <button key={l} type="button" className={`chip ${value.list === l ? 'sel' : ''}`} onClick={() => onChange({ list: l, cantrips: [], spell: '' })}>
              {titleCase(l)}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">Two cantrips and one level 1 spell from one list. You can cast the level 1 spell once per long rest without a slot.</p>
      {!value.list && <p className="muted">Choose a spell list.</p>}
      {value.list && !list && !error && <Loading what={`${value.list} spells`} />}
      {error && <p className="muted">Couldn’t load the list ({error}).</p>}
      {list && (
        <>
          <h3>
            Cantrips <Counter have={value.cantrips.length} need={2} />
          </h3>
          <SpellChips spells={cantrips} value={value.cantrips} max={2} onChange={(c) => onChange({ ...value, cantrips: c })} onOpenSpell={onOpenSpell} />
          <h3>
            Level 1 spell <Counter have={value.spell ? 1 : 0} need={1} />
          </h3>
          <SpellChips spells={firsts} value={value.spell ? [value.spell] : []} max={1} replace onChange={(c) => onChange({ ...value, spell: c[0] ?? '' })} onOpenSpell={onOpenSpell} />
        </>
      )}
    </section>
  );
}

function SpellChips({
  spells,
  value,
  max,
  replace = false,
  onChange,
  onOpenSpell,
}: {
  spells: ClassSpell[];
  value: string[];
  max: number;
  /** with max 1: picking another replaces the current one */
  replace?: boolean;
  onChange: (v: string[]) => void;
  onOpenSpell: (name: string) => void;
}) {
  return (
    <div className="chips create-chips">
      {spells.map((s) => {
        const on = value.includes(s.name);
        return (
          <span key={s.index} className={`chip spell-chip ${on ? 'sel' : ''}`}>
            <button
              type="button"
              className="chip-main"
              aria-pressed={on}
              disabled={!on && !replace && value.length >= max}
              onClick={() => onChange(on ? value.filter((x) => x !== s.name) : replace ? [s.name] : toggled(value, s.name, max))}
            >
              {s.name}
            </button>
            <button type="button" className="chip-info" aria-label={`About ${s.name}`} onClick={() => onOpenSpell(s.name)}>
              ⓘ
            </button>
          </span>
        );
      })}
    </div>
  );
}

/* 8. Details */

export function DetailsStep({
  d,
  data,
  patch,
  campaigns,
  campaignId,
  onCampaign,
}: StepProps & { campaigns: Campaign[]; campaignId: number | ''; onCampaign: (id: number | '') => void }) {
  const [error, setError] = useState('');
  return (
    <section className="card details-card">
      <h2>Who are they?</h2>
      <div className="details-grid">
        <div className="portrait-pick">
          {d.portrait ? (
            <img className="portrait" src={d.portrait} alt="Portrait preview" />
          ) : (
            <div className="portrait portrait-initials" aria-hidden="true">
              {d.name.trim() ? d.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') : '?'}
            </div>
          )}
          <div className="row-form">
            <label className="btn ghost small">
              {d.portrait ? 'Change portrait' : 'Add portrait'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setError('');
                    patch({ portrait: await portraitFrom(f) });
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  }
                }}
              />
            </label>
            {d.portrait && (
              <button type="button" className="btn ghost small" onClick={() => patch({ portrait: '' })}>
                Remove
              </button>
            )}
          </div>
          {error && <p className="hint warn">{error}</p>}
        </div>
        <div className="details-fields">
          <label className="field">
            <span>Name</span>
            <input value={d.name} maxLength={80} placeholder="e.g. Faelan Mosswalker" autoFocus onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>Campaign</span>
            <select value={campaignId} onChange={(e) => onCampaign(e.target.value ? Number(e.target.value) : '')}>
              <option value="">No campaign</option>
              {campaigns.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <h3>Alignment</h3>
      <div className="choice-grid align-grid">
        {data.alignments.map((a) => (
          <button
            key={a.name}
            type="button"
            className={`choice ${d.alignment === a.name ? 'sel' : ''}`}
            aria-pressed={d.alignment === a.name}
            onClick={() => patch({ alignment: a.name })}
          >
            <strong>{a.name}</strong>
            <span>{a.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* 9. Review */

export function ReviewStep({ c, children }: { c: Character | null; children?: ReactNode }) {
  if (!c) return <Loading what="your character" />;
  const skills = c.skills.filter((s) => s.proficient);
  return (
    <section className="card review-card">
      <h2>{c.name || 'Unnamed'}</h2>
      <p className="subtitle">
        {c.race} · {c.className} 1 · {c.background}
        {c.alignment && ` · ${c.alignment}`}
      </p>
      <dl className="facts">
        <div><dt>HP</dt><dd>{c.hitPoints}</dd></div>
        <div><dt>AC</dt><dd>{c.armorClass} <small>unarmored</small></dd></div>
        <div><dt>Speed</dt><dd>{c.speed} ft.</dd></div>
        <div><dt>Initiative</dt><dd>{fmt(c.initiative)}</dd></div>
        <div><dt>Proficiency</dt><dd>{fmt(c.profBonus)}</dd></div>
        {c.spellAbility && <div><dt>Spell DC</dt><dd>{c.spellSaveDC}</dd></div>}
      </dl>
      <div className="review-scores">
        {c.abilities.map((a) => (
          <div key={a.key} className={`review-score ${a.saveProf ? 'save' : ''}`} title={a.saveProf ? 'Saving throw proficiency' : undefined}>
            <small>{a.key}</small>
            <strong>{a.score}</strong>
            <span>{fmt(a.mod)}</span>
          </div>
        ))}
      </div>
      <h3>Skills</h3>
      <p>{skills.map((s) => `${s.name} ${fmt(s.bonus)}`).join(', ') || 'None'}</p>
      {c.spells.length > 0 && (
        <>
          <h3>Spells</h3>
          <p>{c.spells.map((s) => s.name + (s.level === 0 ? ' (cantrip)' : '')).join(', ')}</p>
        </>
      )}
      <h3>Equipment</h3>
      <p>
        {[...new Set(c.equipment)].map((n) => {
          const qty = c.equipment.filter((x) => x === n).length;
          return qty > 1 ? `${qty}× ${n}` : n;
        }).join(', ') || 'None'}
        {` · ${c.gold} GP`}
      </p>
      <h3>Features &amp; traits</h3>
      <TextList items={[...c.features, ...c.tools].map((f) => ({ name: `${f.name} · ${f.source}`, description: f.description }))} />
      {children}
    </section>
  );
}
