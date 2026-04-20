# AI Image Generator (NeuralGEN)

## Overview

Полностековое веб-приложение для генерации AI изображений — тёмная панель управления для Stable Diffusion / SDXL / Flux.

## Architecture

### Frontend (`frontend/`)
- **React 19 + Vite + TypeScript**
- **Tailwind CSS v4** с тёмной фиолетовой темой
- **shadcn/ui** компонентная библиотека
- Запускается на порту **5000**
- Проксирует `/api` запросы на бэкенд (порт 8000)

### Backend (`artifacts/api-server/`)
- **Express 5 + TypeScript + Node.js**
- REST API: список моделей, загрузка, генерация, галерея
- В dev/CPU режиме генерирует SVG-заглушки вместо реальных изображений
- Запускается на порту **8000**

### Python Backend (`backend/main.py`)
- **FastAPI + Hugging Face diffusers**
- Для деплоя на Northflank/Google Cloud Run с GPU (NVIDIA CUDA)
- Загружает Stable Diffusion / SDXL / Flux из локальных файлов
- Обслуживает статику React + REST API из одного контейнера

### Dockerfile (Northflank deployment)
- Multi-stage: Node.js сборка фронтенда → Python/CUDA бэкенд
- Автоматически скачивает модель по умолчанию при сборке Docker-образа
- Модель: realismIllustriousBy v5.5 FP16 (CivitAI #2831949)

## Stack

- **Package manager**: npm
- **Node.js version**: 20
- **API framework**: Express 5
- **Validation**: Zod + Orval codegen from OpenAPI spec
- **Build**: esbuild (API server), Vite (frontend)

## Model Directory Structure

```
/tmp/ai-image-gen-models/   (dev)
/app/models/                (production)
├── checkpoints/    # Base model files (.safetensors, .ckpt)
└── loras/          # LoRA adapter files (.safetensors, .pt)
```

## Default Model

- **URL**: https://civitai.red/api/download/models/2831949?type=Model&format=SafeTensor&size=pruned&fp=fp16
- **Имя файла**: `default-model.safetensors`
- Скачивается автоматически при первом старте бэкенда (в фоне)
- В Docker сборке — скачивается во время `docker build`

## API Endpoints

- `GET /api/healthz` — Health + GPU статус
- `GET /api/models` — Список чекпоинтов и LoRA
- `POST /api/upload` — Загрузка файлов моделей
- `POST /api/generate` — Генерация изображения
- `GET /api/gallery` — История генераций
- `GET /api/samplers` — Список сэмплеров

## Workflows (Replit)

- **Start application**: `cd frontend && npm run dev` (порт 5000, webview)
- **Backend API**: `DOWNLOAD_BG=1 node scripts/download-model.mjs & sleep 1 && cd artifacts/api-server && PORT=8000 NODE_ENV=development node --enable-source-maps dist/index.mjs` (порт 8000, console)

## Scripts

- `scripts/download-model.mjs` — Скачивает модель по умолчанию
- `scripts/github-push.py` — Пушит файлы в GitHub через REST API (без git команд)

## CPU Mode

Без GPU генерируются SVG-заглушки с градиентом вместо реальных изображений. Для реальной генерации нужен GPU с CUDA (через Northflank/Cloud Run).
