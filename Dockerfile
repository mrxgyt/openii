###############################################################################
# Stage 1: Build the React Frontend
###############################################################################
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

###############################################################################
# Stage 2: Python Backend with CUDA + diffusers
###############################################################################
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04 AS backend

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
    git \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1

RUN python3 -m pip install --upgrade pip

WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

COPY --from=frontend-builder /app/frontend/dist ./static

RUN mkdir -p /app/models/checkpoints /app/models/loras

EXPOSE 8080

ENV PORT=8080
ENV MODELS_DIR=/app/models

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
