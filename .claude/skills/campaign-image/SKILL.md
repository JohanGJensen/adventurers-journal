---
name: campaign-image
description: Generate a painterly picture for a campaign (an NPC, player, place, item or lore scene) locally with FLUX.2, grounded in the journal's campaign notes, and save it as a PNG for the user to attach in the app. Use when asked to draw, paint, picture, illustrate or "make an image/portrait/art" of an NPC, place, item or scene, or for "/campaign-image [note or subject]".
---

# Campaign image

Paints one picture *with* the user: read the campaign, ask a short interview, build a prompt, draft fast,
iterate, then render the final. Runs locally on this machine's GPU. Nothing is sent to a hosted service.

**This skill never writes to the journal database.** It leaves a PNG on disk and the user attaches it in the app.

## Tools

### `uv run scripts/imagegen/generate.py`

A self-contained `uv run` script (its Python dependencies are inline). Run it from the repo root.

| Command | What it does |
|---|---|
| `doctor [--json]` | Checks uv, GPU, diffusers, RAM, disk and which models are downloaded. Exit 0 means ready |
| `fetch klein` / `fetch dev` | Downloads the weights into `~/.cache/huggingface` (klein ≈ 16 GB) |
| `generate <job.json> [--dry-run]` | Renders a job; prints the sidecar JSON (seed, size, `seconds`, output path). `--dry-run` prints the resolved job, including the full prompt |

Job file (write it to the session scratchpad, never the repo):

```json
{
  "prompt": "Head-and-shoulders portrait of Old Wren, a weathered ferrywoman ...",
  "kind": "npc",
  "draft": true,
  "seed": 1234,
  "campaign": "adventure time",
  "title": "Old Wren"
}
```

- `prompt`: the subject only. The style preamble in `scripts/imagegen/style.json` is added for you.
- `kind` picks the size: `npc`, `player`, `item`, `faction` are 1:1 (1024²); `place`, `lore`, `quest` are 3:2
  (1216×816). Override with `width`/`height` (rounded to multiples of 16).
- `draft: true` renders at half size for speed. Leave it out for the final.
- `model`: `klein` (default). `dev` only if `doctor` shows it downloaded and the user asks for a hero render.
- `seed`: leave it out for a random one. Reuse the draft's seed for the final: it keeps the same subject,
  palette and layout, but details change with the size (pose, feet, small props). Check the final too.
- Output: `~/Pictures/Adventurers Journal/<campaign>/<kind>-<title>-<seed>[-draft].png`, plus a `.json`
  sidecar next to it. `output` sets an exact path instead.

### `bun scripts/note.ts`

Read-only here: `list` (characters and their campaigns) and `show <id>` (the character and every note in
their campaign). See `/campaign-note` for the rest. Don't use `write` from this skill.

## Process

1. **Check the runtime.** Run `generate.py doctor`. If it isn't ready, stop and show the fix:
   - `uv` missing: `sudo dnf install uv` (Fedora) or `curl -LsSf https://astral.sh/uv/install.sh | sh`.
   - klein not downloaded: ask before running `fetch klein` (about 16 GB). Run it in the background.
   - GPU missing: say so. Don't render on the CPU.

2. **Pick the character** with `note.ts list`, matching the name or id the user gave. If there's only one
   character with a campaign, use it. The image belongs to that character's campaign; without a campaign, use
   `"campaign": "Unsorted"`.

3. **Read the campaign** with `note.ts show <id>`. Find the note the user means, if any.

4. **Interview briefly** with AskUserQuestion: 1 or 2 rounds, up to 4 questions each. Every option should
   come from the campaign's notes and earlier answers, and each question must make sense on its own.
   - **Subject:** an existing note (offer the campaign's NPCs, places and items) or something new.
   - **Framing:** head-and-shoulders, full figure, establishing shot, interior, or close-up of an object.
   - **Mood and light:** time of day, weather, season.
   - **Details the note doesn't cover:** clothing, colours, what's in their hands, what's in the scene.
   Skip what the note or the user already answered. "Make it up" gives licence; say what you chose.

5. **Build the prompt** in plain descriptive English, 40 to 90 words:
   - Start with the framing and subject ("Head-and-shoulders portrait of a ..."), then appearance, clothing,
     setting, light and mood.
   - Use the note's fields (role, race, location, attitude…) and body as facts. Describe looks, not names:
     the model doesn't know who "Old Wren" is.
   - Leave out game numbers, rules and stat blocks.
   - FLUX.2 has no negative prompt: state exclusions plainly ("no text"), or leave them to the preamble.
   - Pronouns: the note's or the user's. Otherwise they/them; never guess from a name.
   - **Spell out the pose and keep limbs visible.** "Seated regally" under a long coat and a cloak over the
     lap gave a leg that vanished into the drapery. This worked: "sits upright, both knees bent at right
     angles and both booted feet planted flat on the ground", a coat ending above the knees, fitted trousers
     and boots, and the cloak falling behind the throne. Avoid "long-limbed", which stretches limbs.
   - **Spell out body and clothing.** klein drifts towards a default look: "androgynous" alone gave nine
     feminine drafts with open necklines. Concrete wording worked: "angular jaw", "lean, narrow-shouldered
     build with a completely flat chest", "coat buttoned closed all the way up to a high stiff collar".

6. **Show the prompt** and the settings (kind, size, model) and ask for approval or changes.

7. **Draft:** render 3 drafts at once (`"draft": true`, no `seed`, one job file each). klein takes about
   10 to 15 seconds per image on this machine, most of it loading.
   - **The user can't see images you Read.** Paste the drafts side by side, each labelled with a number and
     its seed, into one contact sheet in the scratchpad (Pillow via `uv run --with pillow`). Open it for them
     with `xdg-open` (`open` on macOS). Also Read it yourself, so you can comment on it.
   - Number drafts across rounds (4, 5, 6 for the second round…) so the user can refer back to them.
   - **Check the corners.** Painterly images sometimes get a fake artist's signature in a bottom corner, in
     roughly 1 out of 4 seeds. Point it out and prefer a clean seed.
   - Also check hands, extra limbs and anything the user asked for that's missing.

8. **Iterate** until the user is happy: a new seed (drop `seed`) for a different take, or a tweaked prompt
   with the same seed for a small change.

9. **Final:** render the approved prompt and seed without `draft`. If the user wants a [dev] hero render
   and `doctor` lists it as downloaded:
   - Say it takes about 7 minutes and uses about 20 GB of RAM, so other heavy apps should be closed.
   - Run it in the background with `run_in_background`, and wait for the notification.
   - [dev] is a different model, so the same seed gives a different picture from the klein draft. Treat it
     as another take, not an upscale.
   - If it exits with "blank image twice", offer another seed or the klein final.

10. **Hand over:** give the PNG's full path and how to attach it:
    - a note: open it in Notes → Edit → image;
    - a portrait: the portrait upload on the character sheet (it's square-cropped there).
    The app shrinks the image on import, so the full-size PNG is fine.

## Don'ts

- Don't write to the database or edit notes.
- Don't save images or job files in the repo.
- Don't put real people's names or likenesses, or other artists' names, in the prompt.
- Don't run `fetch` without the user's OK: it downloads many gigabytes.
- [dev] images are under a non-commercial licence. Mention it if the user talks about selling or publishing them.
