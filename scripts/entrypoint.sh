#!/bin/bash
set -e

MODELS_DIR="${MODELS_DIR:-/app/models}"
CHECKPOINTS_DIR="$MODELS_DIR/checkpoints"
LORAS_DIR="$MODELS_DIR/loras"
MODEL_PATH="$CHECKPOINTS_DIR/default-model.safetensors"
MODEL_URL="https://civitai.red/api/download/models/2831949?type=Model&format=SafeTensor&size=pruned&fp=fp16"

# Создать папки для моделей
mkdir -p "$CHECKPOINTS_DIR" "$LORAS_DIR"

# Скачать модель по умолчанию если её нет
if [ ! -f "$MODEL_PATH" ]; then
    echo "📥 Скачиваю модель по умолчанию..."
    echo "   URL: $MODEL_URL"
    echo "   Сохраняю в: $MODEL_PATH"
    curl -L --retry 3 --retry-delay 5 \
         --progress-bar \
         -o "$MODEL_PATH.part" \
         "$MODEL_URL" && mv "$MODEL_PATH.part" "$MODEL_PATH"
    echo "✅ Модель скачана: $MODEL_PATH"
else
    echo "✓ Модель уже есть: $MODEL_PATH"
fi

# Запустить основной процесс
exec "$@"
