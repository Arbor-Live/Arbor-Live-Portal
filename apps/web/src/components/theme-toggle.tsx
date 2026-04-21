"use client";

import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      className={cn("justify-start", className)}
      onClick={() =>
        setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")
      }
    >
      Theme: {theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
    </Button>
  );
}
