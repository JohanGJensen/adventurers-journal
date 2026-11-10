import { useEffect, useState, type ReactNode } from 'react';
import { fetchClassSpellList, type ClassSpell } from '../lib/api';
import { api } from '../lib/client';
import { linkTo, navigate } from '../lib/router';
import { ABILITIES, ABILITY_NAMES, CLASSES, SKILLS, titleCase, type Ability } from '../lib/rules';
import { toast } from '../lib/toast';
import type { HomebrewBuffs, HomebrewLevel, HomebrewResource, HomebrewSpell, HomebrewSubclass, HomebrewVariant } from '../shared/types';
import { homebrewBody } from './HomebrewLibrary';
import { Loader } from './Loader';

type Draft = Omit<HomebrewSubclass, 'id' | 'usedBy'>;

const emptyLevel = (level: number): HomebrewLevel => ({ level, features: [], spells: [], buffs: {}, resources: [] });

/** One entry per subclass level of the class, in order, keeping what the draft already has. */
const withAllLevels = (d: Draft): Draft => {
  const levels = CLASSES[d.classKey]?.subclassLevels ?? [];
  return { ...d, levels: levels.map((l) => d.levels.find((x) => x.level === l) ?? emptyLevel(l)) };
};

const isEmptyLevel = (l: HomebrewLevel) =>
  !l.features.length && !l.spells.length && !l.resources.length && !Object.keys(l.buffs).length;

/** Drops blank rows the player added but didn't fill in, so validation doesn't trip over them. */
function clean(d: Draft): Draft {
  const spells = <T extends HomebrewSpell>(xs: T[]) => xs.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim() }));
  const levels = d.levels
    .map((l) => ({
      ...l,
      features: l.features.filter((f) => f.name.trim() || f.description.trim()).map((f) => ({ ...f, name: f.name.trim() || 'Untitled feature' })),
      spells: spells(l.spells),
      resources: l.resources.filter((r) => r.name.trim()),
      buffs: { ...l.buffs, ...(l.buffs.proficiencies ? { proficiencies: l.buffs.proficiencies.map((x) => x.trim()).filter(Boolean) } : {}) },
    }))
    .filter((l) => !isEmptyLevel(l));
  const options = d.variants?.options.filter((o) => o.name.trim()).map((o) => ({ ...o, spells: spells(o.spells) })) ?? [];
  return {
    ...d,
    name: d.name.trim(),
    levels,
    variants: d.variants && options.length ? { label: d.variants.label.trim() || 'Variant', options } : null,
  };
}

const replaceAt = <T,>(list: T[], i: number, item: T) => list.map((x, j) => (j === i ? item : x));
const removeAt = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);

/** Create or edit a homebrew subclass. `?class=` sets the class of a new one; `?return=` is where Save goes. */
export function HomebrewEditor({ id, query }: { id: number | 'new'; query: URLSearchParams }) {
  const returnTo = query.get('return');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [usedBy, setUsedBy] = useState<string[]>([]);
  const [spells, setSpells] = useState<ClassSpell[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id === 'new') {
      const classKey = query.get('class') && CLASSES[query.get('class')!] ? query.get('class')! : Object.keys(CLASSES)[0];
      setDraft(withAllLevels({ classKey, name: '', description: '', levels: [], variants: null }));
      return;
    }
    api<HomebrewSubclass>('GET', `/homebrew/subclasses/${id}`).then((r) => {
      if (!r.data) return toast(`Could not load: ${r.error}`, 'error');
      setUsedBy(r.data.usedBy ?? []);
      setDraft(withAllLevels(homebrewBody(r.data)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    document.title = `${draft?.name || 'New subclass'} · Homebrew`;
  }, [draft?.name]);

  const classKey = draft?.classKey;
  useEffect(() => {
    if (!classKey) return;
    fetchClassSpellList(classKey).then(setSpells).catch(() => setSpells([]));
  }, [classKey]);

  if (!draft) return <Loader size="page" label="Unrolling the scroll" />;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setLevel = (i: number, l: HomebrewLevel) => set({ levels: replaceAt(draft.levels, i, l) });
  const levelOf = (name: string) => spells.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())?.level;

  const leave = (pickId?: number) => {
    if (!returnTo) return navigate('/homebrew');
    navigate(pickId === undefined ? returnTo : `${returnTo}${returnTo.includes('?') ? '&' : '?'}pick=homebrew-${pickId}`);
  };

  const save = async () => {
    const body = clean(draft);
    setSaving(true);
    const r =
      id === 'new'
        ? await api<HomebrewSubclass>('POST', '/homebrew/subclasses', body)
        : await api<HomebrewSubclass>('PUT', `/homebrew/subclasses/${id}`, body);
    setSaving(false);
    if (r.error !== undefined) return toast(`Could not save: ${r.error}`, 'error');
    toast(`Saved ${r.data.name}`);
    leave(r.data.id);
  };

  return (
    <main className="sheet homebrew-editor">
      <nav className="sheet-nav">
        <a {...linkTo('/homebrew')}>← Homebrew</a>
        {returnTo && <a {...linkTo(returnTo)}>Back to level-up</a>}
      </nav>
      <article className="tome tome-page">
        <header className="tome-title">
          <input
            className="tome-name"
            placeholder="Name your subclass, e.g. Circle of the Mire"
            value={draft.name}
            maxLength={100}
            autoFocus={id === 'new'}
            onChange={(e) => set({ name: e.target.value })}
          />
          <label className="inline-field">
            <span>Class</span>
            <select
              value={draft.classKey}
              disabled={usedBy.length > 0}
              title={usedBy.length ? `In use by ${usedBy.join(', ')}` : undefined}
              onChange={(e) => setDraft(withAllLevels({ ...draft, classKey: e.target.value }))}
            >
              {Object.keys(CLASSES).map((k) => (
                <option key={k} value={k}>{titleCase(k)}</option>
              ))}
            </select>
          </label>
          {usedBy.length > 0 && <p className="hint">Used by {usedBy.join(', ')}. Changes apply to them right away.</p>}
        </header>

        <textarea
          className="tome-flavor"
          placeholder="Flavor text: who are these druids, what do they hold sacred?"
          rows={4}
          maxLength={8000}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
        />

        <datalist id="hb-spells">
          {spells.map((s) => (
            <option key={s.index} value={s.name}>{s.level === 0 ? 'Cantrip' : `Level ${s.level}`}</option>
          ))}
        </datalist>

        {draft.levels.map((l, i) => (
          <details key={l.level} className="hb-level" open={i === 0 || !isEmptyLevel(l)}>
            <summary>
              <h2>{titleCase(draft.classKey)} level {l.level}</h2>
              {isEmptyLevel(l) && <small>nothing yet</small>}
            </summary>
            <LevelEditor level={l} onChange={(x) => setLevel(i, x)} levelOf={levelOf} />
          </details>
        ))}

        <VariantsEditor
          value={draft.variants}
          onChange={(variants) => set({ variants })}
          levelOf={levelOf}
          levels={CLASSES[draft.classKey]?.subclassLevels ?? []}
        />

        <footer className="tome-actions">
          <button className="btn ghost" onClick={() => leave()} disabled={saving}>Cancel</button>
          <button className="btn" onClick={save} disabled={saving || !draft.name.trim()}>
            {saving ? 'Saving…' : returnTo ? 'Save and return to level-up' : 'Save subclass'}
          </button>
        </footer>
      </article>
    </main>
  );
}

function Block({ title, hint, onAdd, addLabel, children }: { title: string; hint?: string; onAdd?: () => void; addLabel?: string; children: ReactNode }) {
  return (
    <section className="hb-block">
      <div className="hb-block-head">
        <h3>{title}</h3>
        {onAdd && <button className="btn ghost small" onClick={onAdd}>+ {addLabel}</button>}
      </div>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

function SpellRows<T extends HomebrewSpell>({
  rows,
  onChange,
  levelOf,
  extra,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  levelOf: (name: string) => number | undefined;
  extra?: (row: T, set: (row: T) => void) => ReactNode;
}) {
  return (
    <ul className="hb-rows">
      {rows.map((s, i) => {
        const setRow = (row: T) => onChange(replaceAt(rows, i, row));
        return (
          <li key={i} className="hb-row">
            <input
              list="hb-spells"
              placeholder="Spell name"
              value={s.name}
              onChange={(e) => setRow({ ...s, name: e.target.value, level: levelOf(e.target.value) ?? s.level })}
            />
            <label className="inline-field">
              <span>Level</span>
              <input type="number" min={0} max={9} value={s.level} onChange={(e) => setRow({ ...s, level: clampInt(e.target.value, 0, 9) })} />
            </label>
            {extra?.(s, setRow)}
            <button className="icon-btn" aria-label="Remove spell" onClick={() => onChange(removeAt(rows, i))}>×</button>
          </li>
        );
      })}
    </ul>
  );
}

const clampInt = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));

function NumField({ label, value, onChange, min, max, suffix }: { label: string; value?: number; onChange: (n?: number) => void; min: number; max: number; suffix?: string }) {
  return (
    <label className="inline-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        placeholder="0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : clampInt(e.target.value, min, max) || undefined)}
      />
      {suffix && <small>{suffix}</small>}
    </label>
  );
}

function LevelEditor({ level, onChange, levelOf }: { level: HomebrewLevel; onChange: (l: HomebrewLevel) => void; levelOf: (name: string) => number | undefined }) {
  const b = level.buffs;
  const setBuffs = (patch: Partial<HomebrewBuffs>) => {
    const next: HomebrewBuffs = { ...b, ...patch };
    for (const k of Object.keys(next) as (keyof HomebrewBuffs)[]) {
      const v = next[k];
      if (v === undefined || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) delete next[k];
    }
    onChange({ ...level, buffs: next });
  };
  const toggle = <T extends string>(list: T[] | undefined, x: T) => (list?.includes(x) ? list.filter((y) => y !== x) : [...(list ?? []), x]);

  return (
    <div className="hb-level-body">
      <Block title="Features" onAdd={() => onChange({ ...level, features: [...level.features, { name: '', description: '' }] })} addLabel="Feature">
        {level.features.map((f, i) => (
          <div key={i} className="hb-feature">
            <div className="hb-row">
              <input
                placeholder="Feature name"
                value={f.name}
                onChange={(e) => onChange({ ...level, features: replaceAt(level.features, i, { ...f, name: e.target.value }) })}
              />
              <button className="icon-btn" aria-label="Remove feature" onClick={() => onChange({ ...level, features: removeAt(level.features, i) })}>×</button>
            </div>
            <textarea
              placeholder="What it does"
              rows={3}
              value={f.description}
              onChange={(e) => onChange({ ...level, features: replaceAt(level.features, i, { ...f, description: e.target.value }) })}
            />
          </div>
        ))}
      </Block>

      <Block
        title="Always-prepared spells"
        hint="Always prepared from this level on; they don't count against the prepared limit."
        onAdd={() => onChange({ ...level, spells: [...level.spells, { name: '', level: 1 }] })}
        addLabel="Spell"
      >
        <SpellRows rows={level.spells} onChange={(spells) => onChange({ ...level, spells })} levelOf={levelOf} />
      </Block>

      <Block title="Buffs">
        <div className="hb-grid">
          <NumField label="AC" value={b.ac} min={-5} max={10} onChange={(ac) => setBuffs({ ac })} />
          <NumField label="Speed" value={b.speed} min={-30} max={60} suffix="ft" onChange={(speed) => setBuffs({ speed })} />
          <NumField label="Initiative" value={b.initiative} min={-5} max={10} onChange={(initiative) => setBuffs({ initiative })} />
          <NumField label="HP per level" value={b.hpPerLevel} min={0} max={5} onChange={(hpPerLevel) => setBuffs({ hpPerLevel })} />
          <NumField label="Extra cantrips" value={b.cantrips} min={0} max={5} onChange={(cantrips) => setBuffs({ cantrips })} />
        </div>
        <h4>Ability scores <small>(max 20)</small></h4>
        <div className="hb-grid">
          {ABILITIES.map((k) => (
            <NumField
              key={k}
              label={k}
              value={b.abilities?.[k]}
              min={0}
              max={4}
              onChange={(n) => setBuffs({ abilities: { ...b.abilities, [k]: n } })}
            />
          ))}
        </div>
        <h4>Saving throw proficiencies</h4>
        <div className="chips">
          {ABILITIES.map((k: Ability) => (
            <button key={k} className={`chip ${b.saves?.includes(k) ? 'sel' : ''}`} onClick={() => setBuffs({ saves: toggle(b.saves, k) })}>
              {ABILITY_NAMES[k]}
            </button>
          ))}
        </div>
        <h4>Skill proficiencies</h4>
        <div className="chips">
          {Object.keys(SKILLS).map((k) => (
            <button key={k} className={`chip ${b.skills?.includes(k) ? 'sel' : ''}`} onClick={() => setBuffs({ skills: toggle(b.skills, k) })}>
              {k}
            </button>
          ))}
        </div>
        <h4>Other proficiencies</h4>
        <input
          className="hb-wide"
          placeholder="Armor, weapons, tools: comma separated, e.g. Shields, Herbalism Kit"
          value={(b.proficiencies ?? []).join(', ')}
          onChange={(e) => setBuffs({ proficiencies: e.target.value ? e.target.value.split(/,\s*/) : undefined })}
        />
      </Block>

      <Block
        title="Limited-use resources"
        hint="Tracked on the sheet with Use / Regain. Long rests restore all; short rests restore short-rest ones."
        onAdd={() => onChange({ ...level, resources: [...level.resources, { name: '', uses: 'prof', recharge: 'long' }] })}
        addLabel="Resource"
      >
        <ul className="hb-rows">
          {level.resources.map((r, i) => {
            const setRes = (patch: Partial<HomebrewResource>) => onChange({ ...level, resources: replaceAt(level.resources, i, { ...r, ...patch }) });
            const kind = typeof r.uses === 'number' ? 'number' : r.uses;
            return (
              <li key={i} className="hb-row">
                <input placeholder="Resource name" value={r.name} onChange={(e) => setRes({ name: e.target.value })} />
                <label className="inline-field">
                  <span>Uses</span>
                  <select value={kind} onChange={(e) => setRes({ uses: e.target.value === 'number' ? 1 : (e.target.value as HomebrewResource['uses']) })}>
                    <option value="number">Fixed number</option>
                    <option value="prof">Proficiency bonus</option>
                    {ABILITIES.map((k) => (
                      <option key={k} value={k}>{ABILITY_NAMES[k]} modifier</option>
                    ))}
                  </select>
                </label>
                {typeof r.uses === 'number' && (
                  <input type="number" min={1} max={20} className="hb-num" value={r.uses} onChange={(e) => setRes({ uses: clampInt(e.target.value, 1, 20) })} />
                )}
                <label className="inline-field">
                  <span>Recharge</span>
                  <select value={r.recharge} onChange={(e) => setRes({ recharge: e.target.value as 'short' | 'long' })}>
                    <option value="long">Long rest</option>
                    <option value="short">Short rest</option>
                  </select>
                </label>
                <button className="icon-btn" aria-label="Remove resource" onClick={() => onChange({ ...level, resources: removeAt(level.resources, i) })}>×</button>
              </li>
            );
          })}
        </ul>
      </Block>
    </div>
  );
}

function VariantsEditor({
  value,
  onChange,
  levelOf,
  levels,
}: {
  value: HomebrewSubclass['variants'];
  onChange: (v: HomebrewSubclass['variants']) => void;
  levelOf: (name: string) => number | undefined;
  levels: number[];
}) {
  const first = levels[0] ?? 1;
  const setOption = (i: number, o: HomebrewVariant) => value && onChange({ ...value, options: replaceAt(value.options, i, o) });
  return (
    <details className="hb-level" open={!!value}>
      <summary>
        <h2>Variants</h2>
        <small>{value ? `${value.label}: ${value.options.map((o) => o.name || '…').join(', ')}` : 'optional'}</small>
      </summary>
      <div className="hb-level-body">
        <p className="hint">
          A choice like Circle of the Land’s land type: picked when taking the subclass and changeable after each long rest.
          Each option can add its own always-prepared spells.
        </p>
        {!value ? (
          <button className="btn ghost small" onClick={() => onChange({ label: '', options: [{ name: '', description: '', spells: [] }] })}>
            + Add variants
          </button>
        ) : (
          <>
            <div className="hb-row">
              <input placeholder="What is chosen? e.g. Season, Land type, Totem" value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} />
              <button className="btn ghost small" onClick={() => onChange(null)}>Remove variants</button>
            </div>
            {value.options.map((o, i) => (
              <div key={i} className="hb-variant">
                <div className="hb-row">
                  <input placeholder="Option name, e.g. Spring" value={o.name} onChange={(e) => setOption(i, { ...o, name: e.target.value })} />
                  <button className="icon-btn" aria-label="Remove option" onClick={() => onChange({ ...value, options: removeAt(value.options, i) })}>×</button>
                </div>
                <textarea placeholder="Description (optional)" rows={2} value={o.description} onChange={(e) => setOption(i, { ...o, description: e.target.value })} />
                <Block title="Spells" onAdd={() => setOption(i, { ...o, spells: [...o.spells, { name: '', level: 1, atLevel: first }] })} addLabel="Spell">
                  <SpellRows
                    rows={o.spells}
                    onChange={(spells) => setOption(i, { ...o, spells })}
                    levelOf={levelOf}
                    extra={(s, setRow) => (
                      <label className="inline-field">
                        <span>From character level</span>
                        <input type="number" min={1} max={20} className="hb-num" value={s.atLevel} onChange={(e) => setRow({ ...s, atLevel: clampInt(e.target.value, 1, 20) })} />
                      </label>
                    )}
                  />
                </Block>
              </div>
            ))}
            <button className="btn ghost small" onClick={() => onChange({ ...value, options: [...value.options, { name: '', description: '', spells: [] }] })}>
              + Option
            </button>
          </>
        )}
      </div>
    </details>
  );
}
