// src/hooks/useForecast.js
import { useEffect, useRef, useState } from "react";
import { fetchForecast, explainForecast } from "../api/forecastService";

const FORECAST_ETA_KEY = "forecastLoadEMA";
const AI_ETA_KEY = "aiLoadEMA";

export function useForecast(selectedStore, { onError } = {}) {
  const activeReqRef = useRef(0);

  const [history, setHistory] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [timeline, setTimeline] = useState([]);

  const [summary, setSummary] = useState("");
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const [etaForecast, setEtaForecast] = useState(
    Number(localStorage.getItem(FORECAST_ETA_KEY)) || 25000
  );
  const [etaAi, setEtaAi] = useState(
    Number(localStorage.getItem(AI_ETA_KEY)) || 8000
  );

  const updateForecastEma = (durationMs) => {
    const prev = Number(localStorage.getItem(FORECAST_ETA_KEY)) || 25000;
    const ema = Math.round(prev * 0.7 + durationMs * 0.3);
    localStorage.setItem(FORECAST_ETA_KEY, String(ema));
    setEtaForecast(ema);
  };
  const updateAiEma = (durationMs) => {
    const prev = Number(localStorage.getItem(AI_ETA_KEY)) || 8000;
    const ema = Math.round(prev * 0.7 + durationMs * 0.3);
    localStorage.setItem(AI_ETA_KEY, String(ema));
    setEtaAi(ema);
  };

  useEffect(() => {
    const idVal = Number(selectedStore?.value ?? selectedStore);
    if (!idVal) {
      // reset if nothing selected
      setHistory([]);
      setForecast([]);
      setTimeline([]);
      setSummary("");
      setLoadingForecast(false);
      setLoadingInsight(false);
      return;
    }

    const reqId = ++activeReqRef.current;

    (async () => {
      try {
        // Forecast
        setLoadingForecast(true);
        const t0 = Date.now();
        const data = await fetchForecast(idVal);
        if (reqId !== activeReqRef.current) return; // stale
        updateForecastEma(Date.now() - t0);
        setLoadingForecast(false);

        const historyData = Array.isArray(data.history) ? data.history : [];
        const forecastData = Array.isArray(data.forecast)
          ? data.forecast
          : data.forecast
          ? [data.forecast]
          : [];

        const histPoints = historyData.map((d) => ({
          date: (d.date || "").slice(0, 10),
          total: Number(d.total_sales ?? d.total ?? d.value ?? 0),
          source: "actual",
          categories: d.categories || null,
        }));
        const fcstPoints = forecastData.map((d) => ({
          date: ((d.date || "").length === 7 ? `${d.date}-01` : d.date).slice(0, 10),
          total: Number(d.sales ?? d.total ?? d.value ?? 0),
          source: "forecast",
        }));
        const combined = [...histPoints, ...fcstPoints].filter((p) => Number.isFinite(p.total));

        if (reqId !== activeReqRef.current) return; // stale
        setHistory(histPoints);
        setForecast(fcstPoints);
        setTimeline(combined);

        // AI – total timeline summary
        setLoadingInsight(true);
        const t1 = Date.now();
        const ai = await explainForecast(
          combined.map((p) => ({ date: p.date, value: p.total, source: p.source }))
        ).catch(() => ({ summary: "" }));
        if (reqId !== activeReqRef.current) return; // stale
        updateAiEma(Date.now() - t1);
        setLoadingInsight(false);
        setSummary(ai.summary || "");
      } catch (e) {
        if (reqId !== activeReqRef.current) return; // stale
        setLoadingForecast(false);
        setLoadingInsight(false);
        setSummary("");
        if (typeof onError === "function") onError(e);
      }
    })();

    // invalidate any late responses on next selection
    return () => {
      activeReqRef.current++;
    };
  }, [selectedStore]); // only when selection changes

  return {
    history,
    forecast,
    timeline,
    summary,
    setSummary,
    loadingForecast,
    loadingInsight,
    etaForecast,
    etaAi,
  };
}
