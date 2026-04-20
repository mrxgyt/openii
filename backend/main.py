"""
AI Image Generation API — FastAPI + Hugging Face Diffusers

This server is designed for single-container deployment on Google Cloud Run with GPU.
It serves both the REST API and the static React frontend built by Vite.

Model directory structure (GCS FUSE mount in production):
    /app/models/
    ├── checkpoints/    - Base model checkpoints (.safetensors, .ckpt)
    └── loras/          - LoRA adapter weights (.safetensors, .pt)
"""

from __future__ import annotations

import base64
import gc
import io
import json
import logging
import os
import random
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Literal

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
CHECKPOINTS_DIR = MODELS_DIR / "checkpoints"
LORAS_DIR = MODELS_DIR / "loras"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(MODELS_DIR / "data")))
GALLERY_FILE = DATA_DIR / "gallery.json"
STATIC_DIR = Path(__file__).parent / "static"

VALID_EXTENSIONS = {".safetensors", ".ckpt", ".pt", ".bin"}
MAX_GALLERY = 100

# ---------------------------------------------------------------------------
# Gallery persistence
# ---------------------------------------------------------------------------

def load_gallery() -> list[dict[str, Any]]:
    """Загружает галерею из файла на диске."""
    try:
        if GALLERY_FILE.exists():
            with open(GALLERY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                log.info("Loaded %d gallery items from %s", len(data), GALLERY_FILE)
                return data
    except Exception as e:
        log.warning("Could not load gallery from disk: %s", e)
    return []


def save_gallery(items: list[dict[str, Any]]) -> None:
    """Сохраняет галерею на диск."""
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(GALLERY_FILE, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False)
    except Exception as e:
        log.warning("Could not save gallery to disk: %s", e)


# ---------------------------------------------------------------------------
# Async job system
# ---------------------------------------------------------------------------

_executor = ThreadPoolExecutor(max_workers=1)  # одна генерация за раз

class GenerationJob:
    def __init__(self, job_id: str, request_data: dict[str, Any]) -> None:
        self.id = job_id
        self.request_data = request_data
        self.status: Literal["running", "completed", "failed"] = "running"
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.completed_at: str | None = None
        self._start_ts: float = time.time()  # для расчёта времени

# jobs хранятся в памяти (достаточно — при перезагрузке страницы polling продолжается)
_jobs: dict[str, GenerationJob] = {}

def _run_generation_job(job_id: str, request: "GenerateRequest") -> None:
    """Запускается в фоновом потоке."""
    job = _jobs.get(job_id)
    if not job:
        return
    try:
        png_bytes, seed_used = run_inference(request)
        generation_time_ms = round((time.time() - job._start_ts) * 1000, 1)
        image_b64 = f"data:image/png;base64,{base64.b64encode(png_bytes).decode()}"

        item_id = str(uuid.uuid4())
        item: dict[str, Any] = {
            "id": item_id,
            "image_base64": image_b64,
            "prompt": request.prompt,
            "model_name": request.model_name,
            "seed_used": seed_used,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "settings": {
                "negative_prompt": request.negative_prompt,
                "width": request.width,
                "height": request.height,
                "steps": request.steps,
                "cfg_scale": request.cfg_scale,
                "sampler": request.sampler,
                "loras": [lora.model_dump() for lora in (request.loras or [])],
            },
        }
        gallery.insert(0, item)
        if len(gallery) > MAX_GALLERY:
            gallery.pop()
        save_gallery(gallery)

        job.status = "completed"
        job.result = {
            "success": True,
            "image_base64": image_b64,
            "seed_used": seed_used,
            "generation_time_ms": generation_time_ms,
            "model_name": request.model_name,
            "prompt": request.prompt,
            "id": item_id,
        }
        log.info("Job %s completed in %.1f ms", job_id, generation_time_ms)
    except Exception as e:
        log.exception("Job %s failed", job_id)
        job.status = "failed"
        job.error = str(e)
    finally:
        job.completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

gallery: list[dict[str, Any]] = load_gallery()

# Lazy-loaded pipeline cache  {model_name: pipeline}
_pipeline_cache: dict[str, Any] = {}
_active_model: str | None = None


def get_gpu_info() -> tuple[bool, str | None]:
    try:
        if torch.cuda.is_available():
            return True, torch.version.cuda
    except Exception:
        pass
    return False, None


def ensure_dirs() -> None:
    for d in [MODELS_DIR, CHECKPOINTS_DIR, LORAS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def scan_dir(directory: Path, model_type: str) -> list[dict[str, Any]]:
    ensure_dirs()
    results: list[dict[str, Any]] = []
    if not directory.exists():
        return results
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() in VALID_EXTENSIONS:
            size_mb: float | None = None
            try:
                size_mb = round(path.stat().st_size / (1024 * 1024), 1)
            except OSError:
                pass
            results.append(
                {
                    "name": path.stem,
                    "filename": path.name,
                    "type": model_type,
                    "size_mb": size_mb,
                }
            )
    return results


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class LoraConfig(BaseModel):
    name: str
    weight: float = 1.0


class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str | None = None
    model_name: str
    width: int = Field(512, ge=64, le=2048, multiple_of=8)
    height: int = Field(512, ge=64, le=2048, multiple_of=8)
    steps: int = Field(20, ge=1, le=150)
    cfg_scale: float = Field(7.5, ge=1.0, le=30.0)
    seed: int | None = None
    sampler: str = "DPM++ 2M Karras"
    loras: list[LoraConfig] | None = None


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

SAMPLER_MAP = {
    "DPM++ 2M Karras": ("DPMSolverMultistepScheduler", {"use_karras_sigmas": True}),
    "DPM++ SDE Karras": ("DPMSolverSDEScheduler", {"use_karras_sigmas": True}),
    "DPM++ 2M SDE Karras": ("DPMSolverMultistepScheduler", {"algorithm_type": "sde-dpmsolver++", "use_karras_sigmas": True}),
    "Euler a": ("EulerAncestralDiscreteScheduler", {}),
    "Euler": ("EulerDiscreteScheduler", {}),
    "DDIM": ("DDIMScheduler", {}),
    "PLMS": ("PNDMScheduler", {}),
    "UniPC": ("UniPCMultistepScheduler", {}),
    "Heun": ("HeunDiscreteScheduler", {}),
    "LMS Karras": ("LMSDiscreteScheduler", {"use_karras_sigmas": True}),
}


def load_pipeline(model_name: str, sampler: str = "DPM++ 2M Karras") -> Any:
    """Load or retrieve a cached Stable Diffusion pipeline."""
    global _active_model, _pipeline_cache

    if model_name in _pipeline_cache:
        pipe = _pipeline_cache[model_name]
    else:
        from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline

        model_path = CHECKPOINTS_DIR / model_name
        if not model_path.exists():
            # Try with common extensions
            for ext in VALID_EXTENSIONS:
                candidate = CHECKPOINTS_DIR / f"{model_name}{ext}"
                if candidate.exists():
                    model_path = candidate
                    break
            else:
                raise FileNotFoundError(f"Model '{model_name}' not found in {CHECKPOINTS_DIR}")

        log.info("Loading pipeline from %s", model_path)
        gpu_available, _ = get_gpu_info()

        # float16 только на GPU — CPU не поддерживает float16 в PyTorch
        dtype = torch.float16 if gpu_available else torch.float32

        # Определяем тип модели по имени файла
        name_lower = model_name.lower()
        is_sdxl = any(kw in name_lower for kw in ("xl", "sdxl", "illustrious", "pony", "noob"))
        PipelineClass = StableDiffusionXLPipeline if is_sdxl else StableDiffusionPipeline

        log.info("Pipeline class: %s, dtype: %s, gpu: %s", PipelineClass.__name__, dtype, gpu_available)

        pipe = PipelineClass.from_single_file(
            str(model_path),
            torch_dtype=dtype,
            use_safetensors=model_path.suffix == ".safetensors",
            low_cpu_mem_usage=True,   # Снижает пиковое потребление RAM при загрузке
        )

        if gpu_available:
            pipe = pipe.to("cuda")
            try:
                pipe.enable_xformers_memory_efficient_attention()
                log.info("xformers memory efficient attention enabled")
            except Exception:
                log.warning("xformers not available, using standard attention")
            pipe.enable_attention_slicing()
        else:
            log.warning("No GPU detected, running on CPU (very slow)")
            # Чистый CPU режим — никаких CUDA вызовов
            pipe = pipe.to("cpu")
            pipe.enable_attention_slicing(1)

        _pipeline_cache[model_name] = pipe
        _active_model = model_name

    # Apply sampler
    sampler_name, sampler_kwargs = SAMPLER_MAP.get(sampler, SAMPLER_MAP["DPM++ 2M Karras"])
    try:
        import diffusers
        SchedulerClass = getattr(diffusers, sampler_name)
        pipe.scheduler = SchedulerClass.from_config(pipe.scheduler.config, **sampler_kwargs)
    except (AttributeError, Exception) as e:
        log.warning("Could not apply sampler %s: %s", sampler, e)

    return pipe


def apply_loras(pipe: Any, loras: list[LoraConfig], loras_dir: Path) -> None:
    """Apply LoRA adapters to the pipeline."""
    for lora in loras:
        lora_path = loras_dir / lora.name
        if not lora_path.exists():
            for ext in VALID_EXTENSIONS:
                candidate = loras_dir / f"{lora.name}{ext}"
                if candidate.exists():
                    lora_path = candidate
                    break
            else:
                log.warning("LoRA '%s' not found, skipping", lora.name)
                continue

        log.info("Loading LoRA %s with weight %s", lora.name, lora.weight)
        try:
            pipe.load_lora_weights(str(lora_path))
            pipe.fuse_lora(lora_scale=lora.weight)
        except Exception as e:
            log.warning("Could not apply LoRA %s: %s", lora.name, e)


def run_inference(request: GenerateRequest) -> tuple[bytes, int]:
    """Run the diffusers pipeline and return PNG bytes + seed used."""
    pipe = load_pipeline(request.model_name, request.sampler)

    if request.loras:
        apply_loras(pipe, request.loras, LORAS_DIR)

    seed_used = request.seed if request.seed is not None else random.randint(0, 2**31 - 1)
    generator = torch.Generator().manual_seed(seed_used)

    kwargs: dict[str, Any] = {
        "prompt": request.prompt,
        "num_inference_steps": request.steps,
        "guidance_scale": request.cfg_scale,
        "width": request.width,
        "height": request.height,
        "generator": generator,
    }
    if request.negative_prompt:
        kwargs["negative_prompt"] = request.negative_prompt

    log.info(
        "Running inference: model=%s steps=%d size=%dx%d seed=%d",
        request.model_name, request.steps, request.width, request.height, seed_used,
    )

    result = pipe(**kwargs)
    image = result.images[0]

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue(), seed_used


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AI Image Generator API",
    description="REST API for Stable Diffusion / SDXL / Flux image generation using Hugging Face diffusers",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/api/healthz")
async def health_check() -> dict[str, Any]:
    gpu_available, cuda_version = get_gpu_info()
    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "cuda_version": cuda_version,
    }


@app.get("/api/models")
async def list_models() -> dict[str, Any]:
    ensure_dirs()
    return {
        "checkpoints": scan_dir(CHECKPOINTS_DIR, "checkpoint"),
        "loras": scan_dir(LORAS_DIR, "lora"),
    }


@app.post("/api/upload")
async def upload_model(
    file: UploadFile = File(...),
    model_type: str = Form(...),
) -> dict[str, Any]:
    if model_type not in ("checkpoint", "lora"):
        raise HTTPException(status_code=400, detail="model_type must be 'checkpoint' or 'lora'")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in VALID_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Must be one of: {', '.join(VALID_EXTENSIONS)}",
        )

    ensure_dirs()
    dest_dir = LORAS_DIR if model_type == "lora" else CHECKPOINTS_DIR
    dest_path = dest_dir / (file.filename or "upload")

    log.info("Saving upload to %s", dest_path)
    chunk_size = 1024 * 1024  # 1MB chunks
    with open(dest_path, "wb") as f:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            f.write(chunk)

    size_mb = round(dest_path.stat().st_size / (1024 * 1024), 1)
    log.info("Upload complete: %s (%.1f MB)", dest_path.name, size_mb)

    return {
        "success": True,
        "filename": dest_path.name,
        "model_type": model_type,
        "message": f"Model '{dest_path.name}' uploaded successfully as {model_type} ({size_mb} MB)",
    }


@app.post("/api/generate")
async def generate_image(request: GenerateRequest) -> dict[str, Any]:
    """Запускает генерацию в фоне и сразу возвращает job_id для polling."""
    # Проверить что нет активной генерации
    running = [j for j in _jobs.values() if j.status == "running"]
    if running:
        # Вернуть уже активный job
        return {"job_id": running[0].id, "status": "running", "queued": True}

    job_id = str(uuid.uuid4())
    job = GenerationJob(job_id=job_id, request_data=request.model_dump())
    _jobs[job_id] = job

    log.info("Starting async generation job %s", job_id)
    _executor.submit(_run_generation_job, job_id, request)

    return {"job_id": job_id, "status": "running"}


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str) -> dict[str, Any]:
    """Проверить статус задачи генерации."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    response: dict[str, Any] = {
        "job_id": job.id,
        "status": job.status,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
    }
    if job.status == "completed" and job.result:
        response.update(job.result)
    elif job.status == "failed":
        response["error"] = job.error

    return response


@app.get("/api/gallery")
async def get_gallery() -> dict[str, Any]:
    return {"items": gallery, "total": len(gallery)}


@app.get("/api/samplers")
async def list_samplers() -> dict[str, Any]:
    return {
        "samplers": [{"name": name, "label": name} for name in SAMPLER_MAP]
    }


# ---------------------------------------------------------------------------
# Serve static React frontend (must be last to not shadow API routes)
# ---------------------------------------------------------------------------

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    log.warning("Static directory %s not found — frontend not served", STATIC_DIR)

    @app.get("/")
    async def root() -> JSONResponse:
        return JSONResponse({"message": "API is running. Frontend not built yet."})
