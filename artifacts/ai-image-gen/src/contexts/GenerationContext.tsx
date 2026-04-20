import React, { createContext, useContext, useState, ReactNode } from "react";
import { LoraConfig } from "@workspace/api-client-react";

interface GenerationState {
  model_name: string;
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  seed: number | null;
  sampler: string;
  loras: LoraConfig[];
  activeImage: string | null;
  setModelName: (val: string) => void;
  setPrompt: (val: string) => void;
  setNegativePrompt: (val: string) => void;
  setWidth: (val: number) => void;
  setHeight: (val: number) => void;
  setSteps: (val: number) => void;
  setCfgScale: (val: number) => void;
  setSeed: (val: number | null) => void;
  setSampler: (val: string) => void;
  setLoras: (val: LoraConfig[]) => void;
  setActiveImage: (val: string | null) => void;
}

const GenerationContext = createContext<GenerationState | undefined>(undefined);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [model_name, setModelName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [negative_prompt, setNegativePrompt] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(30);
  const [cfg_scale, setCfgScale] = useState(7.0);
  const [seed, setSeed] = useState<number | null>(null);
  const [sampler, setSampler] = useState("euler_a");
  const [loras, setLoras] = useState<LoraConfig[]>([]);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  return (
    <GenerationContext.Provider
      value={{
        model_name,
        prompt,
        negative_prompt,
        width,
        height,
        steps,
        cfg_scale,
        seed,
        sampler,
        loras,
        activeImage,
        setModelName,
        setPrompt,
        setNegativePrompt,
        setWidth,
        setHeight,
        setSteps,
        setCfgScale,
        setSeed,
        setSampler,
        setLoras,
        setActiveImage,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (context === undefined) {
    throw new Error("useGeneration must be used within a GenerationProvider");
  }
  return context;
}
