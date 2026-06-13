"use client";

import { createContext, useContext, useEffect, useState } from "react";

// UI-only Bible version preference. No Bible API wired — this just remembers
// the user's chosen translation across routes (localStorage).
export const VERSIONS = ["ESV", "NIV", "KJV", "NLT", "CSB", "NKJV", "NASB"] as const;
export type Version = (typeof VERSIONS)[number];

const VersionContext = createContext<{
  version: Version;
  setVersion: (v: Version) => void;
}>({ version: "ESV", setVersion: () => {} });

export function VersionProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState<Version>("ESV");

  useEffect(() => {
    const saved = localStorage.getItem("selah-version") as Version | null;
    if (saved && (VERSIONS as readonly string[]).includes(saved)) setVersion(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("selah-version", version);
  }, [version]);

  return (
    <VersionContext.Provider value={{ version, setVersion }}>{children}</VersionContext.Provider>
  );
}

export const useVersion = () => useContext(VersionContext);
