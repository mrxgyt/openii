import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GenerationProvider } from "@/contexts/GenerationContext";
import NotFound from "@/pages/not-found";
import Workspace from "@/pages/Workspace";
import Models from "@/pages/Models";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Workspace} />
      <Route path="/models" component={Models} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GenerationProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
          <SonnerToaster theme="dark" position="top-center" />
        </TooltipProvider>
      </GenerationProvider>
    </QueryClientProvider>
  );
}

export default App;
