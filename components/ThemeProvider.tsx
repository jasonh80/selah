"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "air", label: "Air", swatch: "#5b3f91" },
  { id: "sonrise", label: "Sonrise", swatch: "#e6b35a" },
  { id: "living-water", label: "Living Water", swatch: "#3f8794" },
  { id: "forest", label: "Forest", swatch: "#4f6f52" },
  { id: "sonset", label: "Sonset", swatch: "#c46a4a" },
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
