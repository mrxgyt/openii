import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

interface GalleryItem {
  id: string;
  image_base64: string;
  prompt: string;
  model_name: string;
  seed_used: number;
  created_at: string;
  settings: Record<string, unknown>;
}

const MAX_GALLERY = 50;
export const galleryItems: GalleryItem[] = [];

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function generatePlaceholderImage(
  prompt: string,
  width: number,
  height: number,
  seed: number,
): string {
  const hue = seed % 360;
  const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="g1" cx="30%" cy="30%">
      <stop offset="0%" stop-color="hsl(${hue},70%,60%)" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="hsl(${(hue + 60) % 360},80%,20%)" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="g2" cx="70%" cy="70%">
      <stop offset="0%" stop-color="hsl(${(hue + 120) % 360},60%,50%)" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="hsl(${(hue + 180) % 360},70%,15%)" stop-opacity="0.5"/>
    </radialGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="20"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g1)"/>
  <circle cx="${width * 0.6}" cy="${height * 0.6}" r="${Math.min(width, height) * 0.5}" fill="url(#g2)" filter="url(#blur)" opacity="0.8"/>
  <rect width="${width}" height="${height}" fill="hsl(${hue},40%,8%)" opacity="0.3"/>
  <text
    x="${width / 2}" y="${height / 2 - 20}"
    font-family="system-ui, sans-serif"
    font-size="${Math.max(12, Math.min(18, width / 25))}px"
    fill="rgba(255,255,255,0.6)"
    text-anchor="middle"
    dominant-baseline="middle"
    style="max-width: ${width - 40}px"
  >[ Diffusers output placeholder ]</text>
  <text
    x="${width / 2}" y="${height / 2 + 20}"
    font-family="system-ui, sans-serif"
    font-size="${Math.max(10, Math.min(13, width / 35))}px"
    fill="rgba(255,255,255,0.35)"
    text-anchor="middle"
    dominant-baseline="middle"
  >${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}</text>
  <text
    x="${width / 2}" y="${height - 20}"
    font-family="system-ui, sans-serif"
    font-size="11px"
    fill="rgba(255,255,255,0.25)"
    text-anchor="middle"
    dominant-baseline="middle"
  >seed: ${seed} | ${width}x${height}</text>
</svg>`;
  return Buffer.from(svgContent).toString("base64");
}

const router: IRouter = Router();

router.post("/generate", async (req, res): Promise<void> => {
  const {
    prompt,
    negative_prompt,
    model_name,
    width = 512,
    height = 512,
    steps = 20,
    cfg_scale = 7.5,
    seed,
    sampler = "DPM++ 2M Karras",
    loras = [],
  } = req.body as {
    prompt: string;
    negative_prompt?: string;
    model_name: string;
    width?: number;
    height?: number;
    steps?: number;
    cfg_scale?: number;
    seed?: number;
    sampler?: string;
    loras?: Array<{ name: string; weight: number }>;
  };

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  if (!model_name) {
    res.status(400).json({ error: "model_name is required" });
    return;
  }

  const seed_used = seed != null ? seed : randomInt(2147483647);
  const start = Date.now();

  req.log.info(
    { model_name, prompt: prompt.slice(0, 80), width, height, steps, sampler, seed: seed_used },
    "Generating image",
  );

  const simulatedMs = Math.min(steps * 50 + 200, 2000);
  await new Promise((r) => setTimeout(r, simulatedMs));

  const imageBase64 = generatePlaceholderImage(prompt, width, height, seed_used);
  const generation_time_ms = Date.now() - start;

  const id = randomUUID();
  const item: GalleryItem = {
    id,
    image_base64: `data:image/svg+xml;base64,${imageBase64}`,
    prompt,
    model_name,
    seed_used,
    created_at: new Date().toISOString(),
    settings: {
      negative_prompt,
      width,
      height,
      steps,
      cfg_scale,
      sampler,
      loras,
    },
  };

  galleryItems.unshift(item);
  if (galleryItems.length > MAX_GALLERY) {
    galleryItems.splice(MAX_GALLERY);
  }

  req.log.info({ id, generation_time_ms }, "Image generated");

  res.json({
    success: true,
    image_base64: item.image_base64,
    seed_used,
    generation_time_ms,
    model_name,
    prompt,
    id,
  });
});

router.get("/gallery", async (_req, res): Promise<void> => {
  res.json({
    items: galleryItems,
    total: galleryItems.length,
  });
});

router.get("/samplers", async (_req, res): Promise<void> => {
  res.json({
    samplers: [
      { name: "DPM++ 2M Karras", label: "DPM++ 2M Karras" },
      { name: "DPM++ SDE Karras", label: "DPM++ SDE Karras" },
      { name: "DPM++ 2M SDE Karras", label: "DPM++ 2M SDE Karras" },
      { name: "Euler a", label: "Euler Ancestral" },
      { name: "Euler", label: "Euler" },
      { name: "DDIM", label: "DDIM" },
      { name: "PLMS", label: "PLMS" },
      { name: "UniPC", label: "UniPC" },
      { name: "Heun", label: "Heun" },
      { name: "LMS Karras", label: "LMS Karras" },
    ],
  });
});

export default router;

logger.info("Generate routes initialized");
