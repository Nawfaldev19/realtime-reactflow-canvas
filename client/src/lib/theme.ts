import { useCallback, useEffect, useState } from "react";
import { readStored, writeStored } from "./storage";

export type Theme = "light" | "dark";
const THEME_KEY = "live-canvas.theme";

function initialTheme(): Theme {
  const stored = readStored(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      writeStored(THEME_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
