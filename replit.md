# AI Image Generator

## Overview

A full-stack AI Image Generation web application — a dark-mode control panel for Stable Diffusion / SDXL / Flux image generation.

## Architecture

### Frontend (`artifacts/ai-image-gen/`)
- **React + Vite + TypeScript**
- **Tailwind CSS v4** with deep dark purple/violet theme
- **shadcn/ui** component library
- Three modules: Workspace (generation), Model Library (upload), Settings Panel (parameters)

### Backend (`artifacts/api-server/`)
- **Express 5 + TypeScript + Node.js**
- Serves the REST API: models scan, file upload, image generation, gallery
- In dev/CPU mode: generates gradient SVG placeholder images
- In production with diffusers (Python): generates real AI images

### Python Backend (`backend/main.py`)
- **FastAPI + Hugging Face diffusers**
- Designed for Google Cloud Run with GPU (NVIDIA CUDA)
- Loads Stable Diffusion / SDXL / Flux pipelines from local model files
- Supports LoRA adapters with configurable weights
- Serves static React build + REST API from single container

### Dockerfile (root)
- Multi-stage: Node.js build stage → NVIDIA CUDA + Python 3.10 runtime
- Stage 1: Builds React frontend with `npm run build`
- Stage 2: Python 3.10 + diffusers, copies frontend dist to `backend/static/`

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **API framework**: Express 5
- **Validation**: Zod + Orval codegen from OpenAPI spec
- **Build**: esbuild (API server), Vite (frontend)

## Model Directory Structure (Production / GCS FUSE Mount)

```
/app/models/
├── checkpoints/    # Base model files (.safetensors, .ckpt, .pt)
└── loras/          # LoRA adapter files (.safetensors, .pt)
```

In development, models are stored in `/tmp/ai-image-gen-models/`.

## API Endpoints

- `GET /api/healthz` — Health + GPU status
- `GET /api/models` — List available checkpoints and LoRAs
- `POST /api/upload` — Chunked upload of model files
- `POST /api/generate` — Generate image (prompt, model, params, LoRAs)
- `GET /api/gallery` — Recent generation history
- `GET /api/samplers` — Available samplers list

## Key Commands

- `pnpm --filter @workspace/api-spec run codegen` — Regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — Run API server locally
- `pnpm --filter @workspace/ai-image-gen run dev` — Run frontend locally

## CPU Mode

When no GPU is detected, the app generates gradient SVG placeholders instead of real AI images. Upload a real `.safetensors` or `.ckpt` model to enable actual diffusers inference. On CPU, generation is very slow (~minutes per image).
