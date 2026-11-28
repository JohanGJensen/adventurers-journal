import { linkTo, type SheetTab } from '../../lib/router';

const TABS: { tab: SheetTab; label: string; path: string }[] = [
  { tab: 'stats', label: 'Stats', path: '' },
  { tab: 'spells', label: 'Spells', path: '/spells' },
  { tab: 'inventory', label: 'Inventory', path: '/inventory' },
  { tab: 'features', label: 'Features', path: '/features' },
];

/** Ribbon tabs hanging from the banner. Each is its own address, so the back button and links work. */
export function SheetTabs({ characterId, tab, hasSpells }: { characterId: number; tab: SheetTab; hasSpells: boolean }) {
  return (
    <nav className="k-ribbons" aria-label="Sheet sections">
      {TABS.filter((t) => t.tab !== 'spells' || hasSpells).map((t) => (
        <a key={t.tab} className={`k-ribbon-tab ${t.tab === tab ? 'on' : ''}`} aria-current={t.tab === tab ? 'page' : undefined} {...linkTo(`/c/${characterId}${t.path}`)}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
