import { Router, type IRouter } from "express";
import { readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import multer from "multer";
import { logger } from "../lib/logger";

const MODELS_DIR =
  process.env.MODELS_DIR ??
  (process.env.NODE_ENV === "development"
    ? "/tmp/ai-image-gen-models"
    : "/app/models");
const CHECKPOINTS_DIR = join(MODELS_DIR, "checkpoints");
const LORAS_DIR = join(MODELS_DIR, "loras");

function ensureDirs() {
  for (const dir of [MODELS_DIR, CHECKPOINTS_DIR, LORAS_DIR]) {
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        logger.warn({ dir }, "Could not create model directory");
      }
    }
  }
}

function scanDir(dir: string, type: "checkpoint" | "lora") {
  if (!existsSync(dir)) return [];
  try {
    const files = readdirSync(dir);
    return files
      .filter((f) => {
        const lower = f.toLowerCase();
        return (
          lower.endsWith(".safetensors") ||
          lower.endsWith(".ckpt") ||
          lower.endsWith(".pt") ||
          lower.endsWith(".bin")
        );
      })
      .map((filename) => {
        const filepath = join(dir, filename);
        let size_mb: number | null = null;
        try {
          const stat = statSync(filepath);
          size_mb = Math.round((stat.size / (1024 * 1024)) * 10) / 10;
        } catch {
          // ignore
        }
        const name = filename.replace(/\.(safetensors|ckpt|pt|bin)$/i, "");
        return { name, filename, type, size_mb };
      });
  } catch (err) {
    logger.warn({ dir, err }, "Error scanning model directory");
    return [];
  }
}

const router: IRouter = Router();

router.get("/models", async (_req, res): Promise<void> => {
  ensureDirs();
  const checkpoints = scanDir(CHECKPOINTS_DIR, "checkpoint");
  const loras = scanDir(LORAS_DIR, "lora");
  res.json({ checkpoints, loras });
});

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    ensureDirs();
    const modelType = req.body.model_type as string;
    const dest = modelType === "lora" ? LORAS_DIR : CHECKPOINTS_DIR;
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

router.post(
  "/upload",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const modelType = (req.body.model_type as string) ?? "checkpoint";
    if (modelType !== "checkpoint" && modelType !== "lora") {
      res.status(400).json({ error: "model_type must be 'checkpoint' or 'lora'" });
      return;
    }

    req.log.info(
      { filename: req.file.originalname, modelType, size: req.file.size },
      "Model uploaded",
    );

    res.json({
      success: true,
      filename: req.file.originalname,
      model_type: modelType,
      message: `Model '${req.file.originalname}' uploaded successfully as ${modelType}`,
    });
  },
);

export default router;
