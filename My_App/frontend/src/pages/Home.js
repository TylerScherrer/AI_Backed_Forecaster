import { useEffect, useRef, useState } from "react";
import StoreSelector from "../components/StoreSelector";
import { fetchStores } from "../api/storeService";
import { fetchForecast, explainForecast } from "../api/forecastService";
import {
  Box, Container, Flex, IconButton, Text, Grid, GridItem, Button, useDisclosure,
  Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerOverlay, Alert, AlertIcon,
  HStack, Progress, Spinner, useToast,
} from "@chakra-ui/react";
import { ArrowBackIcon, ArrowForwardIcon } from "@chakra-ui/icons";
import ForecastChart from "../components/ForecastChart";
import CategoryBreakdownChart from "../components/CategoryBreakdownChart";
import AIInsight from "../components/AIInsight";
import { API_BASE } from "../api/base";

/* ---------------- Inline loader components ---------------- */
function LoadingStoresCard({ etaMs = 1500, label = "Loading stores…" }) {
  const start = useRef(Date.now());
  const [remaining, setRemaining] = useState(etaMs);
  useEffect(() => {
    start.current = Date.now();
    setRemaining(etaMs);
    const id = setInterval(() => {
      const elapsed = Date.now() - start.current;
      setRemaining(Math.max(0, etaMs - elapsed));
    }, 100);
    return () => clearInterval(id);
  }, [etaMs]);
  const pct = etaMs > 0 ? Math.min(100, ((etaMs - remaining) / etaMs) * 100) : 0;
  const fmt = (ms) => `${Math.max(0, ms / 1000).toFixed(1)}s`;
  return (
    <Box p={4} borderWidth="1px" borderRadius="xl" bg="white" shadow="sm">
      <HStack spacing={3} mb={3}>
        <Spinner size="sm" />
        <Text fontWeight="semibold">
          {label} • ETA: {fmt(remaining)}
        </Text>
      </HStack>
      <Progress value={pct} size="sm" isAnimated hasStripe />
      <Text mt={2} fontSize="sm" color="gray.600">
        {label.toLowerCase().includes("forecast")
          ? "First request after a cold start can take ~30–60s while the API warms and loads artifacts."
          : "Preparing store list. This depends on network speed."}
      </Text>
    </Box>
  );
}

// Keeping this here for reference, but we won't render it anymore.
// function RefreshingBar({ etaMs = 1500 }) { ... }

/* ---------------- Page ---------------- */
export default function Home() {
  const toast = useToast();

  // Focus popup from chart
  const [focusPoint, setFocusPoint] = useState(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusSummary, setFocusSummary] = useState("");

  // Stores + selection
  const [storeList, setStoreList] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null); // keep option or id

  // Data
  const [timeline, setTimeline] = useState([]);
  const [history, setHistory] = useState([]);
  const [forecast, setForecast] = useState([]);

  // AI (right panel)
  const [summary, setSummary] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);

  // View toggle
  const graphViews = ["total", "category"];
  const [graphViewIndex, setGraphViewIndex] = useState(0);
  const drawer = useDisclosure();

  // Loading UX for stores
  const [loadingStores, setLoadingStores] = useState(true);
  const [refreshingStores, setRefreshingStores] = useState(false);
  const [storesError, setStoresError] = useState("");
  const usedCacheRef = useRef(false);
  const [etaMs, setEtaMs] = useState(Number(localStorage.getItem("storesLoadEMA")) || 1500);

  const STORES_CACHE_KEY = "storesCache:v3";
  const STORES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const STORES_ETA_KEY = "storesLoadEMA";

  const updateEma = (duration) => {
    const prev = Number(localStorage.getItem(STORES_ETA_KEY)) || 1500;
    const ema = Math.round(prev * 0.7 + duration * 0.3);
    localStorage.setItem(STORES_ETA_KEY, String(ema));
    setEtaMs(ema);
  };

  // NEW: Forecast/AI loaders with ETA (persisted EMA)
  const FORECAST_ETA_KEY = "forecastLoadEMA";
  const AI_ETA_KEY = "aiLoadEMA";
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [etaForecast, setEtaForecast] = useState(
    Number(localStorage.getItem(FORECAST_ETA_KEY)) || 25000
  );
  const [etaAi, setEtaAi] = useState(
    Number(localStorage.getItem(AI_ETA_KEY)) || 8000
  );
  const updateForecastEma = (duration) => {
    const prev = Number(localStorage.getItem(FORECAST_ETA_KEY)) || 25000;
    const ema = Math.round(prev * 0.7 + duration * 0.3);
    localStorage.setItem(FORECAST_ETA_KEY, String(ema));
    setEtaForecast(ema);
  };
  const updateAiEma = (duration) => {
    const prev = Number(localStorage.getItem(AI_ETA_KEY)) || 8000;
    const ema = Math.round(prev * 0.7 + duration * 0.3);
    localStorage.setItem(AI_ETA_KEY, String(ema));
    setEtaAi(ema);
  };

  // 1) Load store list (cache-first + background refresh)
  useEffect(() => {
    let cancelled = false;

    const readCacheIfFresh = () => {
      try {
        const raw = localStorage.getItem(STORES_CACHE_KEY);
        if (!raw) return false;
        const { data, ts } = JSON.parse(raw);
        if (!Array.isArray(data) || !ts) return false;
        if (Date.now() - ts < STORES_CACHE_TTL_MS) {
          setStoreList(data);
          setLoadingStores(false);
          usedCacheRef.current = true;
          return true;
        }
      } catch {}
      return false;
    };

    const fetchAndRecord = async (showSpinner) => {
      if (showSpinner) setLoadingStores(true);
      setStoresError("");
      const started = Date.now();
      try {
        const stores = await fetchStores({ min_year: 2020, min_points: 5 });
        const list = Array.isArray(stores) ? stores : (stores?.stores || stores || []);
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
        const duration = Date.now() - started;
        if (!cancelled) {
          updateEma(duration);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) When a store is chosen, load history + forecast and ask AI
  useEffect(() => {
    if (!selectedStore) return;

    setFocusPoint(null);
    setFocusSummary("");
    setFocusLoading(false);

    const run = async () => {
      try {
        const id = Number(selectedStore?.value ?? selectedStore);

        // ---- Forecast (now tracked with ETA) ----
        setLoadingForecast(true);
        const t0 = Date.now();
        const data = await fetchForecast(id); // GET { history, forecast }
        updateForecastEma(Date.now() - t0);
        setLoadingForecast(false);

        // Normalize to a single timeline for charts & AI
        const historyData = Array.isArray(data.history) ? data.history : [];
        const forecastData = Array.isArray(data.forecast)
          ? data.forecast
          : data.forecast
          ? [data.forecast]
          : [];

        const histPoints = historyData.map((d) => ({
          date: (d.date || "").slice(0, 10), // "YYYY-MM-DD"
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

        setHistory(histPoints);
        setForecast(fcstPoints);
        setTimeline(combined);

        // ---- AI (now tracked with ETA) ----
        setLoadingInsight(true);
        const t1 = Date.now();
        const ai = await explainForecast(
          combined.map((p) => ({ date: p.date, value: p.total, source: p.source }))
        ).catch(() => ({ summary: "" }));
        updateAiEma(Date.now() - t1);
        setLoadingInsight(false);

        setSummary(ai.summary || "");
      } catch (err) {
        console.error("❌ Failed to load forecast:", err);
        setHistory([]);
        setForecast([]);
        setTimeline([]);
        setSummary("");
        setLoadingForecast(false);
        setLoadingInsight(false);
        toast({ title: "Failed to load forecast", description: String(err), status: "error" });
      }
    };
    run();
  }, [selectedStore, toast]);

  // Point-and-explain click handler from the chart
  const handlePointSelect = async (pt) => {
    toast({
      title: "Point selected",
      description: `${new Date(pt.date).toLocaleDateString()} • ${pt.source} • ${
        pt.value?.toLocaleString?.() ?? pt.total
      }`,
      status: "info",
      duration: 1200,
      isClosable: true,
      position: "bottom-left",
    });

    const focus = { date: pt.date, value: pt.value ?? pt.total, source: pt.source || "actual" };
    setFocusPoint({ ...pt });
    setFocusLoading(true);
    setFocusSummary("Analyzing…");
    try {
      const ai = await explainForecast(
        timeline.map((p) => ({ date: p.date, value: p.total, source: p.source })),
        focus
      );
      setFocusSummary(ai.summary || "No insight available.");
    } catch (e) {
      setFocusSummary("Failed to fetch insight.");
    } finally {
      setFocusLoading(false);
    }
  };

  const handleClosePopup = () => {
    setFocusPoint(null);
    setFocusSummary("");
    setFocusLoading(false);
  };

  const handleGraphViewChange = (direction) => {
    const next =
      direction === "prev"
        ? (graphViewIndex - 1 + graphViews.length) % graphViews.length
        : (graphViewIndex + 1) % graphViews.length;
    setGraphViewIndex(next);
    // keep right-panel AI aligned with current timeline
    (async () => {
      setLoadingInsight(true);
      const t = Date.now();
      try {
        const ai = await explainForecast(
          timeline.map((p) => ({ date: p.date, value: p.total, source: p.source }))
        );
        updateAiEma(Date.now() - t);
        setSummary(ai.summary || "");
      } finally {
        setLoadingInsight(false);
      }
    })();
  };

  // Retry refresh if cache was used
  const retryRefresh = async () => {
    setRefreshingStores(true);
    setStoresError("");
    const started = Date.now();
    try {
      const stores = await fetchStores({ min_year: 2020, min_points: 5 });
      const list = Array.isArray(stores) ? stores : stores?.stores || stores || [];
      setStoreList(list);
      localStorage.setItem(STORES_CACHE_KEY, JSON.stringify({ data: list, ts: Date.now() }));
    } catch (e) {
      setStoresError(`Refresh failed; showing cached list. (${e?.message || "Network error"})`);
    } finally {
      const duration = Date.now() - started;
      updateEma(duration);
      setRefreshingStores(false);
    }
  };

  return (
    <Container maxW="7xl" py={6}>
      <Grid templateColumns={{ base: "1fr", lg: "2fr 1fr" }} gap={6} alignItems="start">
        <GridItem>
          <Box mb={6}>
            {storesError && !usedCacheRef.current ? (
              <Alert status="error" borderRadius="lg" mb={4}>
                <AlertIcon />
                {storesError}
                <Button ml={4} size="sm" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </Alert>
            ) : loadingStores ? (
              <LoadingStoresCard etaMs={etaMs} label="Loading stores…" />
            ) : storeList.length === 0 ? (
              <Alert status="warning" borderRadius="lg">
                <AlertIcon />
                No stores were returned by the server.
              </Alert>
            ) : (
              <>
                <StoreSelector
                  storeList={storeList}
                  selectedStore={selectedStore}
                  setSelectedStore={setSelectedStore}
                />
                {storesError && usedCacheRef.current && (
                  <HStack mt={2} spacing={3}>
                    <Text fontSize="sm" color="orange.700">
                      {storesError}
                    </Text>
                    <Button size="xs" onClick={retryRefresh}>
                      Retry refresh
                    </Button>
                  </HStack>
                )}
                {/* Previously: {refreshingStores && <RefreshingBar etaMs={etaMs} />} */}
              </>
            )}
          </Box>

          {/* NEW: Inline loaders for Forecast / AI */}
          {loadingForecast ? (
            <Box mb={4}>
              <LoadingStoresCard label="Loading Forecast…" etaMs={etaForecast} />
            </Box>
          ) : loadingInsight ? (
            <Box mb={4}>
              <LoadingStoresCard label="Generating AI Insight…" etaMs={etaAi} />
            </Box>
          ) : null}

          <Flex justify="center" align="center" mb={3} gap={2}>
            <IconButton
              icon={<ArrowBackIcon />}
              onClick={() => handleGraphViewChange("prev")}
              aria-label="Prev"
              size="sm"
            />
            <Text fontWeight="bold" fontSize="lg">
              {graphViews[graphViewIndex] === "total"
                ? "Sales Growth + Forecast"
                : "Category Breakdown"}
            </Text>
            <IconButton
              icon={<ArrowForwardIcon />}
              onClick={() => handleGraphViewChange("next")}
              aria-label="Next"
              size="sm"
            />
          </Flex>

          <Box maxW="800px" mx="auto" position="relative" zIndex={0}>
            {graphViews[graphViewIndex] === "total" ? (
              <ForecastChart
                history={history}
                forecast={forecast}
                height={360}
                onPointSelect={handlePointSelect}
                focusPoint={focusPoint}
                focusSummary={focusSummary}
                focusLoading={focusLoading}
                onClosePopup={handleClosePopup}
              />
            ) : (
              <CategoryBreakdownChart history={history} />
            )}
          </Box>
        </GridItem>

        <GridItem display={{ base: "none", lg: "block" }}>
          <Box w="720px" position="sticky" top="80px">
            <AIInsight
              summary={summary}
              loading={loadingInsight}
              boxProps={{ maxH: "90vh", overflowY: "auto" }}
            />
            <Text mt={2} fontSize="xs" color="gray.500">
              API: {API_BASE}
            </Text>
          </Box>
        </GridItem>
      </Grid>

      <Button
        display={{ base: "inline-flex", lg: "none" }}
        position="fixed"
        right={4}
        bottom={4}
        colorScheme="purple"
        onClick={drawer.onOpen}
      >
        AI Insight
      </Button>
      <Drawer isOpen={drawer.isOpen} placement="right" onClose={drawer.onClose} size="sm">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader>AI Insight</DrawerHeader>
          <DrawerBody>
            <AIInsight summary={summary} loading={loadingInsight} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Container>
  );
}
