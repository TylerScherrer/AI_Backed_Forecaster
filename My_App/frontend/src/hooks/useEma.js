import { useState } from "react";

export function useEma(key, initial) {
  const start = Number(localStorage.getItem(key)) || initial;
  const [ema, setEma] = useState(start);

  const updateEma = (durationMs) => {
    const prev = Number(localStorage.getItem(key)) || initial;
    const next = Math.round(prev * 0.7 + durationMs * 0.3);
    localStorage.setItem(key, String(next));
    setEma(next);
  };

  return [ema, updateEma, setEma];
}
