"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Quick Dive (default): study cards stay collapsed; the user opens what they
// want. Deep Dive: study cards expand for a continuous read. Persisted locally.
export type ReadingMode = "quick" | "deep";

const ReadingModeContext = createContext<{
  mode: ReadingMode;
  setMode: (m: ReadingMode) => void;
}>({ mode: "quick", setMode: () => {} });

export function ReadingModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ReadingMode>("quick");

  useEffect(() => {
    const saved = localStorage.getItem("selah-reading-mode") as ReadingMode | null;
    if (saved === "quick" || saved === "deep") setMode(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("selah-reading-mode", mode);
  }, [mode]);

  return (
    <ReadingModeContext.Provider value={{ mode, setMode }}>{children}</ReadingModeContext.Provider>
  );
}

export const useReadingMode = () => useContext(ReadingModeContext);
