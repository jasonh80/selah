"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "air", label: "Air", swatch: "#7e97b5" },
  { id: "sonrise", label: "Sonrise", swatch: "#e0b878" },
  { id: "living-water", label: "Living Water", swatch: "#1f86d6" },
  { id: "garden", label: "Garden", swatch: "#5f7153" },
  { id: "sonset", label: "Sonset", swatch: "#c98c4a" },
  { id: "starlight", label: "Starlight", swatch: "#8e6be8" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

// Starlight is the default first impression; a saved preference always wins.
const DEFAULT_THEME: ThemeId = "starlight";

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}>({ theme: DEFAULT_THEME, setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy init from a saved preference (client) to avoid a theme flash.
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selah-theme") as ThemeId | null;
      if (saved) return saved;
    }
    return DEFAULT_THEME;
  });

  // Restore saved theme (covers any post-mount case)
  useEffect(() => {
    const saved = localStorage.getItem("selah-theme") as ThemeId | null;
    if (saved) setTheme(saved);
  }, []);

  // Reflect to <html data-theme> + persist
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("selah-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
