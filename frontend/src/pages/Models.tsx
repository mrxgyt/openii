import { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { 
  useListModels, 
  getListModelsQueryKey,
  useUploadModel,
  UploadModelRequestModelType
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Database, UploadCloud, File, HardDrive, AlertCircle, CheckCircle2, Box, Layers } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Models() {
  const queryClient = useQueryClient();
  const { data: modelsData, isLoading } = useListModels({
    query: { queryKey: getListModelsQueryKey() }
  });
  
  const uploadMutation = useUploadModel();

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<UploadModelRequestModelType>(UploadModelRequestModelType.checkpoint);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      checkAndSetFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      checkAndSetFile(e.target.files[0]);
    }
  };

  const checkAndSetFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['safetensors', 'ckpt', 'pt', 'bin'].includes(ext || '')) {
      setSelectedFile(file);
      // Auto-detect if it looks like a LoRA
      if (file.name.toLowerCase().includes('lora') || file.size < 500 * 1024 * 1024) { // Under 500MB likely a LoRA
        setUploadType(UploadModelRequestModelType.lora);
      } else {
        setUploadType(UploadModelRequestModelType.checkpoint);
      }
    } else {
      toast.error("Unsupported file format. Please upload .safetensors or .ckpt files.");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    // Reset progress
    setUploadProgress(10);
    
    // Use an XMLHttpRequest for real upload progress, falling back to the hook for the actual call
    // Since the generated hook doesn't easily expose XMLHttpRequest progress events, we'll simulate 
    // progress for the UX, but the actual upload happens via the hook
    
    const simulateProgress = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(simulateProgress);
          return 90;
        }
        return prev + 10;
      });
    }, 500);

    uploadMutation.mutate({ 
      data: { 
        file: selectedFile, 
        model_type: uploadType 
      } 
    }, {
      onSuccess: (result) => {
        clearInterval(simulateProgress);
        setUploadProgress(100);
        
        if (result.success) {
          toast.success(result.message || "Model uploaded successfully");
          setSelectedFile(null);
          queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
          
          setTimeout(() => setUploadProgress(0), 1000);
        } else {
          toast.error(result.message || "Upload failed");
          setUploadProgress(0);
        }
      },
      onError: (error: any) => {
        clearInterval(simulateProgress);
        setUploadProgress(0);
        toast.error(error.response?.data?.error || error.message || "Upload failed");
      }
    });
  };

  const formatSize = (mb?: number | null) => {
    if (!mb) return "Unknown size";
    if (mb > 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <Layout>
      <div className="h-full flex flex-col bg-background overflow-hidden p-6 md:p-8">
        <div className="flex items-center gap-3 mb-8">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Model Library</h1>
            <p className="text-sm text-muted-foreground">Manage your checkpoints and LoRAs</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100%-5rem)]">
          {/* Left Column: Model List */}
          <Card className="lg:col-span-2 h-full flex flex-col bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <Box className="h-5 w-5 text-primary" /> Available Models
              </CardTitle>
            </CardHeader>
            
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                {isLoading ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                    Loading models...
                  </div>
                ) : (
                  <>
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2 text-foreground">
                        <HardDrive className="h-4 w-4 text-muted-foreground" /> 
                        Checkpoints
                        <Badge variant="secondary" className="ml-2 font-mono">{modelsData?.checkpoints?.length || 0}</Badge>
                      </h3>
                      {modelsData?.checkpoints?.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic px-2">No checkpoints found.</p>
                      ) : (
                        <div className="grid gap-2">
                          {modelsData?.checkpoints?.map(model => (
                            <div key={model.name} className="flex items-center justify-between p-3 rounded-md bg-secondary/50 border border-border hover:border-primary/50 transition-colors">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center flex-shrink-0">
                                  <Database className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate" title={model.name}>{model.name}</p>
                                  <p className="text-xs text-muted-foreground truncate" title={model.filename}>{model.filename}</p>
                                </div>
                              </div>
                              <div className="flex-shrink-0 text-xs font-mono text-muted-foreground bg-background px-2 py-1 rounded ml-4">
                                {formatSize(model.size_mb)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2 text-foreground mt-8">
                        <Layers className="h-4 w-4 text-muted-foreground" /> 
                        LoRAs
                        <Badge variant="secondary" className="ml-2 font-mono">{modelsData?.loras?.length || 0}</Badge>
                      </h3>
                      {modelsData?.loras?.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic px-2">No LoRAs found.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {modelsData?.loras?.map(model => (
                            <div key={model.name} className="flex items-center justify-between p-3 rounded-md bg-secondary/50 border border-border hover:border-primary/50 transition-colors">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="h-8 w-8 rounded bg-accent/20 flex items-center justify-center flex-shrink-0">
                                  <Layers className="h-4 w-4 text-accent" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate" title={model.name}>{model.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{formatSize(model.size_mb)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </Card>

          {/* Right Column: Upload */}
          <Card className="h-full flex flex-col bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-primary" /> Upload Model
              </CardTitle>
              <CardDescription>
                Add new checkpoints or LoRAs (.safetensors)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col">
              
              <div 
                className={cn(
                  "flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center transition-all mb-6",
                  dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/20",
                  selectedFile ? "border-solid border-primary/50 bg-secondary/30" : ""
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".safetensors,.ckpt,.pt,.bin"
                  onChange={handleFileChange}
                />
                
                {selectedFile ? (
                  <div className="flex flex-col items-center w-full">
                    <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                      <File className="h-8 w-8 text-primary" />
                    </div>
                    <p className="font-medium text-sm break-all w-full mb-1">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}>
                      Clear Selection
                    </Button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="font-medium mb-1">Click to browse or drag file here</p>
                    <p className="text-xs text-muted-foreground max-w-[200px]">
                      Supports .safetensors, .ckpt files
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-4 mb-6">
                <Label className="text-sm font-medium">Model Type</Label>
                <RadioGroup 
                  value={uploadType} 
                  onValueChange={(val) => setUploadType(val as UploadModelRequestModelType)}
                  className="grid grid-cols-2 gap-4"
                  disabled={uploadMutation.isPending}
                >
                  <div>
                    <RadioGroupItem value="checkpoint" id="checkpoint" className="peer sr-only" />
                    <Label
                      htmlFor="checkpoint"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-border bg-transparent p-3 hover:bg-secondary hover:text-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 [&:has([data-state=checked])]:border-primary cursor-pointer"
                    >
                      <HardDrive className="mb-2 h-5 w-5" />
                      <span className="text-sm font-medium">Checkpoint</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="lora" id="lora" className="peer sr-only" />
                    <Label
                      htmlFor="lora"
                      className="flex flex-col items-center justify-between rounded-md border-2 border-border bg-transparent p-3 hover:bg-secondary hover:text-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 [&:has([data-state=checked])]:border-primary cursor-pointer"
                    >
                      <Layers className="mb-2 h-5 w-5" />
                      <span className="text-sm font-medium">LoRA</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {uploadProgress > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              <Button 
                className="w-full font-bold tracking-wide" 
                size="lg"
                disabled={!selectedFile || uploadMutation.isPending}
                onClick={handleUpload}
              >
                {uploadMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full"></div>
                    UPLOADING...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <UploadCloud className="h-5 w-5" />
                    START UPLOAD
                  </span>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

