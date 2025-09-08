// src/utils/hydrateGlossary.js
import React from "react";
import GlossaryPopover from "../components/GlossaryPopover";
import { GLOSSARY } from "./glossary";

export function hydrateGlossary(text) {
  if (!text) return text;
  const tokens = text.split(/(\b)/); // keep word boundaries
  return tokens.map((t, i) => {
    const key = Object.keys(GLOSSARY).find(k => t === k);
    return key
      ? <GlossaryPopover key={i} term={key} description={GLOSSARY[key]}>{key}</GlossaryPopover>
      : t;
  });
}
