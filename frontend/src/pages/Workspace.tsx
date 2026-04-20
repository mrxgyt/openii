import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { useGeneration } from "@/contexts/GenerationContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wand2, Download, Maximize2, AlertCircle, Clock, History } from "lucide-react";
import {
  useGetGallery,
  getGetGalleryQueryKey,
  useHealthCheck,
  getHealthCheckQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const JOB_STORAGE_KEY = "ai-gen-pending-job";
const POLL_INTERVAL_MS = 3000;

interface JobResult {
  job_id: string;
  status: "running" | "completed" | "failed";
  image_base64?: string;
  seed_used?: number;
  generation_time_ms?: number;
  model_name?: string;
  prompt?: string;
  id?: string;
  error?: string;
}

async function startGeneration(payload: object): Promise<{ job_id: string; status: string }> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function pollJob(jobId: string): Promise<JobResult> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Job ${jobId} not found`);
  return res.json();
}

export default function Workspace() {
  const {
    model_name, prompt, negative_prompt,
    width, height, steps, cfg_scale, seed, sampler, loras,
    setPrompt, setNegativePrompt, activeImage, setActiveImage,
  } = useGeneration();

  const queryClient = useQueryClient();
  const { data: galleryData, isLoading: isGalleryLoading } = useGetGallery({
    query: { queryKey: getGetGalleryQueryKey() },
  });
  const { data: healthData } = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 },
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationTime, setGenerationTime] = useState<number | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Показать последнее изображение из галереи если нет активного
  useEffect(() => {
    if (!activeImage && galleryData?.items && galleryData.items.length > 0) {
      setActiveImage(galleryData.items[0].image_base64);
    }
  }, [galleryData, activeImage, setActiveImage]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const handleJobResult = useCallback((result: JobResult) => {
    stopPolling();
    setIsGenerating(false);
    localStorage.removeItem(JOB_STORAGE_KEY);

    if (result.status === "completed" && result.image_base64) {
      setActiveImage(result.image_base64);
      setGenerationTime(result.generation_time_ms ?? null);
      queryClient.invalidateQueries({ queryKey: getGetGalleryQueryKey() });
      toast.success("Изображение сгенерировано!");
    } else if (result.status === "failed") {
      toast.error(result.error || "Ошибка генерации");
    }
  }, [stopPolling, setActiveImage, queryClient]);

  const startPolling = useCallback((jobId: string) => {
    setIsGenerating(true);
    startTimeRef.current = Date.now();
    setElapsedSecs(0);

    // Таймер прошедшего времени
    timerRef.current = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Polling статуса задачи
    pollRef.current = setInterval(async () => {
      try {
        const result = await pollJob(jobId);
        if (result.status !== "running") {
          handleJobResult(result);
        }
      } catch (err: any) {
        // Job не найден — сервер перезапустился
        stopPolling();
        setIsGenerating(false);
        localStorage.removeItem(JOB_STORAGE_KEY);
        toast.error("Задача генерации потеряна (сервер перезапустился)");
      }
    }, POLL_INTERVAL_MS);
  }, [handleJobResult, stopPolling]);

  // При загрузке страницы — восстановить активную задачу из localStorage
  useEffect(() => {
    const saved = localStorage.getItem(JOB_STORAGE_KEY);
    if (!saved) return;
    try {
      const { jobId } = JSON.parse(saved);
      if (jobId) {
        toast.info("Возобновляю генерацию...");
        startPolling(jobId);
      }
    } catch {
      localStorage.removeItem(JOB_STORAGE_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Очистка при unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Введите промпт");
      return;
    }
    if (isGenerating) return;

    const payload = {
      prompt,
      negative_prompt: negative_prompt || undefined,
      model_name: model_name || "default-model",
      width,
      height,
      steps,
      cfg_scale,
      seed: seed || undefined,
      sampler,
      loras: loras.length > 0 ? loras : undefined,
    };

    try {
      const { job_id } = await startGeneration(payload);
      // Сохранить в localStorage — при перезагрузке страницы polling продолжится
      localStorage.setItem(JOB_STORAGE_KEY, JSON.stringify({ jobId: job_id }));
      startPolling(job_id);
    } catch (err: any) {
      toast.error(err.message || "Не удалось запустить генерацию");
    }
  };

  const downloadImage = () => {
    if (!activeImage) return;
    const a = document.createElement("a");
    a.href = activeImage;
    a.download = `generation-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Layout>
      <div className="flex flex-col h-full relative">
        {/* Main Display Area */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center relative overflow-hidden bg-background">
          {activeImage ? (
            <div className="relative w-full h-full flex items-center justify-center group">
              <div className="relative max-w-full max-h-full flex items-center justify-center">
                <img
                  src={activeImage}
                  alt="Generated"
                  className="max-w-full max-h-full object-contain rounded-md shadow-2xl transition-all duration-300 ring-1 ring-border/50"
                  style={{
                    boxShadow: "0 0 40px rgba(0,0,0,0.5)",
                    opacity: isGenerating ? 0.5 : 1,
                    filter: isGenerating ? "blur(4px)" : "none",
                  }}
                />
                {!isGenerating && (
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="secondary" size="icon" className="bg-background/80 backdrop-blur hover:bg-background" onClick={downloadImage}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="secondary" size="icon" className="bg-background/80 backdrop-blur hover:bg-background">
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {generationTime && !isGenerating && (
                  <div className="absolute bottom-4 left-4 text-xs font-mono bg-background/80 backdrop-blur px-2 py-1 rounded text-muted-foreground flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Clock className="h-3 w-3" />
                    {(generationTime / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-2xl aspect-square max-h-[60vh] border-2 border-dashed border-border/50 rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-card/30">
              <Wand2 className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium opacity-50">Изображений ещё нет</p>
              <p className="text-sm opacity-40 max-w-xs text-center mt-2">Введите промпт и нажмите Generate.</p>
            </div>
          )}

          {/* Оверлей генерации — сохраняется при перезагрузке страницы */}
          {isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-20">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                <div className="w-16 h-16 border-4 border-transparent border-b-accent rounded-full animate-spin absolute inset-0" style={{ animationDirection: "reverse", animationDuration: "1.5s" }}></div>
              </div>
              <div className="mt-6 font-mono text-sm tracking-widest text-primary animate-pulse">GENERATING...</div>
              <div className="mt-3 font-mono text-2xl font-bold text-primary tabular-nums">
                {String(Math.floor(elapsedSecs / 60)).padStart(2, "0")}:{String(elapsedSecs % 60).padStart(2, "0")}
              </div>
              <div className="mt-2 text-xs text-muted-foreground max-w-xs text-center">
                Идёт обработка на CPU. Перезагрузка страницы не прерывает генерацию.
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t bg-card/50 backdrop-blur z-10 px-6 py-4 flex flex-col gap-3 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] relative">
          {healthData && !healthData.gpu_available && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-destructive/20 text-destructive text-xs px-3 py-1 rounded-full flex items-center gap-1.5 border border-destructive/30 shadow-lg">
              <AlertCircle className="h-3 w-3" />
              Running on CPU — Generation will be slow
            </div>
          )}

          <div className="flex gap-4 items-stretch">
            <div className="flex-1 flex flex-col gap-3">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Positive prompt... describe what you want to see"
                className="resize-none h-20 bg-background/80 border-primary/20 focus-visible:ring-primary/50 text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              <Textarea
                value={negative_prompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Negative prompt... describe what you DO NOT want to see"
                className="resize-none h-10 bg-background/50 border-border focus-visible:ring-muted text-sm text-muted-foreground"
              />
            </div>

            <Button
              size="lg"
              className={cn(
                "h-auto w-32 flex-shrink-0 flex flex-col gap-2 transition-all duration-300",
                isGenerating
                  ? "bg-primary/50 text-primary-foreground/50 cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] border border-primary-foreground/20"
              )}
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
            >
              <Wand2 className={cn("h-6 w-6", isGenerating && "animate-pulse")} />
              <span className="font-bold tracking-wider">{isGenerating ? "WAIT" : "GENERATE"}</span>
            </Button>
          </div>
        </div>

        {/* Gallery Strip */}
        <div className="h-28 border-t bg-sidebar flex-shrink-0 flex flex-col">
          <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border/50 flex items-center gap-1.5 bg-background/30">
            <History className="h-3 w-3" /> Recent History
          </div>
          <ScrollArea className="flex-1 whitespace-nowrap">
            <div className="flex p-3 gap-3">
              {!isGalleryLoading && galleryData?.items.length === 0 && (
                <div className="text-xs text-muted-foreground h-full w-full flex items-center px-4 italic">
                  History is empty
                </div>
              )}
              {galleryData?.items.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "relative h-16 w-16 rounded-md overflow-hidden flex-shrink-0 transition-all focus:outline-none focus:ring-2 focus:ring-primary ring-offset-2 ring-offset-background",
                    activeImage === item.image_base64
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background opacity-100"
                      : "opacity-60 hover:opacity-100 hover:ring-1 hover:ring-border"
                  )}
                  onClick={() => {
                    setActiveImage(item.image_base64);
                    if (item.prompt) setPrompt(item.prompt);
                  }}
                >
                  <img
                    src={item.image_base64}
                    alt={item.prompt.substring(0, 20)}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </Layout>
  );
}
