# PLAN_LEVELUP — Level-up for Faelan (Druid 1 → 20)

## Context

The sheet is built from a static level-1 export (`src/data/faelan.json`). `buildCharacter()` in `src/lib/character.ts` derives everything from it, and the level-dependent tables in `src/lib/rules.ts` are hand-typed (spell slots only go up to level 5). There is no way to level up. The goal is to level up in the app: confirm the level-up, get prompted for exactly the choices that level grants, lock them in, and have the whole sheet update.

A planned desktop/SQLite overhaul may land first. That's why level-up state is kept as one plain, serialisable record behind a small storage module, so moving it to SQLite later is a swap of that module.

## 1. Investigation: can dnd5eapi.co drive this? Yes, with a thin hand-coded layer

I probed the live API (2024 = SRD 5.2, 2014 = SRD 5.1).

**What the API gives as structured data (2024)**
| Need | Endpoint | Field |
|---|---|---|
| Per-level table, all 20 levels in one call | `GET /api/2024/classes/druid/levels` | array of level objects |
| Proficiency bonus | same | `prof_bonus` |
| Spell slots | same | `spellcasting.spell_slots_level_1..9` |
| Cantrips known / prepared spells | same | `spellcasting.cantrips_known`, `prepared_spells` |
| Wild Shape uses | same | `class_specific.wild_shape_uses` |
| Features gained at a level | same | `features[]` (index + name) |
| Feature text | `GET /api/2024/features/{index}` | `description` |
| Hit die | `GET /api/2024/classes/druid` | `hit_die` (8) |
| Subclasses | `GET /api/2024/subclasses` (filter `class.index`) | **only Circle of the Land** for druid |
| Subclass features per level | `GET /api/2024/subclasses/circle-of-the-land/levels` | levels 3, 6, 10, 14 |
| Feats | `GET /api/2024/feats` | 17 total: ASI, Alert, Magic Initiate, Grappler, fighting styles, Boons… with `prerequisites.minimum_level` |

**What it does NOT give**
- **Choices are prose, not structured.** The ASI feature says "gain the ASI feat or another feat", and Elemental Fury says "one of the following options". There's no `choose: n, from: [...]` like the level-1 `proficiency_choices`. The kind of choice each feature needs has to be hand-mapped.
- **HP per level.** Derived from `hit_die`: fixed `5 + CON` or roll `1d8 + CON`.
- **Non-SRD content.** No Circle of the Moon/Stars/Sea and no non-SRD feats (e.g. War Caster). Handled with a "Custom…" free-text option.
- The 2024 `ability_score_bonuses` field is gone. ASI levels have to come from feature index `druid-ability-score-improvement` (levels 4, 8, 12, 16).
- Quirk: the subclass level `url` uses `/subclasses/land/levels/3`, but the list endpoint uses `circle-of-the-land`. Use the list endpoint.

**Verdict:** viable. The API is the source of truth for numbers and feature text. A small hand-coded map (≈6 entries for druid) turns prose features into typed prompts.

## 2. Druid level-up prompts (what the wizard must ask)

| Level | API feature(s) | Prompt |
|---|---|---|
| every | — | **HP**: fixed (5+CON) or roll 1d8+CON in the dice stage |
| every | `prepared_spells` / `cantrips_known` change | **Spells**: pick new prepared spells / cantrips up to the new cap. Optionally swap one cantrip (2024 rule). |
| 2 | Wild Shape, Wild Companion | info only (Wild Shape uses tracker appears) |
| 3 | Druid Subclass | **Subclass**: Circle of the Land (SRD) or Custom (name + notes) |
| 4, 8, 12, 16 | Ability Score Improvement | **ASI or feat**: +2 one / +1 two (cap 20), or an SRD feat with `minimum_level` ≤ level, or a Custom feat |
| 7 | Elemental Fury | **Option**: Potent Spellcasting / Primal Strike |
| 19 | Epic Boon | **Boon**: an SRD `boon-*` feat or Custom |
| 3, 6, 10, 14 | subclass features | info only. For Land: also record the land type (changes on long rest; stored in play state) |
| others | e.g. Wild Resurgence, Archdruid | info only (shown in the summary step and added to Features) |

Prof bonus, slots, cantrip/prepared caps and Wild Shape uses update automatically from the level table.

## 3. Design

### Data model: `src/lib/progression.ts` (new)
```ts
interface LevelChoice {
  level: number;               // the level reached
  hp: { method: 'fixed' | 'roll'; die: number };  // die result (fixed = 5)
  subclass?: { index: string; name: string; custom?: string };
  asi?: { kind: 'scores'; plus: Partial<Record<Ability, number>> }
     | { kind: 'feat'; index: string; name: string; custom?: string };
  option?: { feature: string; choice: string };   // Elemental Fury etc.
  boon?: { index: string; name: string; custom?: string };
}
interface Progression { version: 1; levels: LevelChoice[] }  // levels 2..N, in order
```
- Pure functions: `applyProgression(base, prog, table)` → derived inputs (level, scores, HP, features). No React, no storage. This is the part that moves unchanged to the desktop app.
- `src/lib/progressionStore.ts`: `load()`/`save()`/`clear()` on localStorage key `faelan-progression`. This is the only thing to swap for SQLite later.

### API layer: extend `src/lib/api.ts`
- `fetchClassLevels(cls)`, `fetchSubclasses(cls)`, `fetchSubclassLevels(index)`, `fetchFeats()`, `fetchFeature(index)`.
- Reuse the existing cache pattern from `fetchClassSpellList` (memory map → localStorage → network, stale cache when offline), so level-up works offline after the first load.

### Choice map: extend `src/data/supplement.ts`
`LEVEL_CHOICES: Record<featureIndex, ChoiceKind>`, e.g. `druid-subclass → 'subclass'`, `druid-ability-score-improvement → 'asi'`, `druid-elemental-fury → { kind: 'option', options: ['Potent Spellcasting','Primal Strike'] }`, `druid-epic-boon → 'boon'`. Unmapped features are info-only.

### Character derivation: `src/lib/character.ts` / `src/lib/rules.ts`
- `buildCharacter(data, progression, levelTable)`:
  - level = 1 + `progression.levels.length`
  - ability scores = export + ASI bonuses (cap 20)
  - max HP = export HP + Σ(die + CON mod) per level. This is recomputed so a CON increase applies retroactively, which matches the 5e rule.
  - prof bonus, slots, `cantripCap` (+ Magician bonus), `preparedCap` from the API level table. Fall back to the current `CLASSES` tables when it's not loaded.
  - features += class/subclass features up to level (with API text), chosen feat/option/boon, custom entries.
- Remove the hand-typed `slots` / `cantripsKnown` / `preparedCount` from `rules.ts` once the API table is the source. Keep them as an offline fallback only if the cache is cold.
- `App.tsx`: `useMemo(() => buildCharacter(...), [progression, table])` instead of `[]`.

### Play state interplay: `src/hooks/usePlayState.ts`
- On level-up: add the HP gain to current HP, extend `slotsUsed` to the new slot count, and keep chosen spells. Wild Shape uses get a new tracker field.
- `load()` already merges over `fresh(c)`. Make sure arrays sized by level (`slotsUsed`) get padded when the level changes.

### UI: `src/components/LevelUp.tsx` (new)
1. **Trigger**: a "Level up" button in `Header.tsx` next to "Druid N" (hidden at 20).
2. **Confirm**: "Advance Faelan to level N+1?" with a preview of automatic changes (prof bonus, slots, caps, new features).
3. **Steps** (only those the level needs): HP → Subclass/ASI/Option/Boon → Spells (reuse the `SpellBrowser` picking logic with the new caps).
4. **Review**: a summary of every change, with "Lock in" disabled until each required choice is made.
5. **Lock in**: append the `LevelChoice`, save, and the sheet re-derives.
- **Undo last level**: pop the last `LevelChoice`, with confirmation. Same pattern as the existing "Reset play state" button.
- Drawer/modal styling follows `DetailDrawer` / `SpellBrowser`. HP roll uses `DiceProvider` / `DiceStage`.

## 4. Implementation order
1. API fetchers + cache (`api.ts`), with a quick console check against druid levels 1–20.
2. `progression.ts` pure functions + store. Wire `buildCharacter` to the API table (still level 1, so there's no visible change: a regression check).
3. Level-up modal: confirm → HP → review → lock in (levels 2 and 5 work end to end).
4. Choice steps: subclass (3), ASI/feat (4…), option (7), boon (19), custom entries.
5. Spell step + play-state padding (slots, Wild Shape).
6. Undo last level.

## 5. Verification
- `npm run build` (tsc) passes.
- `npm run dev`, then in the browser:
  - Level 1→2: HP +5+CON (fixed) or the rolled value, prepared cap 4→5, 1st-level slots 2→3, Wild Shape appears.
  - →3: subclass prompt. Pick Circle of the Land; its level-3 features appear in Features.
  - →4: ASI +2 WIS takes 17→19: WIS mod, spell DC, spell attack and Perception all update. Cantrip cap 3+1.
  - →5: prof bonus +3 and 3rd-level slots appear (beyond the old hand-typed table).
  - ASI +1 CON at a later level raises max HP by 1 per level, retroactively.
  - Undo last level restores the previous sheet. Reload keeps the progression.
  - Offline (DevTools) after the first load: the level-up still works from cache.
  - Custom subclass/feat shows in Features with "Custom" source.

## Open questions (decide during implementation)
- Should "Reset play state" leave the progression alone? (Proposed: yes. Progression has its own "Undo last level".)
- Land type for Circle of the Land: prompt at level-up and again on each long rest, or a dropdown on the sheet?
