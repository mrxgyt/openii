#!/bin/bash
# Скрипт запуска бэкенда: скачивает модель и запускает сервер
set -e

echo "=== Запуск бэкенда AI Image Generator ==="

# Скачать модель если нужно
node scripts/download-model.mjs

# Собрать и запустить бэкенд
cd artifacts/api-server
npm run build
PORT=8000 NODE_ENV=development npm run dev
