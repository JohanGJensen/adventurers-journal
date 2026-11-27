# Plan: campaign images with FLUX.2, generated locally

A Claude Code skill, `/campaign-image`, that generates somewhat realistic pictures for a campaign (NPCs, places,
items, lore scenes) on this machine with FLUX.2. You then attach them to notes or portraits in the app yourself.

## Decisions

| Topic | Decision |
|---|---|
| Where it runs | Locally on the Linux desktop first (NVIDIA RTX 3070, 8 GB VRAM, 31 GB RAM, CUDA). An MPS backend for the Mac can be added later behind the same job file. No hosted API, no cost per image. |
| Model | Configurable. **FLUX.2 [klein] 4B** by default, for drafts and finals. **FLUX.2 [dev]** is an opt-in "hero" mode, kept only if the spike shows it runs acceptably on 8 GB. |
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
   `fetch`; for [dev] also `hf auth login` and accepting its licence).
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
7. **Draft with klein** at a small size (fast). Show the result by reading the PNG.
8. **Iterate:** new seed, tweak the prompt, then render the approved prompt and seed at full size with klein.
   Offer a [dev] hero render only when `doctor` says [dev] is available.
9. **Hand over:** the file path, and how to attach it (open the note → Edit → image, or the portrait upload on the
   sheet).

Output folder: `~/Pictures/Adventurers Journal/<campaign>/`, outside the repo, so images survive reinstalls and
never get committed.

## Model and runtime (the risky part)

The target is an RTX 3070 with **8 GB of VRAM** (Ampere, so no native FP8 maths) and 31 GB of system RAM.

**FLUX.2 [klein] 4B** (`black-forest-labs/FLUX.2-klein-4B`, diffusers `Flux2KleinPipeline`) is a 4B transformer
plus a Qwen3-4B text encoder, about 8 GB each in bf16. Neither fits next to the other in 8 GB, and the transformer
alone barely fits, so the generator has to shrink or move them:

- the text encoder runs once per prompt, so it can sit in system RAM or be offloaded with
  `enable_model_cpu_offload`;
- the transformer can be stored in FP8 (`enable_layerwise_casting`, computing in bf16) or quantized to 4-bit.

It is distilled for few steps, so it is the draft *and* default final model.

**FLUX.2 [dev]** is a 32B model with a 24B Mistral text encoder. On 8 GB it only runs as a GGUF Q4 transformer with
heavy CPU offload, which is likely many minutes per image if it works at all. It stays optional.

The backend is decided by a spike (phase 0), trying these in order:

1. **diffusers on CUDA** with offload and FP8/4-bit storage: the least moving parts, all in one Python script.
2. **Headless ComfyUI** driven over its local HTTP API: the widest FLUX.2 and GGUF support, but a second app to install
   and run.

(An MLX port such as mflux only matters for the Mac and is left for a later MPS backend.)

To pass, klein must render 1024×1024 in under about 1 minute. [dev] is kept only if it renders 1024×1024 in under
about 10 minutes without heavy swapping. `generate.py` keeps the same job-file interface whichever backend wins.

**Licence:** FLUX.2 [klein] **4B** is Apache-2.0 and not gated, so it needs no Hugging Face login. (The 9B klein is
non-commercial; we use 4B.) FLUX.2 [dev] is under a **non-commercial** licence and gated: it needs a Hugging Face
account with its licence accepted. That's fine for personal campaign art; don't sell [dev] images.

**Disk:** klein is about 16 GB in `~/.cache/huggingface`; [dev] as GGUF adds roughly 20 to 35 GB. `doctor` warns if
there isn't enough free space.

## Phases

| Phase | What | Done when |
|---|---|---|
| 0. Spike | Try the backends above with [dev] and klein. Record time per image, peak memory and quality. | One backend passes; the results are written into this plan. |
| 1. Generator | `generate.py` with `generate`, `doctor` and `fetch`, plus `style.json`. | A klein 512×512, 4-step smoke render works from a job file and writes the sidecar. |
| 2. Skill | `.claude/skills/campaign-image/SKILL.md`. | Run end to end on a real campaign: interview → klein draft → klein final → imported in the app by hand. |
| 3. Later (optional) | Offer `/campaign-image` as a last step of `/campaign-note`. Add an `--attach <noteId>` that sets the note's image through the server's note code, if importing by hand gets tedious. | — |

## Open questions and risks

- **[dev] on 8 GB VRAM.** Probably too slow; the spike decides whether the hero mode exists at all.
- **Mac support.** Add an MPS device path (and maybe mflux) when it's needed; the job file stays the same.
- **Backend choice:** decided by the spike.
- **Consistency:** keeping one NPC recognisable across several images. FLUX.2 supports reference images, which could
  be a later phase.
- **Disk use** of the weights, and whether to keep both models downloaded.
