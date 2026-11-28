import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildCharacter } from './lib/character';
import { navigate } from './lib/router';
import type { CharacterDto } from './shared/types';
import { DiceProvider } from './lib/dice';
import { usePlayState } from './hooks/usePlayState';
import { useInventory } from './hooks/useInventory';
import { Banner } from './components/sheet/Banner';
import { SheetTabs } from './components/sheet/SheetTabs';
import type { SheetTab } from './lib/router';
import { AbilityScores } from './components/AbilityScores';
import { SavesAndSkills } from './components/SavesAndSkills';
import { SpellList } from './components/SpellList';
import { Features } from './components/Features';
import { Equipment } from './components/Equipment';
import { ToolKit } from './components/ToolKit';
import { DetailDrawer, type Selection } from './components/DetailDrawer';
import { DiceTray } from './components/DiceTray';
import { DiceStage } from './components/DiceStage';
import { SpellBrowser } from './components/SpellBrowser';
import { LevelUp } from './components/LevelUp';
import { api } from './lib/client';
import { toast } from './lib/toast';
import type { PlayState } from './shared/types';
import { Loader } from './components/Loader';

export function App({ character, tab, onCharacterChange }: { character: CharacterDto; tab: SheetTab; onCharacterChange: (c: CharacterDto) => void }) {
  const c = useMemo(() => buildCharacter(character.sheet, character.extras, character.levels, character.homebrew), [character]);
  const play = usePlayState(c, character.id);
  const hasSpells = c.spellAbility !== null || c.spells.length > 0 || c.bonusSpells.length > 0;
  const inventory = useInventory(c, character.id);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  // `?levelup=1[&pick=…]`: back from the homebrew editor, reopen the wizard (its draft is in sessionStorage).
  const [returnPick] = useState(() => {
    const q = new URLSearchParams(location.search);
    return q.get('levelup') ? { pick: q.get('pick') ?? undefined } : null;
  });
  const [levelUpOpen, setLevelUpOpen] = useState(!!returnPick);
  useEffect(() => {
    if (returnPick) navigate(`/c/${character.id}`, true);
  }, [returnPick, character.id]);
  const closeLevelUp = useCallback(() => setLevelUpOpen(false), []);
  const close = useCallback(() => setSelection(null), []);
  const closeBrowser = useCallback(() => setBrowserOpen(false), []);
  const openSpell = useCallback((name: string) => setSelection({ kind: 'spells', name }), []);
  const undoLevel = async () => {
    if (!confirm(`Undo level ${c.level}? ${c.name} goes back to level ${c.level - 1} and that level's choices are removed.`)) return;
    await play.settle();
    const r = await api<{ character: CharacterDto; play: { state: PlayState; version: number } }>('DELETE', `/characters/${character.id}/levels/last`);
    if (!r.data) return toast(`Could not undo: ${r.error}`, 'error');
    play.replace(r.data.play.state, r.data.play.version);
    onCharacterChange(r.data.character);
    toast(`Back to level ${c.level - 1}`);
  };

  useEffect(() => {
    document.title = `${c.name} · Adventurers Journal`;
  }, [c.name]);

  // Class palette (accent colours, emblem) for the whole page, including portaled dialogs.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.class = c.classKey;
    return () => {
      delete root.dataset.class;
    };
  }, [c.classKey]);

  return (
    <DiceProvider characterId={character.id}>
      {!(play.ready && inventory.ready) ? <Loader size="page" label={`Opening ${c.name}’s journal`} /> : (
      <main className="sheet">
        <Banner
          c={c}
          play={play}
          inventory={inventory}
          characterId={character.id}
          onPortraitSaved={onCharacterChange}
          onLevelUp={() => setLevelUpOpen(true)}
          onUndoLevel={c.levels.length > 0 ? undoLevel : undefined}
        />
        <SheetTabs characterId={character.id} tab={tab} hasSpells={hasSpells} />
        {tab === 'stats' && (
          <div className="k-tab-grid">
            <AbilityScores c={c} />
            <SavesAndSkills c={c} />
          </div>
        )}
        {tab === 'spells' && (
          <div className="k-tab-single">
            {hasSpells ? (
              <SpellList c={c} play={play} onOpen={openSpell} onBrowse={() => setBrowserOpen(true)} />
            ) : (
              <section className="card"><p className="hint">{c.name} has no spells.</p></section>
            )}
          </div>
        )}
        {tab === 'inventory' && (
          <div className="k-tab-grid">
            <Equipment inventory={inventory} onOpen={(name) => setSelection({ kind: 'equipment', name })} />
            <ToolKit c={c} />
          </div>
        )}
        {tab === 'features' && (
          <div className="k-tab-single">
            <Features c={c} variant={play.state.variant} />
          </div>
        )}
        <footer>Spell &amp; item data: <a href="https://www.dnd5eapi.co" target="_blank" rel="noreferrer">dnd5eapi.co</a> (SRD 5.2 / 5.1, CC-BY-4.0)</footer>
      </main>
      )}
      <SpellBrowser c={c} play={play} open={browserOpen} onClose={closeBrowser} onOpenSpell={openSpell} covered={!!selection} />
      {levelUpOpen && play.ready && (
        <LevelUp
          dto={character}
          c={c}
          play={play}
          onClose={closeLevelUp}
          onDone={(dto) => {
            setLevelUpOpen(false);
            onCharacterChange(dto);
          }}
          onOpenSpell={openSpell}
          covered={!!selection}
          initialPick={returnPick?.pick}
        />
      )}
      <DetailDrawer selection={selection} onClose={close} />
      <DiceTray />
      <DiceStage />
    </DiceProvider>
  );
}
