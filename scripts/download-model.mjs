#!/usr/bin/env node
/**
 * Скачивает модель по умолчанию из CivitAI в папку /tmp/ai-image-gen-models/checkpoints/
 * Запускается один раз при старте, если модель ещё не скачана.
 */

import { existsSync, mkdirSync, createWriteStream, unlinkSync } from "fs";
import { join } from "path";
import https from "https";
import http from "http";

const MODEL_URL =
  "https://civitai.red/api/download/models/320676?type=Model&format=SafeTensor";
const MODELS_DIR = process.env.MODELS_DIR ?? "/tmp/ai-image-gen-models";
const CHECKPOINTS_DIR = join(MODELS_DIR, "checkpoints");
const MODEL_FILENAME = "default-model.safetensors";
const MODEL_PATH = join(CHECKPOINTS_DIR, MODEL_FILENAME);
const PARTIAL_PATH = MODEL_PATH + ".part";

// Флаг: запускать ли в фоне (не блокировать процесс)
const BACKGROUND = process.env.DOWNLOAD_BG === "1";

function ensureDirs() {
  for (const dir of [MODELS_DIR, CHECKPOINTS_DIR, join(MODELS_DIR, "loras")]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`Создана папка: ${dir}`);
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function downloadFile(url, dest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) {
      reject(new Error("Слишком много редиректов"));
      return;
    }

    const protocol = url.startsWith("https") ? https : http;

    const req = protocol.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`[Модель] Редирект -> ${res.headers.location.substring(0, 80)}...`);
        resolve(downloadFile(res.headers.location, dest, redirectCount + 1));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ошибка: ${res.statusCode}`));
        return;
      }

      const totalSize = parseInt(res.headers["content-length"] || "0", 10);
      let downloaded = 0;
      let lastLog = 0;

      const file = createWriteStream(dest);

      res.on("data", (chunk) => {
        downloaded += chunk.length;
        const now = Date.now();
        if (now - lastLog > 5000) {
          const pct = totalSize ? ` (${((downloaded / totalSize) * 100).toFixed(1)}%)` : "";
          console.log(`[Модель] Скачано: ${formatBytes(downloaded)}${pct}`);
          lastLog = now;
        }
      });

      res.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });

      file.on("error", (err) => {
        reject(err);
      });
    });

    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error("Тайм-аут соединения"));
    });
  });
}

async function main() {
  ensureDirs();

  if (existsSync(MODEL_PATH)) {
    console.log(`✓ Модель уже скачана: ${MODEL_PATH}`);
    return;
  }

  console.log(`\n📥 Начинаю скачивание модели по умолчанию...`);
  console.log(`   URL: ${MODEL_URL}`);
  console.log(`   Сохраняю в: ${MODEL_PATH}\n`);

  const startTime = Date.now();

  // Удалить неполный файл если есть
  if (existsSync(PARTIAL_PATH)) {
    unlinkSync(PARTIAL_PATH);
  }

  try {
    await downloadFile(MODEL_URL, PARTIAL_PATH);

    // Переименовать из .part в финальный файл
    const { renameSync } = await import("fs");
    renameSync(PARTIAL_PATH, MODEL_PATH);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Модель скачана за ${elapsed}с: ${MODEL_PATH}`);
  } catch (err) {
    console.error(`\n❌ Ошибка скачивания модели: ${err.message}`);
    // Удалить неполный файл
    if (existsSync(PARTIAL_PATH)) {
      try { unlinkSync(PARTIAL_PATH); } catch {}
    }
    if (!BACKGROUND) {
      // В режиме блокировки (напр. Docker build) — не падать
      console.error("   Сервер запустится без модели по умолчанию.");
    }
  }
}

main();
