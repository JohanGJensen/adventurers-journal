import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../lib/client';
import { buildCharacter, knownSpells, type Character } from '../lib/character';
import { makeRoll, type Roll, type RollMode } from '../lib/dice';
import { navigate, useRoute } from '../lib/router';
import { ABILITY_NAMES, fmt } from '../lib/rules';
import { hasTool } from '../data/tools';
import type { CharacterDto, CharacterSummary, NoteRef, PlayState } from '../shared/types';
import { fallbackImage } from './notes/common';

/** Open the palette from anywhere (the sidebar's Find & roll link). */
export const openPalette = () => window.dispatchEvent(new Event('aj:palette'));

type Hit = {
  id: string;
  group: 'Roll' | 'Go to' | 'Heroes' | 'Spells' | 'Notes';
  label: string;
  hint?: string;
  right?: string;
  icon?: string | null;
  run: (mode: RollMode) => void | Roll;
};

/** "2d6+3", "d20", "4d6 - 1" → a roll; null if it isn't dice. */
const parseDice = (q: string) => {
  const m = /^\s*(\d*)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(q);
  if (!m) return null;
  const count = Math.min(100, Number(m[1] || 1));
  const sides = Number(m[2]);
  if (!sides || sides > 1000) return null;
  const mod = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  return { count, sides, mod };
};

/** How well `label` matches `q`: 0 is no match; whole-word and prefix matches rank first. */
const score = (label: string, q: string) => {
  const l = label.toLowerCase();
  if (!q) return 1;
  if (l.startsWith(q)) return 4;
  if (l.split(/\W+/).some((w) => w.startsWith(q))) return 3;
  if (l.includes(q)) return 2;
  return 0;
};

/** What the palette knows about the character whose page is open: skills, spells, notes and which pages exist. */
function useCharacterIndex(id: number | null, open: boolean) {
  const [data, setData] = useState<{ c: Character; play: PlayState; dto: CharacterDto; notes: NoteRef[] } | null>(null);
  useEffect(() => {
    if (!open || id === null) return;
    let live = true;
    (async () => {
      const [d, p] = await Promise.all([api<CharacterDto>('GET', `/characters/${id}`), api<{ state: PlayState }>('GET', `/characters/${id}/play`)]);
      if (!live || !d.data || !p.data) return;
      const notes = d.data.campaignId ? ((await api<NoteRef[]>('GET', `/notes/index?campaign=${d.data.campaignId}`)).data ?? []) : [];
      try {
        if (live) setData({ c: buildCharacter(d.data.sheet, d.data.extras, d.data.levels, d.data.homebrew), play: p.data.state, dto: d.data, notes });
      } catch {
        if (live) setData(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [id, open]);
  return id === null ? null : data;
}

/**
 * Ctrl+K (⌘K) from anywhere: find a page, a hero, a note, a spell or a skill, or type dice to roll them.
 * Enter runs the highlighted hit (Shift+Enter rolls with advantage, Alt+Enter with disadvantage).
 */
export function CommandPalette() {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [last, setLast] = useState<Roll | null>(null);
  const [heroes, setHeroes] = useState<CharacterSummary[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const charId = 'id' in route && typeof route.id === 'number' && route.name !== 'homebrewEdit' ? route.id : null;
  const ci = useCharacterIndex(charId, open);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('aj:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('aj:palette', onOpen);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    setQ('');
    setSel(0);
    setLast(null);
    api<CharacterSummary[]>('GET', '/characters').then((r) => r.data && setHeroes(r.data));
    requestAnimationFrame(() => input.current?.focus());
    return () => back.current?.focus?.();
  }, [open]);

  const close = () => setOpen(false);
  const go = (to: string) => () => {
    close();
    navigate(to);
  };

  const hits = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase();
    const out: (Hit & { s: number })[] = [];
    const add = (h: Hit, base = 0) => {
      const s = score(h.label, t);
      if (s) out.push({ ...h, s: s + base });
    };
    const dice = parseDice(q);
    if (dice) {
      const expr = `${dice.count}d${dice.sides}${dice.mod ? (dice.mod > 0 ? `+${dice.mod}` : dice.mod) : ''}`;
      out.push({ id: 'dice', group: 'Roll', label: `Roll ${expr}`, right: '↵', s: 10, run: (m) => makeRoll(expr, dice.sides, dice.count, dice.mod, dice.sides === 20 && dice.count === 1 ? m : 'normal') });
    }
    if (ci && t) {
      const { c, play, dto, notes } = ci;
      for (const a of c.abilities) {
        add({ id: `chk-${a.key}`, group: 'Roll', label: `${ABILITY_NAMES[a.key]} check`, right: fmt(a.mod), run: (m) => makeRoll(`${ABILITY_NAMES[a.key]} check`, 20, 1, a.mod, m) }, 1);
        add({ id: `sv-${a.key}`, group: 'Roll', label: `${ABILITY_NAMES[a.key]} save`, right: fmt(a.save), hint: a.saveProf ? 'proficient' : undefined, run: (m) => makeRoll(`${ABILITY_NAMES[a.key]} save`, 20, 1, a.save, m) }, 1);
      }
      for (const s of c.skills)
        add({ id: `sk-${s.name}`, group: 'Roll', label: s.name, hint: `${ABILITY_NAMES[s.ability]}${s.proficient ? ', trained' : ''}`, right: fmt(s.bonus), run: (m) => makeRoll(`${s.name} check`, 20, 1, s.bonus, m) }, 1);
      add({ id: 'init', group: 'Roll', label: 'Initiative', right: fmt(c.initiative), run: (m) => makeRoll('Initiative', 20, 1, c.initiative, m) }, 1);
      for (const s of knownSpells(c, play))
        add({ id: `sp-${s.name}`, group: 'Spells', label: s.name, hint: s.level ? `level ${s.level}` : 'cantrip', run: go(`/c/${dto.id}/spells`) });
      for (const n of notes) add({ id: `n-${n.id}`, group: 'Notes', label: n.title, hint: n.kind, icon: fallbackImage(n), run: go(`/c/${dto.id}/notes?note=${n.id}`) });
    }
    const pages: [string, string][] = [['All characters', '/'], ['Homebrew', '/homebrew'], ['Raise a new hero', '/new']];
    if (charId !== null) {
      const base = `/c/${charId}`;
      pages.unshift(['Character sheet', base], ['Spells', `${base}/spells`], ['Inventory', `${base}/inventory`], ['Features', `${base}/features`], ['Lore', `${base}/lore`], ['History', `${base}/log`]);
      if (ci?.dto.campaignId) pages.push(['Notes', `${base}/notes`]);
      if (ci && hasTool(ci.c.tools, "Cartographer's Tools")) pages.push(['Journey map', `${base}/map`]);
    }
    const pq = t.startsWith('>') ? t.slice(1).trim() : t;
    for (const [label, to] of pages) {
      const s = score(label, pq);
      if (s) out.push({ id: `p-${to}`, group: 'Go to', label, run: go(to), s: t.startsWith('>') ? s + 5 : s });
    }
    if (t && !t.startsWith('>')) for (const h of heroes) add({ id: `h-${h.id}`, group: 'Heroes', label: h.name, hint: h.subtitle, icon: h.portrait, run: go(`/c/${h.id}`) });
    return out.sort((a, b) => b.s - a.s).slice(0, 12);
  }, [q, ci, heroes, charId]);

  useEffect(() => setSel(0), [q]);
  if (!open) return null;

  const run = (h: Hit, mode: RollMode) => {
    const r = h.run(mode);
    if (r) setLast(r);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && hits[sel]) {
      e.preventDefault();
      run(hits[sel], e.shiftKey ? 'advantage' : e.altKey ? 'disadvantage' : 'normal');
    }
  };

  let lastGroup = '';
  return (
    <div className="k-palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="k-palette k-parch k-gilt" role="dialog" aria-modal="true" aria-label="Find and roll" onKeyDown={onKey}>
        <div className="k-palette-input">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={charId !== null ? 'Find a note, spell, skill or page, or type 2d6+3' : 'Find a hero or a page, or type 2d6+3'}
            aria-label="Find and roll"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="k-palette-list"
            aria-activedescendant={hits[sel] ? `k-hit-${sel}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="k-palette-list" id="k-palette-list" role="listbox">
          {hits.map((h, i) => {
            const head = h.group !== lastGroup;
            lastGroup = h.group;
            return (
              <li key={h.id} role="presentation">
                {head && <div className="k-palette-group" role="presentation">{h.group}</div>}
                <button
                  id={`k-hit-${i}`}
                  role="option"
                  aria-selected={i === sel}
                  className={`k-hit ${i === sel ? 'on' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={(e) => run(h, e.shiftKey ? 'advantage' : e.altKey ? 'disadvantage' : 'normal')}
                >
                  {h.icon ? <img src={h.icon} alt="" /> : <span className={`k-hit-ic g-${h.group.replace(/\W/g, '')}`} aria-hidden="true" />}
                  <span className="k-hit-label">{h.label}{h.hint && <small> · {h.hint}</small>}</span>
                  {h.right && <strong>{h.right}</strong>}
                </button>
              </li>
            );
          })}
          {!hits.length && <li className="k-palette-empty">Nothing found{q.trim() ? ` for “${q.trim()}”` : ''}.</li>}
        </ul>
        <div className="k-palette-foot" aria-live="polite">
          {last ? (
            <span className={`k-palette-roll ${last.natural === 20 ? 'nat20' : last.natural === 1 ? 'nat1' : ''}`}>
              {last.natural !== undefined && <span className="k-die">{last.natural}</span>}
              {last.label}: <strong>{last.total}</strong> <small>[{last.dice.join(', ')}]{last.modifier ? ` ${last.modifier > 0 ? '+' : '−'} ${Math.abs(last.modifier)}` : ''}</small>
            </span>
          ) : (
            <>
              <span>Type <kbd>2d6+3</kbd> to roll it</span>
              <span><kbd>Shift</kbd>+<kbd>Enter</kbd> advantage · <kbd>Alt</kbd>+<kbd>Enter</kbd> disadvantage</span>
              <span><kbd>&gt;</kbd> for pages</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
