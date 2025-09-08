// src/context/SettingsContext.js
import React, { createContext, useContext, useState } from "react";

const Ctx = createContext(null);

export function SettingsProvider({ children }) {
  // styles: bullets | narrative | actions
  const [explainStyle, setExplainStyle] = useState("narrative");

  // levels: simple | balanced | advanced | pro
  const [readingLevel, setReadingLevel] = useState("balanced");

  const value = {
    explainStyle, setExplainStyle,
    readingLevel, setReadingLevel,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider/>");
  return ctx;
}
