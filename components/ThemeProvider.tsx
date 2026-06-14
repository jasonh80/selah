"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "air", label: "Air", swatch: "#7e97b5" },
  { id: "sonrise", label: "Sonrise", swatch: "#e0b878" },
  { id: "living-water", label: "Living Water", swatch: "#5ebcc6" },
  { id: "garden", label: "Garden", swatch: "#5f7153" },
  { id: "sonset", label: "Sonset", swatch: "#c98c4a" },
  { id: "starlight", label: "Starlight", swatch: "#8e6be8" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}>({ theme: "air", setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>("air");

  // Restore saved theme
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
