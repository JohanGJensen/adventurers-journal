---
name: character-lore
description: Interview the user to flesh out a character's background lore and personality, then save it to the character's Lore page in the journal. Use when asked to write, invent, flesh out or rework a character's lore, backstory, history or personality traits, to "interview me about my character", or for "/character-lore [name|id]".
---

# Character lore interview

Builds a character's story *with* the user: read the sheet, ask questions in rounds, fill the gaps sensibly,
draft something short, and save it to the Lore page (`/c/<id>/lore`). The worked example is Faelan in
`src/data/faelan-lore.ts`. Match its length, tone and format.

**Ask before you write.** Don't draft any lore until the user has answered at least two rounds of questions,
even if the request sounds like "just write some lore". Faelan's first draft was written without an
interview, and the user had to ask for questions instead.

## Tool: `bun scripts/lore.ts`

The app's API is only reachable from inside the app, so this CLI reads and writes the journal database
directly, using the same server code. By default it uses the app's database. `DND_DB=<path>` or
`--db <path>` points it at another file. Output is JSON.

| Command | What it does |
|---|---|
| `list` | id, name, subtitle and `hasLore` for every character |
| `show <id>` | The brief: race and subrace, class, subclass, level, background, alignment, abilities, skills, tools, features, spells (with source), equipment, the character's notes, and existing `lore` |
| `write <id> <file.json> [--replace]` | Validates and saves lore after backing up the database. It refuses if the character already has lore, unless `--replace` is given |

It's safe to run while the app is open. Afterwards the user only needs to reload the Lore page.

## Process

1. **Pick the character.** Run `list` and match the name or id the user gave. If it's ambiguous, ask.
   Then run `show <id>`.
   - If `lore` is not empty, ask whether to **extend** it (keep their text and add to it) or **start over**.

2. **Ground it in the sheet.** Note what shapes the story:
   - race and subrace traits (e.g. a forest gnome's Speak with Small Beasts)
   - class and subclass or order, and where the power comes from
   - background skills and tools
   - alignment
   - signature spells and gear
   - anything in their notes

   Then ask the user, in plain text, for **table facts the sheet can't show**: how the character looks,
   memorable moments from play, and their role in the party. Faelan's were a red hat, buffing an ally with
   a finger touch where nothing visible happened, and a healer and buffer role. These facts matter most.

3. **Interview in rounds** with AskUserQuestion: up to 4 questions per round, usually 3 to 5 rounds,
   from broad to detailed. Base every option on the sheet and on earlier answers. Don't use generic
   fantasy filler. Pick from these topics in roughly this order, skipping any already answered:
   - homeland and upbringing, and who raised or travelled with them
   - where their power or skill comes from, and how it first appeared
   - what a signature item, look or habit means to them
   - why their style is the way it is (e.g. quiet, non-flashy magic)
   - age and stage of life (give the race's lifespan for scale)
   - the truth behind something they tell people, which is a good source of secrets
   - past companions, and how those partnerships ended
   - how their history shows in behaviour now: quirks, social habits, how they treat enemies
   - voice and speech, and how they would answer a common question in character
   - what they want deep down, and why they're with this party

   Each question must make sense on its own, since the user may only see the question dialog. Keep option
   labels short and put the detail in the description.

4. **Read the answers literally**, and adapt the next round:
   - **Free text beats options.** Users often answer in "Other" with their own idea. Build on it and ask
     follow-ups about it.
   - **Unknown terms.** If the user says they don't know a term (e.g. "fey"), explain it in two or three
     plain sentences before the next round, and connect it to their character.
   - **"Come up with what makes sense"** gives you licence to fill gaps. Do it, and say briefly what you
     invented.
   - **"The DM decides" or "explained in the campaign"**: don't invent it. Make it a DM thread.
   - **Match the requested tone.** "Keep it light" means comedy, not a hidden tragedy.
   - **Their character, their call.** Answers that cut drama ("truly nothing, he just wanders") are
     choices, not gaps to fill with a quest.

5. **Draft in the Lore shape** (`Lore` in `src/shared/types.ts`, validated by `asLore` in `server/validate.ts`):

   ```json
   {
     "sections": [{ "id": "who-they-are", "title": "Who they are", "body": "Paragraph.\n\nParagraph.\n\n- Label: bullet" }],
     "traits": { "personality": ["Label: rest"], "ideals": [], "bonds": [], "flaws": [] }
   }
   ```

   - **Sections:** 4 to 6 short chapters with kebab-case ids, ending with **Threads for the DM**, which
     holds open questions the DM can use.
   - **Length:** about **450 words** in total across sections and traits. The user found ~700 too long.
     Prefer one vivid detail to three.
   - **Formatting:** a blank line separates paragraphs. A block where every line starts with `- ` renders
     as a highlighted list.
   - **Lead-ins:** start **every bullet and every trait** with a 2 to 5 word lead-in followed by a colon,
     e.g. `Too trusting: will negotiate with things that want to eat him.`. The page sets the lead-in in
     bold so the list can be skimmed. Aim for 3 to 5 personality traits, 2 ideals, 2 bonds and 2 to 3 flaws.
   - **Pronouns:** use the ones the user gives. If they haven't said, use they/them, and never guess from
     the name.
   - **Story vs. rules:** keep game mechanics out of the story text. Show them through behaviour instead
     (the finger touch, not "casts Guidance").

6. **Show the draft in chat**, formatted for easy reading. Revise until the user is happy. Ask whether the
   length is right if it's near the limit.

7. **Save it.** Write the JSON to the session scratchpad, not the repo, and run
   `bun scripts/lore.ts write <id> <file>`. Add `--replace` only if the user agreed to replace existing
   lore. If they chose to extend, merge their existing sections and traits into the file first. Report the
   backup path from the output, and tell the user to reload the Lore page (Cmd/Ctrl+R) or open it from the
   sheet's **Lore** link.

## Don'ts

- Don't edit `src/data/faelan-lore.ts` for other characters. It's only the seed for a new database.
  The CLI is the way to save lore.
- Don't write lore into Notes. The Lore page is where it belongs.
- Don't run `write --replace` on lore the user has edited without saying so and getting their OK.
