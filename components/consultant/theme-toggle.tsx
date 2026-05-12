"use client";

import { Moon, Sun } from "lucide-react";
import type { Theme } from "@/lib/theme";

interface Props {
  current: Theme;
  redirectTo: string;
}

export function ThemeToggle({ current, redirectTo }: Props) {
  const next: Theme = current === "dark" ? "light" : "dark";
  return (
    <form action="/auth/theme" method="post" className="contents">
      <input type="hidden" name="theme" value={next} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <button
        type="submit"
        aria-label={`Switch to ${next} mode`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        {current === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </form>
  );
}
