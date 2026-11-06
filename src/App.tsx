import { useCallback, useMemo, useState } from 'react';
import { buildCharacter } from './lib/character';
import { downloadLocalExport } from './lib/localExport';
import { toast } from './lib/toast';
import type { CharacterDto } from './shared/types';
import { DiceProvider } from './lib/dice';
import { usePlayState } from './hooks/usePlayState';
import { useInventory } from './hooks/useInventory';
import { Header } from './components/Header';
import { AbilityScores } from './components/AbilityScores';
import { SavesAndSkills } from './components/SavesAndSkills';
import { CombatStats } from './components/CombatStats';
import { SpellList } from './components/SpellList';
import { Features } from './components/Features';
import { Equipment } from './components/Equipment';
import { DetailDrawer, type Selection } from './components/DetailDrawer';
import { DiceTray } from './components/DiceTray';
import { DiceStage } from './components/DiceStage';
import { SpellBrowser } from './components/SpellBrowser';

export function App({ character }: { character: CharacterDto }) {
  const c = useMemo(() => buildCharacter(character.sheet, character.extras), [character]);
  const play = usePlayState(c, character.id);
  const inventory = useInventory(c, character.id);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const close = useCallback(() => setSelection(null), []);
  const closeBrowser = useCallback(() => setBrowserOpen(false), []);
  const openSpell = useCallback((name: string) => setSelection({ kind: 'spells', name }), []);

  return (
    <DiceProvider>
      {!(play.ready && inventory.ready) ? <div className="loading">Loading {c.name}…</div> : (
      <main className="sheet">
        <Header c={c} />
        <div className="grid">
          <div className="col">
            <AbilityScores c={c} />
            <SavesAndSkills c={c} />
          </div>
          <div className="col">
            <CombatStats c={c} play={play} inventory={inventory} />
            <SpellList c={c} play={play} onOpen={openSpell} onBrowse={() => setBrowserOpen(true)} />
          </div>
          <div className="col">
            <Features c={c} />
            <Equipment inventory={inventory} onOpen={(name) => setSelection({ kind: 'equipment', name })} />
            <button
              className="btn ghost reset"
              onClick={() => confirm('Reset all play state (HP, slots, conditions)?') && play.reset()}
            >
              Reset play state
            </button>
          </div>
        </div>
        <footer>Spell &amp; item data: <a href="https://www.dnd5eapi.co" target="_blank" rel="noreferrer">dnd5eapi.co</a> (SRD 5.2 / 5.1, CC-BY-4.0)
          {' · '}
          <button className="linkish" onClick={() => downloadLocalExport() || toast('No local browser data to download')}>
            Download local data
          </button>
        </footer>
      </main>
      )}
      <SpellBrowser c={c} play={play} open={browserOpen} onClose={closeBrowser} onOpenSpell={openSpell} covered={!!selection} />
      <DetailDrawer selection={selection} onClose={close} />
      <DiceTray />
      <DiceStage />
    </DiceProvider>
  );
}
