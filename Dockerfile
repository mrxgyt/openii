###############################################################################
# Stage 1: Build the React Frontend
###############################################################################
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./

# Сборка фронтенда
RUN npm run build

###############################################################################
# Stage 2: Python Backend (FastAPI + diffusers) + CUDA
###############################################################################
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3.10-dev \
    python3-pip \
    python3-venv \
    build-essential \
    curl \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1

RUN python3 -m pip install --upgrade pip

WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# Фронтенд (статические файлы)
COPY --from=frontend-builder /app/frontend/dist ./static

# Entrypoint-скрипт (скачивает модель при первом старте)
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Создать папки для моделей
RUN mkdir -p /app/models/checkpoints /app/models/loras

EXPOSE 8080

ENV PORT=8080
ENV MODELS_DIR=/app/models

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
