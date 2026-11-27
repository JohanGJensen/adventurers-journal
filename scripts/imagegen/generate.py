# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = [
#   "torch>=2.7",
#   "diffusers>=0.37",
#   "transformers>=4.57",
#   "accelerate>=1.10",
#   "bitsandbytes>=0.46",
#   "huggingface_hub>=0.34",
#   "safetensors",
#   "pillow",
#   "psutil",
# ]
# ///
"""Local FLUX.2 image generation for the /campaign-image skill.

    uv run scripts/imagegen/generate.py doctor [--json]
    uv run scripts/imagegen/generate.py fetch klein|dev
    uv run scripts/imagegen/generate.py generate <job.json>

A job file is JSON:

    {
      "prompt": "A weathered half-orc innkeeper ...",   required, without the style preamble
      "model": "klein",                                  klein (default) | dev
      "kind": "npc",                                     picks the default size from style.json
      "width": 1024, "height": 1024,                     override the kind's size (rounded to /16)
      "draft": false,                                    true scales the size by style.json draftScale
      "seed": 1234,                                      random when left out, always recorded
      "steps": 4, "guidance": 1.0,                       defaults per model from style.json
      "style": true,                                     false skips the style preamble
      "output": "/abs/path/file.png",                    or give campaign + title to build the path:
      "campaign": "adventure time", "title": "Brannoc"
    }

It writes the PNG and a sidecar <same name>.json with everything needed to render it again.
It never touches the journal database.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STYLE = json.loads((HERE / "style.json").read_text())
OUT_ROOT = Path.home() / "Pictures" / "Adventurers Journal"

MODELS = {
    "klein": {
        "repo": "black-forest-labs/FLUX.2-klein-4B",
        "pipeline": "Flux2KleinPipeline",
        # Skip the single-file ComfyUI checkpoint and the sample images.
        "allow": ["model_index.json", "scheduler/*", "text_encoder/*", "tokenizer/*", "transformer/*", "vae/*"],
        "gated": False,
        "licence": "Apache-2.0",
        "size_gb": 16,
    },
    "dev": {
        "repo": "diffusers/FLUX.2-dev-bnb-4bit",
        "pipeline": "Flux2Pipeline",
        "allow": None,
        "gated": False,
        "licence": "FLUX.2 [dev] non-commercial",
        "size_gb": 34,
    },
}


def log(*args):
    print(*args, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- device


def pick_device():
    """The one place that decides where we run. MPS is a later addition for the Mac."""
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# ---------------------------------------------------------------- jobs


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:48] or "image"


def round16(n: float) -> int:
    return max(256, int(round(n / 16)) * 16)


def resolve_job(job: dict) -> dict:
    if not job.get("prompt", "").strip():
        raise SystemExit("job: 'prompt' is required")
    model = job.get("model", "klein")
    if model not in MODELS:
        raise SystemExit(f"job: unknown model {model!r} (use {', '.join(MODELS)})")
    kind = job.get("kind", "npc")
    shape = STYLE["kinds"].get(kind, "square")
    w, h = STYLE["sizes"][shape]
    w, h = job.get("width", w), job.get("height", h)
    if job.get("draft"):
        w, h = w * STYLE["draftScale"], h * STYLE["draftScale"]
    w, h = round16(w), round16(h)

    defaults = STYLE["models"][model]
    seed = job.get("seed")
    if seed is None:
        seed = random.randrange(2**31)

    use_style = job.get("style", True)
    full_prompt = f"{STYLE['preamble']} {job['prompt'].strip()}" if use_style else job["prompt"].strip()

    out = job.get("output")
    if out:
        out = Path(out).expanduser()
    else:
        campaign = job.get("campaign") or "Unsorted"
        title = job.get("title") or job["prompt"][:40]
        suffix = "-draft" if job.get("draft") else ""
        out = OUT_ROOT / campaign / f"{kind}-{slugify(title)}-{seed}{suffix}.png"
    if out.suffix.lower() != ".png":
        out = out.with_suffix(".png")

    return {
        "prompt": job["prompt"].strip(),
        "fullPrompt": full_prompt,
        "style": use_style,
        "model": model,
        "kind": kind,
        "width": w,
        "height": h,
        "draft": bool(job.get("draft")),
        "seed": int(seed),
        "steps": int(job.get("steps", defaults["steps"])),
        "guidance": float(job.get("guidance", defaults["guidance"])),
        "output": str(out),
        "campaign": job.get("campaign"),
        "title": job.get("title"),
    }


# ---------------------------------------------------------------- pipelines


def fp8_storage(module, compute_dtype):
    """Keep weights in FP8 and upcast each layer to bf16 when it runs: halves VRAM, Ampere-safe."""
    import torch
    from diffusers.hooks import apply_layerwise_casting

    apply_layerwise_casting(
        module,
        storage_dtype=torch.float8_e4m3fn,
        compute_dtype=compute_dtype,
        skip_modules_pattern=("norm", "embed", "pos_embed", "proj_in", "proj_out", "lm_head"),
    )


def load_pipeline(model: str, device: str):
    import torch
    import diffusers

    spec = MODELS[model]
    cls = getattr(diffusers, spec["pipeline"], None)
    if cls is None:
        raise SystemExit(f"diffusers {diffusers.__version__} has no {spec['pipeline']}; upgrade diffusers")
    dtype = torch.bfloat16 if device != "cpu" else torch.float32
    pipe = cls.from_pretrained(spec["repo"], torch_dtype=dtype)

    if device == "cuda":
        vram = torch.cuda.get_device_properties(0).total_memory / 2**30
        if model == "klein" and vram < 20:
            # 4B transformer + 4B text encoder are ~8 GB each in bf16: store both in FP8 and
            # only keep the component that is running on the GPU.
            fp8_storage(pipe.transformer, dtype)
            fp8_storage(pipe.text_encoder, dtype)
            pipe.enable_model_cpu_offload()
        elif model == "dev":
            pipe.enable_model_cpu_offload()
        else:
            pipe.to(device)
        if hasattr(pipe.vae, "enable_tiling"):
            pipe.vae.enable_tiling()
    elif device == "mps":
        pipe.to(device)
    return pipe


def render(job: dict) -> dict:
    import torch

    device = pick_device()
    if device == "cpu":
        raise SystemExit("no GPU found (CUDA or MPS); refusing to render on the CPU")
    t0 = time.time()
    pipe = load_pipeline(job["model"], device)
    t_load = time.time() - t0
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()

    gen = torch.Generator(device="cpu").manual_seed(job["seed"])
    t1 = time.time()
    image = pipe(
        prompt=job["fullPrompt"],
        width=job["width"],
        height=job["height"],
        num_inference_steps=job["steps"],
        guidance_scale=job["guidance"],
        generator=gen,
    ).images[0]
    t_render = time.time() - t1

    out = Path(job["output"])
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out)
    import diffusers

    meta = {
        **job,
        "repo": MODELS[job["model"]]["repo"],
        "licence": MODELS[job["model"]]["licence"],
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if device == "cuda" else device,
        "peakVramGb": round(torch.cuda.max_memory_allocated() / 2**30, 2) if device == "cuda" else None,
        "loadSeconds": round(t_load, 1),
        "renderSeconds": round(t_render, 1),
        "diffusers": diffusers.__version__,
        "torch": torch.__version__,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    out.with_suffix(".json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


# ---------------------------------------------------------------- doctor / fetch


def cached(model: str) -> bool:
    from huggingface_hub import snapshot_download

    spec = MODELS[model]
    try:
        path = snapshot_download(spec["repo"], allow_patterns=spec["allow"], local_files_only=True)
    except Exception:
        return False
    return (Path(path) / "model_index.json").exists() and any(Path(path, "transformer").glob("*.safetensors"))


def doctor() -> dict:
    import psutil

    checks = {}
    checks["python"] = {"ok": True, "detail": sys.version.split()[0]}
    checks["uv"] = {"ok": bool(shutil.which("uv")), "detail": shutil.which("uv") or "install uv"}
    try:
        import torch

        dev = pick_device()
        detail = dev
        if dev == "cuda":
            p = torch.cuda.get_device_properties(0)
            detail = f"cuda: {p.name}, {p.total_memory / 2**30:.1f} GB VRAM, torch {torch.__version__}"
        checks["gpu"] = {"ok": dev != "cpu", "detail": detail}
    except Exception as e:  # noqa: BLE001
        checks["gpu"] = {"ok": False, "detail": f"torch failed: {e}"}
    try:
        import diffusers

        missing = [m for m, s in MODELS.items() if not hasattr(diffusers, s["pipeline"])]
        checks["diffusers"] = {
            "ok": not missing,
            "detail": diffusers.__version__ + (f" (missing {missing})" if missing else ""),
        }
    except Exception as e:  # noqa: BLE001
        checks["diffusers"] = {"ok": False, "detail": str(e)}
    mem = psutil.virtual_memory()
    checks["ram"] = {"ok": mem.total / 2**30 >= 24, "detail": f"{mem.total / 2**30:.0f} GB total"}
    hf_home = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
    hf_home.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(hf_home).free / 2**30
    checks["disk"] = {"ok": free >= 40, "detail": f"{free:.0f} GB free at {hf_home}"}

    models = {}
    for m, spec in MODELS.items():
        models[m] = {"repo": spec["repo"], "downloaded": cached(m), "licence": spec["licence"], "sizeGb": spec["size_gb"]}
    ready = all(c["ok"] for c in checks.values()) and models["klein"]["downloaded"]
    return {"ready": ready, "checks": checks, "models": models, "outputRoot": str(OUT_ROOT)}


def fetch(model: str):
    from huggingface_hub import snapshot_download

    spec = MODELS[model]
    log(f"downloading {spec['repo']} (~{spec['size_gb']} GB, {spec['licence']}) ...")
    path = snapshot_download(spec["repo"], allow_patterns=spec["allow"])
    log(f"done: {path}")


# ---------------------------------------------------------------- cli


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("doctor")
    d.add_argument("--json", action="store_true")
    f = sub.add_parser("fetch")
    f.add_argument("model", choices=list(MODELS))
    g = sub.add_parser("generate")
    g.add_argument("job")
    g.add_argument("--dry-run", action="store_true", help="print the resolved job and stop")
    args = ap.parse_args()

    if args.cmd == "doctor":
        r = doctor()
        if args.json:
            print(json.dumps(r, indent=2))
        else:
            for name, c in r["checks"].items():
                print(f"{'ok ' if c['ok'] else 'NO '} {name:10} {c['detail']}")
            for name, m in r["models"].items():
                print(f"{'ok ' if m['downloaded'] else '-- '} {name:10} {m['repo']} ({m['licence']})"
                      + ("" if m["downloaded"] else f"  -> fetch {name}, ~{m['sizeGb']} GB"))
            print("ready" if r["ready"] else "not ready")
        sys.exit(0 if r["ready"] else 1)
    elif args.cmd == "fetch":
        fetch(args.model)
    elif args.cmd == "generate":
        job = resolve_job(json.loads(Path(args.job).read_text()))
        if args.dry_run:
            print(json.dumps(job, indent=2))
            return
        print(json.dumps(render(job), indent=2))


if __name__ == "__main__":
    main()
