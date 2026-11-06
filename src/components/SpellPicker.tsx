import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Character } from '../lib/character';
import { fetchClassSpellList, slugify, type ClassSpell } from '../lib/api';
import { useSpellInfo } from '../hooks/useSpellInfo';
import { unlockLevel } from '../lib/rules';

type ListStatus = { state: 'loading' } | { state: 'done'; list: ClassSpell[] } | { state: 'error'; message: string };

const LEVEL_LABEL = (l: number) => (l === 0 ? 'Cantrips' : `Level ${l}`);

/** Filter state, kept by the caller so it survives the picker closing. */
export function useSpellFilters() {
  const [level, setLevel] = useState<number | 'all'>('all');
  const [school, setSchool] = useState('');
  const [query, setQuery] = useState('');
  const [onlyConc, setOnlyConc] = useState(false);
  const [onlyRitual, setOnlyRitual] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  return { level, setLevel, school, setSchool, query, setQuery, onlyConc, setOnlyConc, onlyRitual, setOnlyRitual, onlyMine, setOnlyMine };
}
export type SpellFilters = ReturnType<typeof useSpellFilters>;

/**
 * The class spell list with filters, and Learn/Prepare toggles limited by `c`'s caps.
 * `c` decides caps and the highest castable level; the chosen lists can be live play state or a draft.
 */
export function SpellPicker({
  c,
  chosenCantrips,
  prepared,
  onToggleCantrip,
  onTogglePrepared,
  onOpenSpell,
  filters,
}: {
  c: Character;
  chosenCantrips: string[];
  prepared: string[];
  onToggleCantrip: (name: string) => void;
  onTogglePrepared: (name: string) => void;
  onOpenSpell: (name: string) => void;
  filters: SpellFilters;
}) {
  const [status, setStatus] = useState<ListStatus>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const { level, setLevel, school, setSchool, query, setQuery, onlyConc, setOnlyConc, onlyRitual, setOnlyRitual, onlyMine, setOnlyMine } = filters;

  useEffect(() => {
    let live = true;
    setStatus({ state: 'loading' });
    fetchClassSpellList(c.classKey)
      .then((list) => live && setStatus({ state: 'done', list }))
      .catch((e: Error) => live && setStatus({ state: 'error', message: e.message }));
    return () => {
      live = false;
    };
  }, [attempt, c.classKey]);

  const always = useMemo(() => new Map(c.bonusSpells.map((s) => [s.name.toLowerCase(), s.source])), [c.bonusSpells]);

  const all = useMemo(() => {
    if (status.state !== 'done') return [];
    const list = [...status.list];
    for (const x of c.extraClassSpells) {
      if (!list.some((s) => s.name.toLowerCase() === x.name.toLowerCase())) list.push({ index: slugify(x.name), ...x });
    }
    // Always-known spells from other sources (e.g. Minor Illusion) appear too, so the overview is complete.
    for (const s of c.bonusSpells) {
      if (!list.some((x) => x.name.toLowerCase() === s.name.toLowerCase()))
        list.push({ index: slugify(s.name), name: s.name, level: s.level });
    }
    return list.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [status, c.bonusSpells, c.extraClassSpells]);

  // Load details for the levels in view so school/concentration/ritual filters work.
  const inView = all.filter((s) => level === 'all' || s.level === level);
  const info = useSpellInfo(inView.map((s) => s.name));

  const isMine = useCallback(
    (name: string) => always.has(name.toLowerCase()) || chosenCantrips.includes(name) || prepared.includes(name),
    [always, chosenCantrips, prepared],
  );

  const schools = [...new Set(all.map((s) => info.get(s.name)?.school).filter((x): x is string => !!x))].sort();

  const q = query.trim().toLowerCase();
  const filtered = inView.filter((s) => {
    const i = info.get(s.name);
    if (q && !s.name.toLowerCase().includes(q)) return false;
    if (school && i?.school !== school) return false;
    if (onlyConc && !i?.concentration) return false;
    if (onlyRitual && !i?.ritual) return false;
    if (onlyMine && !isMine(s.name)) return false;
    return true;
  });
  const groups = [...new Set(filtered.map((s) => s.level))];
  const levelsAvailable = [...new Set(all.map((s) => s.level))];

  const cantripsFull = chosenCantrips.length >= c.cantripCap;
  const preparedFull = prepared.length >= c.preparedCap;

  return (
    <>
      <div className="filters">
        <input
          type="search"
          placeholder="Search spells…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search spells"
        />
        <div className="chips">
          <button className={`chip ${level === 'all' ? 'sel' : ''}`} onClick={() => setLevel('all')}>All</button>
          {levelsAvailable.map((l) => (
            <button key={l} className={`chip ${level === l ? 'sel' : ''} ${l > c.maxSpellLevel ? 'locked' : ''}`} onClick={() => setLevel(l)}>
              {l === 0 ? 'Cantrip' : l}
            </button>
          ))}
        </div>
        <div className="chips">
          <select value={school} onChange={(e) => setSchool(e.target.value)} aria-label="School">
            <option value="">Any school</option>
            {schools.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className={`chip ${onlyConc ? 'sel' : ''}`} onClick={() => setOnlyConc((v) => !v)}>Concentration</button>
          <button className={`chip ${onlyRitual ? 'sel' : ''}`} onClick={() => setOnlyRitual((v) => !v)}>Ritual</button>
          <button className={`chip ${onlyMine ? 'sel' : ''}`} onClick={() => setOnlyMine((v) => !v)}>Mine only</button>
        </div>
      </div>

      <div className="browser-body">
        {status.state === 'loading' && <p className="muted">Consulting the archives…</p>}
        {status.state === 'error' && (
          <p className="muted">
            Couldn’t reach the archives ({status.message}).{' '}
            <button className="btn ghost small" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
          </p>
        )}
        {status.state === 'done' && filtered.length === 0 && <p className="muted">No spells match those filters.</p>}

        {groups.map((lvl) => {
          const locked = lvl > c.maxSpellLevel;
          return (
            <section key={lvl} className={`spell-group ${locked ? 'locked' : ''}`}>
              <h3>
                {LEVEL_LABEL(lvl)}
                {locked && <span className="unlock">Unlocks at level {unlockLevel(lvl)}</span>}
              </h3>
              <ul className="spells">
                {filtered
                  .filter((s) => s.level === lvl)
                  .map((s) => {
                    const i = info.get(s.name);
                    const alwaysSrc = always.get(s.name.toLowerCase());
                    const isCantrip = s.level === 0;
                    const chosen = isCantrip ? chosenCantrips.includes(s.name) : prepared.includes(s.name);
                    const full = isCantrip ? cantripsFull : preparedFull;
                    const blocked = !chosen && (locked || full);
                    const verb = isCantrip ? 'Learn' : 'Prepare';
                    return (
                      <li key={s.index} className={`spell ${chosen || alwaysSrc ? 'mine' : ''}`}>
                        <button className="link" onClick={() => onOpenSpell(s.name)}>{s.name}</button>
                        {i?.school && <span className="school">{i.school}</span>}
                        {i?.concentration && <span className="tag" title="Concentration">C</span>}
                        {i?.ritual && <span className="tag" title="Ritual">R</span>}
                        {alwaysSrc && <span className={`src src-${alwaysSrc.replace(/\s/g, '').toLowerCase()}`}>{alwaysSrc}</span>}
                        <span className="spell-actions">
                          {alwaysSrc ? (
                            <span className="always">Always</span>
                          ) : (
                            <button
                              className={`btn small ${chosen ? '' : 'ghost'}`}
                              disabled={blocked}
                              title={
                                locked
                                  ? `Unlocks at character level ${unlockLevel(lvl)}`
                                  : blocked
                                    ? `${isCantrip ? 'Cantrip' : 'Prepared'} limit reached. Remove one first.`
                                    : undefined
                              }
                              onClick={() => (isCantrip ? onToggleCantrip(s.name) : onTogglePrepared(s.name))}
                            >
                              {chosen ? (isCantrip ? 'Known ✓' : 'Prepared ✓') : verb}
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
