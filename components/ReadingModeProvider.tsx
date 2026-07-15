"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Quick Dive (default): study cards stay collapsed; the user opens what they
// want. Deep Dive: study cards expand for a continuous read. Persisted locally.
//
// Selah Focus (layout spec §16) is a separate, orthogonal switch: it dims the
// app chrome for an undistracted study state. It never changes quick/deep, is
// per-visit (not persisted), and is applied via [data-focus] on <html> so any
// chrome element can opt in with the .selah-chrome class.
export type ReadingMode = "quick" | "deep";

const ReadingModeContext = createContext<{
  mode: ReadingMode;
  setMode: (m: ReadingMode) => void;
  focus: boolean;
  setFocus: (on: boolean) => void;
}>({ mode: "quick", setMode: () => {}, focus: false, setFocus: () => {} });

export function ReadingModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ReadingMode>("quick");
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("selah-reading-mode") as ReadingMode | null;
    if (saved === "quick" || saved === "deep") setMode(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("selah-reading-mode", mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.focus = focus ? "on" : "off";
    return () => {
      delete document.documentElement.dataset.focus;
    };
  }, [focus]);

  return (
    <ReadingModeContext.Provider value={{ mode, setMode, focus, setFocus }}>
      {children}
    </ReadingModeContext.Provider>
  );
}

export const useReadingMode = () => useContext(ReadingModeContext);
