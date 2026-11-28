import { useEffect, useRef, useState, type ReactNode } from 'react';
import { linkTo } from '../../lib/router';
import type { CharacterSummary } from '../../shared/types';
import { useCharacterFacts, useCharacters } from './shellData';

export type ShellPage = 'sheet' | 'spells' | 'inventory' | 'lore' | 'log' | 'map' | 'notes';

const Icon = ({ d }: { d: string }) => (
  <svg className="k-side-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  sheet: 'M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM9 8h6M9 12h6M9 16h4',
  spells: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  inventory: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  notes: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM4 17a2 2 0 0 1 2-2h12',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  lore: 'M20 4C10 4 5 10 4 20M20 4c0 8-5 12-12 12',
  log: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 8v4l3 2',
  homebrew: 'M14 4l6 6-9 9H5v-6z',
  all: 'M15 6l-6 6 6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  rail: 'M6 6l6 6-6 6M13 6l6 6-6 6',
};

function Avatar({ c, size }: { c: CharacterSummary | undefined; size: number }) {
  const style = { width: size, height: size };
  if (c?.portrait) return <img className="k-side-avatar" src={c.portrait} alt="" style={style} />;
  const initials = (c?.name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return (
    <span className="k-side-avatar initials" style={style} aria-hidden="true">
      {initials}
    </span>
  );
}

function NavLink({ to, icon, current, children }: { to: string; icon: string; current?: boolean; children: ReactNode }) {
  return (
    <a className={`k-side-link ${current ? 'on' : ''}`} aria-current={current ? 'page' : undefined} title={typeof children === 'string' ? children : undefined} {...linkTo(to)}>
      <Icon d={icon} />
      <span className="k-side-label">{children}</span>
    </a>
  );
}

/** The parchment sidebar on every character page: who you're playing, then where to go. */
export function Sidebar({ characterId, current }: { characterId: number; current: ShellPage }) {
  const list = useCharacters();
  const { hasMap, hasSpells } = useCharacterFacts(characterId);
  const me = list?.find((c) => c.id === characterId);
  const others = list?.filter((c) => c.id !== characterId) ?? [];
  const [open, setOpen] = useState(false); // phone: the sheet is pulled out over the page
  const [expanded, setExpanded] = useState(false); // tablet rail: widened to show the names
  const [switching, setSwitching] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Phone sheet: Esc closes it, and focus moves into it when it opens.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  // Any navigation closes the phone sheet and the switcher.
  useEffect(() => {
    setOpen(false);
    setSwitching(false);
  }, [characterId, current]);

  /** The same page for another character, when they have it; otherwise their sheet. */
  const pageFor = (c: CharacterSummary) => {
    if (current === 'sheet' || current === 'map' || current === 'spells' || (current === 'notes' && !c.campaignId)) return `/c/${c.id}`;
    return `/c/${c.id}/${current}`;
  };
  const base = `/c/${characterId}`;

  return (
    <nav className={`k-side ${open ? 'open' : ''} ${expanded ? 'expanded' : ''}`} aria-label="Journal">
      {/* Phones: a slim bar with who you're playing and the button that pulls the sheet out. */}
      <div className="k-side-bar k-parch">
        <Avatar c={me} size={34} />
        <span className="k-side-bar-name">{me?.name ?? ''}</span>
        <button type="button" className="btn ghost small k-side-menu" aria-expanded={open} aria-controls="k-side-panel" onClick={() => setOpen((v) => !v)}>
          <Icon d={ICONS.menu} /> Journal
        </button>
      </div>
      {open && <div className="k-side-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="k-side-panel k-parch" id="k-side-panel" ref={panel}>
        <div className="k-side-title">Adventurers Journal</div>

        <div className="k-side-switch">
          <button type="button" className="k-side-me" aria-expanded={switching} aria-haspopup="true" onClick={() => setSwitching((v) => !v)} title={me ? `${me.name} · ${me.subtitle}` : undefined}>
            <Avatar c={me} size={44} />
            <span className="k-side-label k-side-who">
              <strong>{me?.name ?? 'Loading…'}</strong>
              <small>{me?.subtitle ?? ''}</small>
            </span>
            {others.length > 0 && (
              <svg className="k-side-caret k-side-label" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M7 10l5 5 5-5" />
              </svg>
            )}
          </button>
          {switching && others.length > 0 && (
            <ul className="k-side-others k-parch" aria-label="Switch character">
              {others.map((c) => (
                <li key={c.id}>
                  <a className="k-side-link" {...linkTo(pageFor(c))}>
                    <Avatar c={c} size={26} />
                    <span className="k-side-label">{c.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="k-side-group">At the table</div>
        <NavLink to={base} icon={ICONS.sheet} current={current === 'sheet'}>Character sheet</NavLink>
        {hasSpells && <NavLink to={`${base}/spells`} icon={ICONS.spells} current={current === 'spells'}>Spells</NavLink>}
        <NavLink to={`${base}/inventory`} icon={ICONS.inventory} current={current === 'inventory'}>Inventory</NavLink>

        <div className="k-side-group">The campaign</div>
        {me?.campaignId != null && <NavLink to={`${base}/notes`} icon={ICONS.notes} current={current === 'notes'}>Notes</NavLink>}
        {hasMap && <NavLink to={`${base}/map`} icon={ICONS.map} current={current === 'map'}>Journey map</NavLink>}
        <NavLink to={`${base}/lore`} icon={ICONS.lore} current={current === 'lore'}>Lore</NavLink>
        <NavLink to={`${base}/log`} icon={ICONS.log} current={current === 'log'}>History</NavLink>

        <div className="k-side-fill" />
        <NavLink to="/homebrew" icon={ICONS.homebrew}>Homebrew</NavLink>
        <NavLink to="/" icon={ICONS.all}>All characters</NavLink>

        {/* Tablet rail: widen it to read the names. */}
        <button type="button" className="k-side-expand" aria-expanded={expanded} aria-label={expanded ? 'Fold the sidebar' : 'Show names in the sidebar'} onClick={() => setExpanded((v) => !v)}>
          <Icon d={ICONS.rail} />
        </button>
      </div>
    </nav>
  );
}
