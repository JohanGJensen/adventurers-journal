# Plan: campaign images with FLUX.2, generated locally

A Claude Code skill, `/campaign-image`, that generates somewhat realistic pictures for a campaign (NPCs, places,
items, lore scenes) on this machine with FLUX.2. You then attach them to notes or portraits in the app yourself.

## Decisions

| Topic | Decision |
|---|---|
| Where it runs | Locally on the Mac (Apple Silicon, 36 GB). No hosted API, no cost per image. |
| Model | Configurable. **FLUX.2 [dev]** by default for final images, **FLUX.2 [klein]** as a fast draft mode. |
| Output | Image files on disk. The skill never writes to the journal database. You import images by hand. |
| Style | Painterly realism: realistic light and anatomy with an oil-painting finish, to match the tome look and the painted medallions. |

## Goals and non-goals

**Goals**

- Make consistent, campaign-specific art from what the journal already knows about an NPC, place or item.
- Keep it free and offline once the model is downloaded.
- Make any image reproducible: same prompt, seed and model give the same picture.

**Non-goals**

- No image generation inside the Electron app, and no new app dependencies. The Python runtime and model weights
  stay outside the app build.
- No writes to the database (for now; see phase 3).
- No hosted fallback.

## How it fits the repo

Reuse what's there:

- **Campaign context:** `bun scripts/note.ts list` and `show <id>` (`scripts/note.ts`) already return the character,
  their campaign and every note in it. That's the same grounding `/campaign-note` uses
  (`.claude/skills/campaign-note/SKILL.md`). The image skill only reads.
- **Importing:** note images and portraits already go through `src/lib/portrait.ts`, which scales an image file to a
  small WebP/JPEG data URL, and `asPortrait` in `server/validate.ts` (max 1.5 MB; PNG, JPEG, WebP or GIF). So
  generating 1024 px PNGs is fine, because the app shrinks them on import.
- **Framing:** portraits are square-cropped in `PortraitCropper`, while places, items and maps keep their shape.
  Default aspect ratios:
  - 1:1 for NPCs, players and items
  - 3:2 landscape for places and lore scenes

## Architecture

```
/campaign-image (SKILL.md)
   │  reads campaign ──► bun scripts/note.ts show <id>
   │  writes job.json ─► scratchpad
   ▼
uv run scripts/imagegen/generate.py job.json
   │  FLUX.2 [dev] or [klein], local weights
   ▼
~/Pictures/Adventurers Journal/<campaign>/<kind>-<slug>-<seed>.png  (+ .json with prompt, seed, model)
```

### `scripts/imagegen/generate.py`

- A self-contained `uv run` script with its dependencies inline (PEP 723), so there's no shared virtualenv and
  nothing in `package.json`.
- **Input:** a JSON job file with prompt, width, height, seed, steps, guidance, model (`dev` | `klein`) and output path.
- **Output:** the image plus a sidecar `.json` with the exact prompt, seed, model, steps and timing, so you can
  re-render or vary any image.
- Subcommands:
  - `generate <job.json>`
  - `doctor`: checks `uv`, Hugging Face login and licence acceptance, free disk, RAM and whether the weights are
    downloaded.
  - `fetch <model>`: downloads the weights before the first run.

### `scripts/imagegen/style.json`

The style preamble lives in one place so every image in a campaign looks alike. A campaign can override it later.
Draft preamble:

> Painterly realism, oil on canvas, realistic anatomy and natural lighting, muted earthy palette, fine brushwork,
> high-fantasy setting. No text, letters, watermarks or frames.

FLUX.2 has no negative prompt, so the preamble states exclusions as plain statements ("no text").

### `.claude/skills/campaign-image/SKILL.md`

1. **Check the runtime:** run `generate.py doctor`. If it isn't ready, stop and show the fix (install `uv`,
   `hf auth login`, accept the licence, `fetch`).
2. **Pick the character** with `note.ts list`. The images belong to that character's campaign.
3. **Read the campaign** with `note.ts show <id>`.
4. **Interview briefly** with AskUserQuestion, 1 or 2 rounds:
   - What to picture: an existing note (offer the campaign's NPCs, places and items) or something new.
   - Framing: head-and-shoulders, full figure, establishing shot or close-up of an object.
   - Mood and time of day.
   - Details the note doesn't cover (clothing, weather, something in the scene).
5. **Build the prompt** from the style preamble, the note's fields (role, race, attitude, location…) and body, and
   the answers. Keep game numbers and rules out. Use they/them unless the note gives pronouns.
6. **Show the prompt** and settings for approval.
7. **Draft with klein** (fast). Show the result by reading the PNG.
8. **Iterate:** new seed, tweak the prompt, or render the approved prompt with [dev] for the final.
9. **Hand over:** the file path, and how to attach it (open the note → Edit → image, or the portrait upload on the
   sheet).

Output folder: `~/Pictures/Adventurers Journal/<campaign>/`, outside the repo, so images survive reinstalls and
never get committed.

## Model and runtime (the risky part)

FLUX.2 [dev] is a 32B model with a large Mistral text encoder. In bf16 it needs far more than 36 GB, so on this Mac it
only runs with quantized weights (for example a GGUF Q4/Q5 transformer and a 4-bit text encoder), and it will take
**minutes per image** on Apple's GPU (MPS). FLUX.2 [klein] is much smaller and faster, which makes it the draft model.

The backend is decided by a spike (phase 0), trying these in order:

1. **diffusers on MPS** with a GGUF-quantized transformer: the least moving parts, all in one Python script.
2. **Headless ComfyUI** driven over its local HTTP API: the widest FLUX.2 and GGUF support, but a second app to install
   and run.
3. **An MLX port (for example mflux)** if it supports FLUX.2: likely the fastest on Apple Silicon.

To pass, a backend must render a 1024×1024 [dev] image in under about 10 minutes without heavy swapping, and render
klein in under about 1 minute. `generate.py` keeps the same job-file interface whichever backend wins.

**Licence:** FLUX.2 [dev] weights are open but under a **non-commercial** licence. That's fine for personal campaign
art; don't sell the images or use them commercially. The 4B FLUX.2 [klein] is Apache-2.0; check the licence of
whichever klein size we use. Both need a Hugging Face account. [dev] needs its licence accepted on the model page.

**Disk:** expect roughly 20 to 35 GB of weights in `~/.cache/huggingface` (or ComfyUI's `models/`). `doctor` warns if
there isn't enough free space.

## Phases

| Phase | What | Done when |
|---|---|---|
| 0. Spike | Try the backends above with [dev] and klein. Record time per image, peak memory and quality. | One backend passes; the results are written into this plan. |
| 1. Generator | `generate.py` with `generate`, `doctor` and `fetch`, plus `style.json`. | A klein 512×512, 4-step smoke render works from a job file and writes the sidecar. |
| 2. Skill | `.claude/skills/campaign-image/SKILL.md`. | Run end to end on a real campaign: interview → klein draft → [dev] final → imported in the app by hand. |
| 3. Later (optional) | Offer `/campaign-image` as a last step of `/campaign-note`. Add an `--attach <noteId>` that sets the note's image through the server's note code, if importing by hand gets tedious. | — |

## Open questions and risks

- **Speed and memory of [dev] on 36 GB.** If it's too slow or swaps, make klein (the larger variant) the default and
  keep [dev] for occasional hero images.
- **Backend choice:** decided by the spike.
- **Consistency:** keeping one NPC recognisable across several images. FLUX.2 supports reference images, which could
  be a later phase.
- **Disk use** of the weights, and whether to keep both models downloaded.
