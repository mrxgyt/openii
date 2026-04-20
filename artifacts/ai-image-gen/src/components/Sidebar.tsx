import { Link, useLocation } from "wouter";
import { Image as ImageIcon, Database, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Workspace", icon: ImageIcon },
    { href: "/models", label: "Models", icon: Database },
  ];

  return (
    <div className="w-16 md:w-64 border-r bg-sidebar flex flex-col h-full flex-shrink-0 transition-all duration-300">
      <div className="p-4 border-b h-14 flex items-center justify-center md:justify-start">
        <div className="bg-primary/20 p-1.5 rounded-md text-primary mr-0 md:mr-3">
          <ImageIcon size={20} />
        </div>
        <h1 className="font-mono font-bold tracking-tight text-lg hidden md:block text-foreground">
          NEURAL<span className="text-primary">GEN</span>
        </h1>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center p-3 rounded-md cursor-pointer transition-colors group",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon
                  size={20}
                  className={cn(
                    "flex-shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="ml-3 hidden md:block">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground hidden md:block font-mono">
        v1.0.4-beta
      </div>
    </div>
  );
}
