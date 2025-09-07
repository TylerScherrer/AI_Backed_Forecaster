// src/hooks/useStores.js
import { useEffect, useRef, useState } from "react";
import { fetchStores } from "../api/storeService";

const STORES_CACHE_KEY = "storesCache:v3";
const STORES_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const STORES_ETA_KEY = "storesLoadEMA";

export function useStores() {
  const [storeList, setStoreList] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [refreshingStores, setRefreshingStores] = useState(false);
  const [storesError, setStoresError] = useState("");
  const usedCacheRef = useRef(false);

  const [etaMs, setEtaMs] = useState(
    Number(localStorage.getItem(STORES_ETA_KEY)) || 1500
  );

  const updateEma = (durationMs) => {
    const prev = Number(localStorage.getItem(STORES_ETA_KEY)) || 1500;
    const ema = Math.round(prev * 0.7 + durationMs * 0.3);
    localStorage.setItem(STORES_ETA_KEY, String(ema));
    setEtaMs(ema);
  };

  useEffect(() => {
    let cancelled = false;

    const readCacheIfFresh = () => {
      try {
        const raw = localStorage.getItem(STORES_CACHE_KEY);
        if (!raw) return false;
        const { data, ts } = JSON.parse(raw);
        if (!Array.isArray(data) || !ts) return false;
        if (Date.now() - ts < STORES_CACHE_TTL_MS) {
          if (!cancelled) {
            setStoreList(data);
            setLoadingStores(false);
            usedCacheRef.current = true;
          }
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    };

    const fetchAndRecord = async (showSpinner) => {
      if (showSpinner) setLoadingStores(true);
      setStoresError("");
      const t0 = Date.now();
      try {
        
        const stores = await fetchStores({
        min_year: 2023,            // optional, but sensible with your dataset
        min_points: 1,             // optional: if you only need Aug present, 1 is enough
        must_have_month: "2023-08" // <- only stores with August 2023 data
        });

        const list = Array.isArray(stores) ? stores : stores?.stores || stores || [];
        if (!cancelled) {
          setStoreList(list);
          localStorage.setItem(STORES_CACHE_KEY, JSON.stringify({ data: list, ts: Date.now() }));
        }
      } catch (e) {
        if (!cancelled) {
          setStoresError(
            usedCacheRef.current
              ? `Refresh failed; showing cached list. (${e?.message || "Network error"})`
              : `Failed to load stores. (${e?.message || "Network error"})`
          );
        }
      } finally {
        if (!cancelled) {
          updateEma(Date.now() - t0);
          setLoadingStores(false);
          setRefreshingStores(false);
        }
      }
    };

    const hadCache = readCacheIfFresh();
    setRefreshingStores(hadCache);
    fetchAndRecord(!hadCache);

    return () => {
      cancelled = true;
    };
  }, []);

  const retryRefresh = async () => {
    setRefreshingStores(true);
    setStoresError("");
    const t0 = Date.now();
    try {
      const stores = await fetchStores({ min_year: 2020, min_points: 5 });
      const list = Array.isArray(stores) ? stores : stores?.stores || stores || [];
      setStoreList(list);
      localStorage.setItem(STORES_CACHE_KEY, JSON.stringify({ data: list, ts: Date.now() }));
    } catch (e) {
      setStoresError(`Refresh failed; showing cached list. (${e?.message || "Network error"})`);
    } finally {
      updateEma(Date.now() - t0);
      setRefreshingStores(false);
    }
  };

  return {
    storeList,
    loadingStores,
    refreshingStores,
    storesError,
    retryRefresh,
    usedCacheRef,   // ref so you can check if cache was used
    etaMs,
  };
}
