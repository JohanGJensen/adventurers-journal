import { useState } from 'react';
import type { Character } from '../../lib/character';
import type { SpellEntry } from '../../data/supplement';
import type { PlayApi } from '../../hooks/usePlayState';
import { useSpellbook, type Spellbook } from '../../hooks/useSpellbook';
import { useDice } from '../../lib/dice';
import { fmt } from '../../lib/rules';
import { SchoolIcon } from '../SchoolIcon';
import { Parchment, Pips, WaxSeal } from '../kit';
import { SpellDeck } from './SpellDeck';

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
type View = 'deck' | 'list';
type Filter = 'conc' | 'ritual' | 'bonus';
const FILTERS: { id: Filter; label: string; mark: string; colour: 'red' | 'blue' | 'green' }[] = [
  { id: 'conc', label: 'Concentration', mark: 'C', colour: 'blue' },
  { id: 'ritual', label: 'Ritual', mark: 'R', colour: 'red' },
  { id: 'bonus', label: 'Bonus action', mark: 'B', colour: 'green' },
];

const viewKey = (id: number) => `aj.spellView.${id}`;

/** The Spells tab: the casting numbers and filters, then today's spells as a deck of cards or as a list. */
export function SpellsTab({ c, play, characterId, onOpen, onBrowse }: { c: Character; play: PlayApi; characterId: number; onOpen: (name: string) => void; onBrowse: () => void }) {
  const book = useSpellbook(c, play);
  const { roll } = useDice();
  const { state } = play;
  const [view, setView] = useState<View>(() => (localStorage.getItem(viewKey(characterId)) === 'list' ? 'list' : 'deck'));
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [query, setQuery] = useState('');

  const choose = (v: View) => {
    setView(v);
    localStorage.setItem(viewKey(characterId), v);
  };
  const toggle = (f: Filter) =>
    setFilters((cur) => {
      const next = new Set(cur);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  const q = query.trim().toLowerCase();
  const shown = book.spells.filter((s) => {
    const d = book.details(s.name);
    if (q && !s.name.toLowerCase().includes(q)) return false;
    if (filters.has('conc') && !book.isConc(s.name)) return false;
    if (filters.has('ritual') && !d?.ritual) return false;
    if (filters.has('bonus') && !/bonus/i.test(d?.castingTime ?? '')) return false;
    return true;
  });

  return (
    <div className="k-spells">
      <Parchment as="section" gilt corners="top" className="k-card k-casting" aria-labelledby="k-casting-h">
        <h2 id="k-casting-h" className="k-h2">{book.caster ? 'Spellcasting' : 'Spells'}</h2>
        <div className="k-casting-row">
          {book.caster && (
            <>
              <div className="k-box"><span className="k-vl">Ability</span><span className="k-box-n">{c.spellAbility}</span></div>
              <div className="k-box"><span className="k-vl">Save DC</span><span className="k-box-n">{c.spellSaveDC}</span></div>
              <button className="k-box k-box-btn" onClick={() => roll('Spell attack', 20, 1, c.spellAttack)} aria-label={`Roll a spell attack, ${fmt(c.spellAttack)}`}>
                <span className="k-vl">Spell attack</span><span className="k-box-n">{fmt(c.spellAttack)}</span>
              </button>
            </>
          )}
          {c.cantripCap > 0 && (
            <div className="k-box"><span className="k-vl">Cantrips</span><span className="k-box-n">{state.chosenCantrips.length}<small> / {c.cantripCap}</small></span></div>
          )}
          {c.preparedCap > 0 && (
            <div className="k-box"><span className="k-vl">Prepared</span><span className="k-box-n">{state.prepared.length}<small> / {c.preparedCap}</small></span></div>
          )}
          <div className="k-casting-tools">
            <div className="k-seg" role="group" aria-label="Show spells as">
              <button aria-pressed={view === 'deck'} onClick={() => choose('deck')}>Deck</button>
              <button aria-pressed={view === 'list'} onClick={() => choose('list')}>List</button>
            </div>
            <div className="k-filters" role="group" aria-label="Filter spells">
              {FILTERS.map((f) => (
                <button key={f.id} className={`k-seal-toggle ${filters.has(f.id) ? 'on' : ''}`} aria-pressed={filters.has(f.id)} onClick={() => toggle(f.id)}>
                  <WaxSeal colour={f.colour} size={26}>{f.mark}</WaxSeal>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="k-search">
              <label className="k-sr" htmlFor="k-spell-q">Search your spells</label>
              <input id="k-spell-q" type="search" placeholder="Search your spells…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {book.caster && <button className="btn ghost small" onClick={onBrowse}>Learn &amp; prepare</button>}
            </div>
          </div>
        </div>
      </Parchment>

      {view === 'deck' ? <SpellDeck book={book} play={play} spells={shown} onOpen={onOpen} /> : <SpellListView c={c} book={book} play={play} spells={shown} onOpen={onOpen} onBrowse={onBrowse} />}
    </div>
  );
}

/** The list: one parchment card per circle, with its slots in the heading. */
function SpellListView({ c, book, play, spells, onOpen, onBrowse }: { c: Character; book: Spellbook; play: PlayApi; spells: SpellEntry[]; onOpen: (name: string) => void; onBrowse: () => void }) {
  const { state } = play;
  const cantrips = spells.filter((s) => s.level === 0);
  const levels = [...new Set(spells.filter((s) => s.level > 0).map((s) => s.level))].sort((a, b) => a - b);
  const left = c.preparedCap - state.prepared.length;
  return (
    <div className="k-spell-list">
      {cantrips.length > 0 && (
        <Parchment as="section" gilt className="k-card">
          <h2 className="k-h2">Cantrips <span className="k-h2-hint">at will</span></h2>
          <ul className="k-rows">
            {cantrips.map((s) => (
              <SpellRow key={s.name} s={s} book={book} active={state.concentration === s.name} onOpen={onOpen}>
                {book.isConc(s.name) && <button className="btn ghost small" onClick={() => book.cast(s)}>Cast</button>}
              </SpellRow>
            ))}
          </ul>
        </Parchment>
      )}
      {levels.map((lvl) => {
        const max = c.slots[lvl - 1] ?? 0;
        const free = book.slotsLeft(lvl);
        return (
          <Parchment as="section" gilt className="k-card" key={lvl}>
            <h2 className="k-h2">
              Level <span className="k-h2-num">{lvl}</span>
              {max > 0 && (
                <span className="k-slot-head">
                  <Pips total={max} filled={free} label={`${ORD[lvl]}-level slots: ${free} of ${max} left`} />
                  <span className="k-h2-hint">{free} of {max}</span>
                  <button className="k-x" disabled={free <= 0} onClick={() => play.useSlot(lvl)} aria-label={`Spend a ${ORD[lvl]}-level slot`} title="Spend one">−</button>
                  <button className="k-x" disabled={free >= max} onClick={() => play.restoreSlot(lvl)} aria-label={`Regain a ${ORD[lvl]}-level slot`} title="Regain one">+</button>
                </span>
              )}
            </h2>
            <ul className="k-rows">
              {spells
                .filter((s) => s.level === lvl)
                .map((s) => {
                  const slot = book.slotFor(s.level);
                  const mi = s.source === 'Magic Initiate';
                  return (
                    <SpellRow key={s.name} s={s} book={book} active={state.concentration === s.name} onOpen={onOpen}>
                      {mi && (
                        <button className="btn ghost small" disabled={state.goodberryUsed} onClick={() => book.cast(s, { free: true })} title="Magic Initiate: once per long rest without a slot">
                          {state.goodberryUsed ? 'Free cast used' : 'Free cast'}
                        </button>
                      )}
                      {c.slots.length > 0 && (
                        <button className="btn small" disabled={slot === null} onClick={() => book.cast(s)}>
                          {slot !== null && slot > s.level ? `Cast (${ORD[slot]} slot)` : 'Cast'}
                        </button>
                      )}
                    </SpellRow>
                  );
                })}
            </ul>
          </Parchment>
        );
      })}
      {!spells.length && <p className="k-hint">No spells match.</p>}
      {left > 0 && (
        <p className="k-hint">
          You can prepare {left} more spell{left === 1 ? '' : 's'}. <button className="link" onClick={onBrowse}>Choose spells</button>
        </p>
      )}
    </div>
  );
}

function SpellRow({ s, book, active, onOpen, children }: { s: SpellEntry; book: Spellbook; active: boolean; onOpen: (n: string) => void; children?: React.ReactNode }) {
  const d = book.details(s.name);
  return (
    <li className={`k-spell-row ${active ? 'active' : ''}`}>
      <SchoolIcon school={d?.school} />
      <span className="k-row-name">
        <button className="link" onClick={() => onOpen(s.name)}>{s.name}</button>
        {d && <small> · {d.castingTime} · {d.range}</small>}
      </span>
      {book.isConc(s.name) && <WaxSeal colour="blue" size={22} label="Concentration">C</WaxSeal>}
      {d?.ritual && <WaxSeal size={22} label="Ritual">R</WaxSeal>}
      {s.source !== 'Class' && <span className="k-chip">{s.source}</span>}
      <span className="k-spell-acts">{children}</span>
    </li>
  );
}
