# Plan: the "pushed further" visual redesign

The whole app moves to the look and layouts on the design canvas
([Adventurers Journal — layout & UX proposals](https://claude.ai/artifact/TDVTbXgxSTKmoZp9oxBTN9)). The **"Pushed further"**
row (6, 6b, 6c) sets the visual rules. The earlier rows (1–5) set the layout: sidebar, banner with vitals, ribbon
tabs, the Notes reader and Ctrl+K.

Delivery: **one branch and PR per phase**, each off `master` and shippable on its own. Phases are ordered so that
every later one builds on the kit from Phase 0.

---

## Rules that hold in every phase

1. **Same castle, more drama.** Keep the stone wall, parchment, gilt, class colours and the three fonts:
   IM Fell English SC for titles, Cinzel for numbers, EB Garamond for words. Never add a sans-serif UI font or
   flat surfaces.
2. **Nothing written straight on the stone or the leather.** Titles hang on parchment plaques or brass plaques. No
   dark recessed panels behind content, and no leather sidebar: the sidebar is a plain parchment sheet.
3. **Drama is layered on top, never instead of content:** candle flicker, embers, gilt filigree corners, wax seals,
   illuminated drop caps, swallowtail class pennants, sheen sweeps on hover.
4. **Keep it a little low-fi.** Gilt rings are smooth gradients with one thin inner line, not milled or bevelled
   edges. Coins have no faded emblem behind the number. When in doubt, drop a layer of detail.
5. **Motion has an off switch.** Under `prefers-reduced-motion: reduce`, every animation and transition stops and
   effect overlays don't render. The existing rule at `src/styles.css` (~line 447) is the model.
6. **Day and night.** Every new piece has a night variant under `@media (prefers-color-scheme: dark)`: dark stone,
   umber vellum, warmer and stronger candle glow, gilt `#e0b456`. A phase isn't done until both themes look right.
7. **Class colours drive accents.** Use `--accent`, `--accent-2`, `--accent-soft` and `--glow` from
   `[data-class]`. Never hard-code druid green: the mockups show a druid, the app has every class.
8. **Accessible as drawn.** Real `<button>` and `<a>` elements, labels on icon-only buttons, text contrast of at
   least 4.5:1 (including italic hints), and touch targets of at least 40 px.
9. **Every screen size.** A phase is checked at each width in "Screen sizes" below, and hover-only effects have a
   touch alternative.
10. **No candles in picture frames.** Candlelight is a soft glow on a surface, not candle objects. The sconces on
    board 6c are dropped.

---

## Screen sizes

The app is an Electron window (1280×900 by default, resizable, no minimum set in `electron/main.ts`) and also
runs in a browser on phones and tablets. Today `styles.css` has nine ad-hoc breakpoints (420–1000 px). The
redesign uses four named ranges, set once in `tokens.css` as custom media or documented constants, and every new
component states what it does in each:

| Range | Width | Shell | Banner and tabs | Content |
|---|---|---|---|---|
| **Phone** | < 600 px | The sidebar becomes a top bar: the character's portrait, name and a "☰ Journal" button that opens the sidebar as a full-height parchment sheet. | The banner shrinks to name + HP vial + AC. The other vitals fold into a "Vitals" disclosure. When the banner is pinned while scrolling, it is one compact line: portrait, HP, AC, slots. Tabs scroll sideways. | One column. Ability coins in 3×2 (coins 96 px). |
| **Tablet** | 600–1000 px | The sidebar folds to an icon rail (56 px, names as tooltips and `aria-label`s), expandable. | Full banner; the vitals wrap onto two rows. | Two columns where a page has them. Coins in a row of 6 if they fit, otherwise 3×2. |
| **Laptop** | 1000–1440 px | Full sidebar (240 px). | Full banner on one or two rows. | The layouts as on the canvas. This is the default Electron window. |
| **Wide** | > 1440 px | Full sidebar. | Banner within the content's max width. | Content capped at about 1180 px and centred, so lines and the deck don't stretch. The Notes reader and spell details may open as a two-page spread (the existing `min-width: 1000px` spread rule is the model). |

Also:
- **Electron:** set `minWidth: 400, minHeight: 560` on the window in `electron/main.ts`, so the phone layout is
  the smallest it ever gets.
- **Touch** (`@media (hover: none)`): hover lifts, sheens and tilts don't fire. Whatever hover reveals must be
  reachable by tap: on the spell deck the first tap picks a card (lift and details), the second tap or the Cast
  button casts.
- **Short windows** (`max-height: 700px`): the banner doesn't pin, so it never covers half the screen.
- **Spell deck by width:** laptop and wide, the fanned arc. Tablet, a tighter arc with more overlap. Phone, no fan:
  a sideways-scrolling row of cards with scroll snapping, the picked card's details below, and the cast effect
  scaled to the screen.
- **The effects scale:** rune rings, the pillar and sparks are sized with `min(…vw, …px)`, never fixed pixels.

---

## Phase 0: the kit (branch `feature/redesign-kit`)

The foundations, with no visible change to any page yet.

- **Split `src/styles.css`** (1,500 lines) into `src/styles/` partials imported in the same order from
  `src/styles.css`: `tokens.css` (`:root`, night, `[data-class]`), `surfaces.css` (stone, parchment, gilt, tome),
  `kit.css` (new), then one file per area (`sheet.css`, `spells.css`, `notes.css`, `create.css`, `dialogs.css`,
  `map.css`…). Move the rules as they are, without changing them. Check that the app looks identical before and
  after.
- **New tokens** in `tokens.css`: `--gilt-hi #e0b456`, `--gilt-lo #6e4a12`, `--wax #a8322a`, `--wax-blue #24508f`,
  `--ember #ffb35c`, `--candle rgb(255 200 110 / 34%)`, plus motion tokens (`--ease-spring`, `--dur-fast/med/slow`).
  Night overrides for each.
- **Kit components** in `src/components/kit/`, each small and presentational, using kit CSS classes:
  - `Parchment` (`as`, `gilt`, `corners` props): the card surface. `corners` draws the filigree SVG.
  - `Plaque` (brass, with chains) and `ParchmentPlaque`: titles that hang on the wall.
  - `WaxSeal` (`colour`: red/blue/green, `pressed`, `stamp` animation): toggles and badges.
  - `Pennant`: the swallowtail class banner, coloured by `--accent`, with a gentle sway.
  - `Coin`: the ability medallion (ring, parchment face, score diamond, ribbon; `proficient` turns the ribbon and
    inner ring green). It's reused for Initiative and Speed.
  - `Vial`: the HP glass with liquid level, colour bands (>60 % accent, >30 % gilt, else wax red), slosh, bubbles,
    and a shake on damage.
  - `Pips` (`total`, `filled`, `burn` index): slot and use pips. The burn-out flare is in CSS.
  - `Embers` (`count`): an absolutely positioned layer that sits behind content and ignores clicks.
  - `CandleLight`: a flickering vignette overlay for a surface.
  - `DropCap`: CSS only, `.drop::first-letter`.
- **`/kit` route** (dev builds only: show it when `import.meta.env.DEV`). One page that shows every kit piece in
  every state, and a class picker that sets `data-class`. This is where each phase checks day and night.
  Add `{ name: 'kit' }` to `Route` and `parseRoute` in `src/lib/router.ts`, and the case in `src/Root.tsx`.

**Done when:** `bun run check` passes, the app looks unchanged, and `/kit` shows every piece in both themes and with
reduced motion.

---

## Phase 1: app shell and sidebar (`feature/redesign-shell`)

The text links in `.sheet-nav` (`src/App.tsx`) and the separate pages for Lore, History, Map and Notes get one
shared frame.

- `src/components/shell/Shell.tsx`: a flex-wrap row with the `Sidebar` (a parchment sheet, `flex: 1 1 240px`) and
  the content (`flex: 999 1 640px`). On a phone the sidebar stacks above the content and folds into a "☰ Journal"
  disclosure.
- `Sidebar.tsx` has these sections:
  - **Character switcher:** portrait, name and class·level, with a menu of the other characters.
  - **At the table:** Character sheet, Spells, Inventory.
  - **The campaign:** Notes, Journey map (only with Cartographer's Tools, as `hasTool` decides today), Lore,
    History.
  - **At the foot:** Find & roll (Ctrl K) from Phase 7, Homebrew, All characters.
  - The current page is marked with `aria-current` and a gilt or accent edge.
- Every character route goes through `Shell`: `sheet`, `lore`, `log`, `map` and `notes` (see `Root.tsx`). The Notes
  page asks the sidebar to fold to icons, as in mockup 2.
- `Embers` sits on the wall behind the shell, about 12 of them.

**Done when:** every character page has the sidebar, the old `.sheet-nav` is gone, and it works at phone width.

---

## Phase 2: banner, vitals and ribbon tabs (`feature/redesign-banner`)

Merge `Header.tsx` and the vitals half of `CombatStats.tsx` into one banner, which pins to the top when the page
scrolls (`position: sticky`).

- **Banner:** a parchment panel with an accent top border and a gilt stitch line, and the `Pennant` with the
  `ClassEmblem`. The portrait sits in a gilt laurel wreath (SVG). The name is in embossed Fell, with
  "race · class level · subclass · alignment" under it. Level up stays; Reset play state and Undo level move into
  a ⋯ menu.
- **Vitals row:**
  - `Vial` for HP, with an amount field and Damage, Heal and Temp buttons.
  - An AC crest.
  - Initiative and Speed coins; Initiative rolls.
  - Slot `Pips` per level.
  - Wild Shape and other limited uses.
  - Condition chips with "+ Add".
  - Short and Long rest buttons.
  - The data already exists in `usePlayState`: `tempHp`, `slotsUsed`, `conditions`, `concentration`,
    `wildShapeUsed`, `hitDiceUsed`.
- **Concentration seal:** when `play.state.concentration` is set, a blue `WaxSeal` stamps in, showing
  "Concentrating: X" with an end ×.
- **Inspiration seal:** `PlayState` has no inspiration field. Add `inspiration: boolean` to `PlayState` in
  `src/shared/types.ts`, default `false`, alongside how `wildShapeUsed` is defaulted. Check
  `server/play.test.ts` for the state shape. The seal toggles it.
- **Ribbon tabs** under the banner: Stats, Spells, Inventory, Features. Routes become `/c/:id`, `/c/:id/spells`,
  `/c/:id/inventory` and `/c/:id/features`: extend the `sheet` route with `tab` in `router.ts`, and keep `/c/:id`
  as Stats. Each tab renders only its section, replacing today's three-column grid in `App.tsx`.

**Done when:** HP, slots, conditions, rests and concentration all work from the banner. The tabs deep-link and
the back button works.

---

## Phase 3: Stats tab (`feature/redesign-stats`)

Replace the grid on the Stats tab with:

- **Abilities as six `Coin`s** (replacing `AbilityScores.tsx`). The modifier is big in the middle, the score
  sits on the diamond, and the full name is on the ribbon (green when the save is proficient). Under each coin go
  **Check** and **Save** buttons, which roll through `useDice().roll` with `modeFromEvent` (Shift for advantage,
  Alt for disadvantage), as now. The background bonus stays in the coin's title or tooltip. Hover tilts the coin
  and sweeps a sheen across it.
- **Skills** (from `SavesAndSkills.tsx`, now without saves): rows with a gilt diamond for proficiency (accent fill
  when trained), click to roll. Add Passive Perception and senses.
- **Actions:** weapon attacks, attack cantrips and limited features, each with roll buttons.
- **Today's spells:** small glowing chips in their element colour that open the Spells tab.
- Keep the cinematic `DiceStage`. Restyle the `DiceTray` result as an unrolling parchment strip with a d20 that
  tumbles in, and a gold die on a natural 20.

---

## Phase 4: Spells tab, list and deck (`feature/redesign-spells`)

A view toggle at the top of the tab switches between **List** and **Deck**. It's stored per character in
`localStorage` (`aj.spellView.<id>`), defaults to Deck, and List is for managing.

- **Casting header** (shared by both views): ability, save DC, spell attack (rolls), prepared count, filters as
  wax-seal toggles (Concentration, Ritual, Bonus action, Damage), search, and "Learn from the SRD"
  (`SpellBrowser`).
- **List view:** today's `SpellList.tsx` restyled. One parchment card per circle with slot `Pips` in its heading.
  Prepare checkboxes, ✦ for always-prepared spells, Cast buttons, and the selected spell's details open beside the
  list instead of in the drawer on wide screens.
- **Deck view** (new `src/components/spells/SpellDeck.tsx`), as in board 6:
  - **The hand:** prepared spells and cantrips fanned along an arc. Rotation and offset are computed per card;
    with many spells, the arc gets tighter and the cards overlap more.
  - **Colours:** each card's colour comes from its damage type or school. Put a lookup in `src/lib/spellColour.ts`
    with fire→ember, radiant→moonlight, thunder→storm blue, healing→gold, conjuration→emerald, and so on, and a
    fallback per school. Reuse `SchoolIcon` for the sigil.
  - **The card:** the circle as a Roman numeral on a gilt lozenge, cost and range, conc./ritual seals, and the
    damage dice.
  - **Hover:** the card lifts and straightens, an aura glows in its colour, and a foil sheen sweeps across.
  - **Click to cast:** spend the slot through `play` (the same call as today's Cast), then play the cast effect.
    The effect is an overlay of the card flying to the circle, two counter-rotating rune rings, a light pillar, a
    shockwave, about 40 sparks, the spell name, and the page edges glowing in the spell's colour, about 2.9 s in
    all. The overlay has `aria-hidden` and doesn't render with reduced motion; the toast still announces the cast.
  - **After the cast:** the slot pip burns out in the banner. A concentration spell sets
    `play.state.concentration`, which stamps the seal from Phase 2.
  - **Upcasting:** a spell cast from a higher slot offers the slot choice before the effect.
  - **Out of slots:** cards of an empty circle go grey with a cracked seal, and clicking one opens its details
    only. A Long rest brings them back.
- The effect is pure CSS keyframes and spans: no canvas or WebGL. Keep it in `spells.css` under `.cast-*`.

**Done when:** casting from the deck and from the list spends the same slots, concentration and upcasting work,
and the effect is smooth in Electron on this machine.

---

## Phase 5: Inventory and Features tabs (`feature/redesign-gear`)

- **Inventory** (`Equipment.tsx`, `useInventory`), as in mockup 1c with the kit:
  - an equipped panel showing where AC comes from;
  - the backpack as a table with quantity steppers and quick Drink or Eat;
  - coins as metal discs (cp, sp, ep, gp, pp) with an inner shine;
  - a burden bar, and attunement as three slots with `WaxSeal`s.
  - `ToolKit` joins this tab.
- **Features** (`Features.tsx`), as in mockup 1d: grouped by source (class, subclass, species, feat), uses as
  `Pips` with a Use button, an illuminated drop cap on each feature's first paragraph, and "Next level brings…" at
  the bottom.

---

## Phase 6: hall of heroes (`feature/redesign-home`)

`CharacterList.tsx` becomes board 6c:
- each campaign on a parchment section with a brass `Plaque` hanging from chains;
- each hero in an arched gilt frame with a soft candle-glow flicker inside it (no candle objects), a class `Pennant` with the level in Roman
  numerals, a thin HP bar, and AC and condition chips;
- an empty frame with a wax "+" to add a hero to that campaign.

Import, Back up, History, Export and Delete move into a ⋯ menu per hero and into the sidebar's foot. The existing
rune-circuit hover (`styles.css` ~784) is replaced by the frame sheen.

---

## Phase 7: Notes reader and Ctrl+K (`feature/redesign-notes`)

- **Notes** (`NotesPage.tsx`, `NoteSidebar.tsx`, `NoteView.tsx`, `NoteEditor.tsx`), as in mockup 2:
  - a narrow parchment strip of note kinds with their medallions and counts, then an index of titles;
  - the note as an open page: the framed stand-in or picture, facts over a gilt rule, a drop cap, and
    "Mentioned in" in a side column;
  - Edit turns the same page editable;
  - hovering a `[[link]]` shows a small parchment preview card.
- **Quick find and roll**, as in mockup 4: a new `CommandPalette.tsx` mounted once in `Root.tsx`, opened by Ctrl+K
  or ⌘K and the sidebar entry.
  - It searches notes, spells, items and skills; matching dice notation (`2d6+3`) rolls straight away, and `>`
    runs actions (long rest, level up).
  - Use the data the pages already load: the `api` client and `useLookups`. Add a small `/api/search` endpoint
    only if the client-side search is too slow.

---

## Phase 8: everything else (`feature/redesign-rest`)

Apply the kit to the remaining surfaces, one commit per area:
- Lore (`Lore.tsx`): an illuminated banner of traits, and the story with a drop cap.
- History log.
- Journey map: its frame and toolbar only; the drawing stays as it is.
- Homebrew library and editor.
- The character creation wizard: the step trail uses `WaxSeal`, and the class pick cards use `Pennant`.
- Level up.
- `DetailDrawer` and the dialogs.
- The `Loader`: its sigil gets rune rings that match the cast effect.
- Toasts: small parchment slips, each with a wax dot in its kind's colour.

**Theme toggle and the dark wall.** Do these after the surfaces above, once nothing is written straight on the
stone any more.
- **Day theme on the dark wall:** the day theme keeps its light parchment and ink but hangs it on the dark stone
  (`stone-dark.png`), with the night theme's torchlight and vault shading. In `tokens.css` that's `--stone-tex`,
  `--torch` and `--vault` in the light `:root`. Check that every page still has no text on the wall; anything left
  gets a plaque.
- **A theme switch:** Day, Night, or Follow the system (the default). It lives in the sidebar's foot and on the
  character list, as a three-way segmented control with a sun, a moon and a half-and-half icon.
  - **Storage:** the choice goes in `localStorage` (`aj.theme`) and is applied before first paint by a tiny inline
    script in `index.html`, so the page never flashes the wrong theme.
  - **The CSS:** today the night rules live under `@media (prefers-color-scheme: dark)`. Switch them to
    `:root[data-theme='night']` plus `@media (prefers-color-scheme: dark) { :root:not([data-theme='day']) … }`.
    One small helper does the rewrite, applied to every partial: `tokens.css` and every `k-` file with night
    variants.
  - **Electron:** set `nativeTheme.themeSource` to match (`'light' | 'dark' | 'system'`), through a small IPC call,
    so scrollbars and native dialogs follow.
- **Check:** every page in all three modes. The system mode must still follow the OS switch live.

---

## Phase 9: tidy and harden (`chore/redesign-cleanup`)

- Delete the CSS that no longer has a user. Search each class name in `src/` before removing its rule.
- **Performance:**
  - Cap embers and sparks.
  - Only animate `transform` and `opacity`.
  - Pause the embers and the candle flicker when the window is hidden (`document.visibilitychange`).
  - Profile a cast in Electron's DevTools.
- **Accessibility:**
  - Tab through every page.
  - Check contrast of italic hints on parchment in both themes.
  - Screen-reader labels on the coins, the vial (`role="img"` with "Hit points 22 of 27"), seals and pips.
- **Screen sizes:** a last pass of every page at each width in "Screen sizes", in both themes, and remove the old
  ad-hoc breakpoints that the named ranges replaced.
- Update `README.md` screenshots, and update the memory note on the castle aesthetic to cover the new principles.
- **Delete `PLAN.md`** in this phase's PR: the redesign is done and the plan has served its purpose.

---

## How each phase is checked

1. `bun run check`, which covers both TypeScript projects, the tests and the Electron smoke test.
2. `bun run dev`. Open the changed pages for the druid (`test-characters/test-druid.json`) and for a
   character of another class, so the class colours are tested. Check each:
   - in the day theme and the night theme (switch the OS theme);
   - at every range in "Screen sizes": 390, 768, 1280 and 1680 px wide (DevTools device toolbar, or resize the
     Electron window), plus one short window (1280×650);
   - with touch emulation on, for the hover alternatives;
   - with reduced motion on.
3. Open `/kit` to check every piece that was touched.
4. Open the PR with before and after screenshots of the changed pages.
