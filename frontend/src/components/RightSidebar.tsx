import { useState, useEffect } from "react";
import { useGeneration } from "@/contexts/GenerationContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, SlidersHorizontal, Layers, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListModels,
  getListModelsQueryKey,
  useListSamplers,
  getListSamplersQueryKey,
} from "@workspace/api-client-react";

export function RightSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isRandomSeed, setIsRandomSeed] = useState(true);

  const {
    model_name, setModelName,
    width, setWidth,
    height, setHeight,
    steps, setSteps,
    cfg_scale, setCfgScale,
    seed, setSeed,
    sampler, setSampler,
    loras, setLoras
  } = useGeneration();

  const { data: modelsData, isLoading: isModelsLoading } = useListModels({
    query: { queryKey: getListModelsQueryKey() },
  });

  const { data: samplersData } = useListSamplers({
    query: { queryKey: getListSamplersQueryKey() },
  });

  const checkpoints = modelsData?.checkpoints || [];
  const availableLoras = modelsData?.loras || [];

  // Set default model and sampler if not set
  useEffect(() => {
    if (!model_name && checkpoints.length > 0) {
      setModelName(checkpoints[0].name);
    }
  }, [checkpoints, model_name, setModelName]);

  useEffect(() => {
    if (!sampler && samplersData?.samplers && samplersData.samplers.length > 0) {
      setSampler(samplersData.samplers[0].name);
    }
  }, [samplersData, sampler, setSampler]);

  const handleAddLora = (loraName: string) => {
    if (!loras.find(l => l.name === loraName)) {
      setLoras([...loras, { name: loraName, weight: 1.0 }]);
    }
  };

  const handleRemoveLora = (loraName: string) => {
    setLoras(loras.filter(l => l.name !== loraName));
  };

  const handleLoraWeightChange = (loraName: string, weight: number) => {
    setLoras(loras.map(l => l.name === loraName ? { ...l, weight } : l));
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-l bg-sidebar flex flex-col items-center py-4 flex-shrink-0 transition-all duration-300 z-10">
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="mb-4">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex flex-col gap-4 text-muted-foreground">
          <SlidersHorizontal className="h-5 w-5" />
          <Layers className="h-5 w-5" />
          <Fingerprint className="h-5 w-5" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-l bg-sidebar flex flex-col h-full flex-shrink-0 transition-all duration-300 z-10">
      <div className="p-4 border-b flex items-center justify-between h-14">
        <div className="flex items-center gap-2 font-medium">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <span>Settings</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsCollapsed(true)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* Model Selection */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Checkpoint</Label>
            <Select value={model_name} onValueChange={setModelName}>
              <SelectTrigger className="w-full bg-card border-border">
                <SelectValue placeholder={isModelsLoading ? "Loading..." : "Select Model"} />
              </SelectTrigger>
              <SelectContent>
                {checkpoints.map(model => (
                  <SelectItem key={model.name} value={model.name}>
                    {model.name}
                  </SelectItem>
                ))}
                {checkpoints.length === 0 && !isModelsLoading && (
                  <SelectItem value="none" disabled>No checkpoints found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="h-px bg-border/50 my-4" />

          {/* Dimensions */}
          <div className="space-y-4">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Dimensions</Label>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">Width</Label>
                <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground">{width}</span>
              </div>
              <Slider 
                value={[width]} 
                min={64} max={2048} step={64}
                onValueChange={(vals) => setWidth(vals[0])}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">Height</Label>
                <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground">{height}</span>
              </div>
              <Slider 
                value={[height]} 
                min={64} max={2048} step={64}
                onValueChange={(vals) => setHeight(vals[0])}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
            </div>
          </div>

          <div className="h-px bg-border/50 my-4" />

          {/* Generation Params */}
          <div className="space-y-4">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Generation Parameters</Label>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">Steps</Label>
                <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground">{steps}</span>
              </div>
              <Slider 
                value={[steps]} 
                min={1} max={150} step={1}
                onValueChange={(vals) => setSteps(vals[0])}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">CFG Scale</Label>
                <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground">{cfg_scale.toFixed(1)}</span>
              </div>
              <Slider 
                value={[cfg_scale]} 
                min={1} max={30} step={0.5}
                onValueChange={(vals) => setCfgScale(vals[0])}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
              />
            </div>
            
            <div className="space-y-3 pt-2">
              <Label className="text-sm font-medium">Sampler</Label>
              <Select value={sampler} onValueChange={setSampler}>
                <SelectTrigger className="w-full bg-card border-border">
                  <SelectValue placeholder="Select Sampler" />
                </SelectTrigger>
                <SelectContent>
                  {samplersData?.samplers?.map(s => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.label}
                    </SelectItem>
                  ))}
                  {(!samplersData || !samplersData.samplers) && (
                    <SelectItem value="euler_a">Euler a</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">Seed</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="random-seed" 
                    checked={isRandomSeed}
                    onCheckedChange={(checked) => {
                      setIsRandomSeed(!!checked);
                      if (checked) setSeed(null);
                    }}
                  />
                  <label
                    htmlFor="random-seed"
                    className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Random
                  </label>
                </div>
              </div>
              <Input 
                type="number" 
                value={seed ?? ""} 
                onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : null)}
                disabled={isRandomSeed}
                placeholder="Random seed..."
                className="font-mono bg-card"
              />
            </div>
          </div>

          <div className="h-px bg-border/50 my-4" />

          {/* LoRAs */}
          <div className="space-y-4 pb-8">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
              <Layers className="h-3 w-3" /> LoRAs
            </Label>
            
            <Select onValueChange={(val) => {
              handleAddLora(val);
            }}>
              <SelectTrigger className="w-full bg-card border-border">
                <SelectValue placeholder="Add LoRA..." />
              </SelectTrigger>
              <SelectContent>
                {availableLoras.filter(l => !loras.find(al => al.name === l.name)).map(model => (
                  <SelectItem key={model.name} value={model.name}>
                    {model.name}
                  </SelectItem>
                ))}
                {availableLoras.length === 0 && (
                  <SelectItem value="none" disabled>No LoRAs found</SelectItem>
                )}
              </SelectContent>
            </Select>

            {loras.length > 0 && (
              <div className="space-y-3 mt-4">
                {loras.map((lora) => (
                  <div key={lora.name} className="bg-card p-3 rounded-md border border-border relative group">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveLora(lora.name)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <div className="pr-6 truncate text-sm font-medium mb-3" title={lora.name}>
                      {lora.name}
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider 
                        value={[lora.weight]} 
                        min={-2} max={2} step={0.05}
                        onValueChange={(vals) => handleLoraWeightChange(lora.name, vals[0])}
                        className="flex-1 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
                      />
                      <span className="text-xs font-mono w-8 text-right text-muted-foreground">
                        {lora.weight.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
