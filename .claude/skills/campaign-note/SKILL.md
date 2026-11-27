---
name: campaign-note
description: Interview the user to create a campaign note (an NPC, place, piece of world lore, faction, item or quest), then save it to the journal so it shows in the character's campaign Notes. Use when asked to write, invent or flesh out an NPC, place, location, town, lore entry, legend, faction, magic item or quest for the journal, to "interview me about a place/NPC", or for "/campaign-note [kind] [name]".
---

# Campaign note interview

Builds one note *with* the user: read the campaign, ask questions in rounds, fill the gaps sensibly, draft
something short, and save it to the campaign's Notes. Every character in that campaign sees it.

**Ask before you write.** Don't draft the note until the user has answered at least two rounds of questions,
even if the request sounds like "just make up an innkeeper".

Character backstory and personality belong on the Lore page. Use `/character-lore` for those, not this skill.

## Tool: `bun scripts/note.ts`

The app's API is only reachable from inside the app, so this CLI writes the journal database directly,
using the same server code as the app's "new note" button. By default it uses the app's database.
`DND_DB=<path>` or `--db <path>` points it at another file. Output is JSON.

| Command | What it does |
|---|---|
| `list` | id, name, subtitle and campaign for every character |
| `kinds` | Every note kind with its fields: pick lists (`options`, only these values are accepted), `suggest` lists (any text) and `ref`s (the value names another note of that kind) |
| `show <id>` | The character (race, class, level, background, alignment), their campaign, and **every note in it** (kind, title, aliases, fields, start of the body) |
| `write <id> <file.json> [--force]` | Validates and saves a new note in the character's campaign, after backing up the database. Refuses if a note in the campaign already uses the title or an alias, unless `--force` is given |

It only creates notes. It never edits or deletes them, so the user's own edits in the app are safe.
It's safe to run while the app is open. Afterwards the user only needs to reload.

## Process

1. **Pick the character.** Run `list` and match the name or id the user gave. If there's only one
   character, use it. If it's ambiguous, ask. The note goes to that character's **campaign**.
   - If the character has no campaign, stop. Tell the user to add the character to a campaign in the app
     first, since notes belong to a campaign.

2. **Read the campaign.** Run `show <id>` and `kinds`. Note the places, NPCs, factions and lore already
   there. They are what the new note should connect to, and the names it must not duplicate.

3. **Pick the kind.** If the user didn't say, ask. Offer **NPC**, **Place**, **Lore**, **Faction**, **Item**
   and **Quest**. Leave out `note`, `session` and `player`: those are the user's own table logs.

4. **Ask for table facts first**, in plain text: what already happened at the table, what the DM said, and
   the name if there is one. The DM's facts beat anything you invent.

5. **Interview in rounds** with AskUserQuestion: up to 4 questions per round, usually 2 to 4 rounds, from
   broad to detailed. Base every option on the campaign's notes, the character and earlier answers. Don't use
   generic fantasy filler. Where a field has a pick list (`kinds`), offer exactly those values. Where it's a
   `ref`, offer the campaign's existing notes of that kind first. Pick from these topics, skipping any already
   answered:
   - **NPC:** role and where they're found; how the party met them; look, voice and one habit; what they
     want; attitude to the party (friendly / neutral / hostile / unknown); a secret or something they hide;
     faction; alive, dead or missing.
   - **Place:** type (city, town, village, dungeon, region, landmark, other) and what it lies within; first
     impression (one sight, one sound, one smell); who rules it or lives there; what it's known for; a danger
     or rumour; why the party goes there.
   - **Lore:** topic and era; who tells it and how widely it's known; the version people tell versus the
     truth (if the user knows it); what's left of it today; how it touches the party or the character.
   - **Faction:** goal; headquarters; leader and how you join; methods; the party's standing.
   - **Item:** type and rarity; what it looks like; where it came from; what it does, in story terms; who holds
     it now; a quirk or a cost.
   - **Quest:** who gave it and where; what's asked, and the reward; status; what's known so far; what could
     go wrong.

   Each question must make sense on its own, since the user may only see the question dialog. Keep option
   labels short and put the detail in the description.

6. **Read the answers literally**, and adapt the next round:
   - **Free text beats options.** Users often answer in "Other" with their own idea. Build on it and ask
     follow-ups about it.
   - **Unknown terms.** If the user says they don't know a term, explain it in two or three plain sentences
     before the next round.
   - **"Come up with what makes sense"** gives you licence to fill gaps. Do it, and say briefly what you
     invented.
   - **"The DM decides" or "we don't know yet"**: don't invent it. Put it under the open questions.
   - **Match the requested tone.** "Keep it light" means comedy, not a hidden tragedy.
   - **Pronouns:** use the ones the user gives. If they haven't said, use they/them, and never guess from the name.

7. **Draft the note** in this shape (validated by `createNote` in `server/routes/notes.ts`):

   ```json
   {
     "kind": "npc",
     "title": "Old Wren",
     "aliases": ["Wren"],
     "tags": ["ferry", "saltmarsh"],
     "fields": { "role": "Ferrywoman", "attitude": "friendly", "status": "alive", "location": "Saltmarsh" },
     "body": "Paragraph.\n\n- Wants: a quiet river.\n- Fears: the thing under it.\n\n## Open questions\n\n- Who pays her toll?"
   }
   ```

   - **Fields:** only the kind's keys from `kinds`, and pick-list fields only with their listed values.
     Leave out a field that's unknown, rather than guessing.
   - **Body:** markdown, about **150 to 300 words**. Short paragraphs; a block where every line starts with
     `- ` is a list. Start every bullet with a 2 to 5 word lead-in and a colon. End with `## Open questions`:
     hooks and the things the DM will decide.
   - **Links:** write `[[Exact Title]]` to link another note in the campaign. Plain mentions of existing
     titles and aliases link on their own, so use their exact names.
   - **Aliases:** other names people use (a nickname, the short form of a long name). **Tags:** a few lowercase words.
   - **Story vs. rules:** keep game numbers out unless the user asks for them (an item's mechanics, say).

8. **Show the draft in chat**, formatted for easy reading with the fields listed above the body. Revise until
   the user is happy.

9. **Save it.** Write the JSON to the session scratchpad, not the repo, and run
   `bun scripts/note.ts write <id> <file>`. If it reports a name clash, ask whether to rename the note or add
   it anyway (`--force`). Report the backup path from the output, and tell the user to reload the app
   (Cmd/Ctrl+R) and look under the kind's tab in Notes.

## Don'ts

- Don't put a character's own backstory or traits here. That's the Lore page (`/character-lore`).
- Don't pass `--force` without the user's OK.
- Don't invent facts the user said the DM decides.
- Don't edit existing notes through the database. Suggest changes in chat, and the user can make them in the app.
