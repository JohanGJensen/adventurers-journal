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

## 3. Design (as built)

The SQLite/Electron overhaul landed first, so level-ups are stored server-side. `buildCharacter` runs synchronously on the server too, which shaped these decisions:

- **Numbers are static, text comes from the API.** `src/lib/rules.ts` holds the full 1–20 druid tables (slots, cantrips, prepared, Wild Shape uses). `bun scripts/check-levels.ts` compares them with the API. The API's 2024 `cantrips_known` has glitches at levels 7 and 16, and the PHB value is used there.
- **Storage**: `characters.levels_json` (migration 002) holds a `LevelChoice[]` (`src/shared/types.ts`). Each record snapshots the feature text shown at lock-in, so the sheet derives offline and on the server.
- **Derivation**: `buildCharacter(sheet, extras, levels)`. Scores = export + ASI/feat/boon bonuses (cap 20, 30 for boons). Max HP is recomputed so CON changes apply to every level. Initiative and unarmored AC follow DEX changes.
- **API**: `GET /api/srd/levelup/:cls/:level?subclass=` collects features with text plus subclass, feat and boon options, and caches every upstream call in `srd_cache`.
- **Lock in / undo**: `POST /api/characters/:id/levels` and `DELETE /api/characters/:id/levels/last` each run in one transaction with the play-state change (HP gain, slot padding, spell picks, land type), and log a `level` event.
- **Choice map**: `LEVEL_CHOICES` in `src/data/supplement.ts`.
- **UI**: `LevelUp.tsx` walks through confirm → HP → subclass/ASI/option/boon → spells (`SpellPicker`, new cantrips required) → review → lock in.
  - The Header has the "Level up" button; "Undo level N" sits under Features.
  - Combat shows a Wild Shape tracker.
  - Circle of the Land asks for the land type at level-up and after each long rest.
- Reset play state leaves level-ups alone.
- **HP step**: the average can be toggled on and off. A roll happens once and is kept, so you can switch between the two but never re-roll.

## 4. Homebrew subclasses (as built)

The free-text custom subclass in the wizard was replaced by a homebrew library at `/homebrew`, linked from the main menu.
- **Class-tied library**: the `homebrew_subclasses` table (migration 003). Routes are `GET/POST /api/homebrew/subclasses?class=` and `GET/PUT/DELETE /api/homebrew/subclasses/:id`. Export and import use JSON.
- **Contents**: flavor text, and per class subclass level (druid 3/6/10/14):
  - features;
  - always-prepared spells;
  - buffs: AC, speed, initiative, HP per level, ability scores, extra cantrips, skill/save/other proficiencies;
  - limited-use resources: a fixed number, the proficiency bonus or an ability modifier, recharging on a short or long rest.

  Optional **variants** (e.g. "Season": Spring/Autumn) come with their own spells. They are picked at level-up and can be changed after each long rest.
- **Live link**: a level record stores `subclass.index = homebrew-<id>`. The server attaches the current subclass as `CharacterDto.homebrew`, and `buildCharacter(..., homebrew)` applies it, so edits reach every character straight away. Deleting a subclass is blocked while it's in use.
- **Wizard**: SRD and homebrew subclasses are listed together, plus "Create a homebrew subclass…". That link saves the wizard draft (including a rolled HP) to sessionStorage, opens the editor, then returns with the new subclass selected.
- **Play state**: `landType` is generalised to `variant` (old saves are migrated on read), and there's a new `resourcesUsed`. The sheet gets resource trackers and a Short rest button.
- **Tome styling** (`.tome` in `styles.css`): applied to the wizard, spell browser, detail drawer, homebrew editor and the variant dialog, with a candlelit version in dark mode.
  - **Textures**: `bun run textures` (`scripts/gen-textures.ts`) generates crisp, tileable, cel-shaded parchment and leather PNGs (light and dark), plus SVG ornaments: the gilt frame, the torn page edge and the ruled divider. They go in `public/textures/`.
  - **Layers**: leather binding (border box, stitched outline) → parchment page (padding box) → torn edge (`::before`) → gilt frame (`::after`).

Follow-ups: feat mechanics beyond ability bonuses, Circle of the Land always-prepared spells by land type, classes other than druid, homebrew feats.

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
