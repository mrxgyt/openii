import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { RightSidebar } from "./RightSidebar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      <RightSidebar />
    </div>
  );
}
