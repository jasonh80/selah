"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

export const THEMES = [
  { id: "air", label: "Air", swatch: "#7e97b5" },
  { id: "sonrise", label: "Sonrise", swatch: "#e0b878" },
  { id: "living-water", label: "Living Water", swatch: "#1f86d6" },
  { id: "garden", label: "Garden", swatch: "#5f7153" },
  { id: "sonset", label: "Sonset", swatch: "#c98c4a" },
  { id: "wilderness", label: "Wilderness", swatch: "#6b4a32" },
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
  // IQ-009: the first client render must MATCH the server render, so state
  // starts at the default on both — a lazy localStorage init here made the
  // saved theme leak into hydration (header label "Starlight" vs "Garden")
  // and threw React #425/#418/#423 on every chapter load for anyone with a
  // saved non-default theme. The pre-hydration inline script in app/layout
  // already sets <html data-theme> from localStorage BEFORE first paint, so
  // colors never flash; only the theme *label* updates after mount, exactly
  // like the version and reading-mode providers already behave.
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  // Restore saved theme after mount (hydration-safe).
  useEffect(() => {
    const saved = localStorage.getItem("selah-theme") as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) setTheme(saved);
  }, []);

  // Reflect to <html data-theme> + persist — but SKIP the first run: at that
  // point state is still the default while the inline script already painted
  // the saved theme; writing here would flash the default over it (and write
  // the default into localStorage over the saved preference).
  const reflected = useRef(false);
  useEffect(() => {
    if (!reflected.current) {
      reflected.current = true;
      return;
    }
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
