import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Container, HStack, Text, Button, useDisclosure,
  Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerOverlay,
  Alert, AlertIcon, useToast, Divider, Skeleton, IconButton,
} from "@chakra-ui/react";
import { ArrowBackIcon, ArrowForwardIcon } from "@chakra-ui/icons";

import { API_BASE } from "../api/base";
import { explainForecast } from "../api/forecastService";
import { useStores } from "../hooks/useStores";
import { useForecast } from "../hooks/useForecast";

import StoreSelector from "../components/StoreSelector";
import ForecastChart from "../components/ForecastChart";
import CategoryBreakdownChart from "../components/CategoryBreakdownChart";
import AIInsight from "../components/AIInsight";
import LoaderCard from "../components/LoaderCard";

// Settings (style + level)
import { SettingsProvider, useSettings } from "../context/SettingsContext";

/* ---------------- helpers ---------------- */
const fmtUSD = (n) =>
  typeof n === "number"
    ? n.toLocaleString(undefined, { style: "currency", currency: "USD" })
    : "—";

// robust value picker for mixed shapes
const pickNumber = (p) => {
  const raw = p?.value ?? p?.total ?? p?.sales ?? p?.amount ?? p?.y ?? 0;
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  return Number.isFinite(n) ? n : 0;
};

/* ---------- deterministic fallback narrative ---------- */
function makeDeterministicInsight(timeline = []) {
  const rows = (timeline || [])
    .map((p) => ({ date: p.date, value: pickNumber(p) }))
    .filter((p) => p.date && Number.isFinite(p.value));
  if (rows.length < 2) return "";

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  const ym = (d) => String(d || "").slice(0, 7);
  const lastYYYYMM = ym(last.date);
  const lastYearYYYYMM = `${String(Number(lastYYYYMM.slice(0, 4)) - 1)}-${lastYYYYMM.slice(5, 7)}`;
  const yoyRow = rows.find((r) => ym(r.date) === lastYearYYYYMM);

  const momAbs = last.value - prev.value;
  const momPct = prev.value ? (momAbs / prev.value) * 100 : 0;

  const yoyAbs = yoyRow ? last.value - yoyRow.value : null;
  const yoyPct = yoyRow && yoyRow.value ? (yoyAbs / yoyRow.value) * 100 : null;

  const vals = rows.map((r) => r.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  const bullets = [
    `The latest month is ${fmtUSD(last.value)}.`,
    `Month-over-month: ${momAbs >= 0 ? "up" : "down"} ${fmtUSD(Math.abs(momAbs))} (${momPct.toFixed(2)}%).`,
    yoyRow != null
      ? `Year-over-year vs ${yoyRow.date.slice(0, 7)}: ${yoyAbs >= 0 ? "up" : "down"} ${fmtUSD(Math.abs(yoyAbs))} (${yoyPct.toFixed(2)}%).`
      : `Year-over-year comparison for this month is not available in the current range.`,
    `Recent range: low ${fmtUSD(min)} to high ${fmtUSD(max)}.`,
  ];

  return bullets.map((b) => `• ${b}`).join("\n");
}

/* ---------- style + reading-level transform ---------- */
const normLevel = (lvl) => {
  const v = String(lvl || "").toLowerCase();
  if (["6th", "simple"].includes(v)) return "simple";
  if (["9th", "balanced", "default"].includes(v)) return "balanced";
  if (["12th", "advanced"].includes(v)) return "advanced";
  return "pro";
};

function applyLocalStyleAndLevel(text, style, level) {
  const L = normLevel(level);

  const splitNext = (t) => {
    const parts = String(t || "").split(/\n\s*\*\*?Next actions?:\*\*?\s*/i);
    return { body: (parts[0] || "").trim(), actions: (parts[1] || "").trim() };
  };
  const bulletsFrom = (s) =>
    String(s || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^[•*\-]\s*/, ""));

  let out = String(text || "");
  const { body, actions } = splitNext(out);
  const bodyLines = bulletsFrom(body);
  const actionLines = bulletsFrom(actions);

  const verby = (l) =>
    /^\b(Investigate|Analyze|Review|Check|Compare|Reduce|Increase|Monitor|Validate|Prioritize|Explore|Confirm)\b/i.test(
      l
    );

  // STYLE
  if (style === "actions") {
    const lines = actionLines.length ? actionLines : bodyLines.filter(verby);
    out = (lines.length ? lines : bodyLines).map((l) => `• ${l}`).join("\n");
  } else if (style === "narrative") {
    const sentences = (bodyLines.length ? bodyLines : actionLines)
      .map((l) =>
        l
          .replace(/\s*\((?:actual|forecast).*?\)\s*/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim()
      )
      .filter(Boolean);
    out = sentences.join(" ");
  } else {
    const lines = bodyLines.length ? bodyLines : actionLines;
    out = lines.map((l) => `• ${l}`).join("\n");
  }

  // LEVEL
  const roundMoney = (s) => s.replace(/\$?(\d{1,3}(?:,\d{3})+)(\.\d+)?/g, (_, d) => `$${d}`);
  const simplifyWords = (s) =>
    s
      .replace(/\b(decreased|decrease)\b/gi, "went down")
      .replace(/\b(increased|increase)\b/gi, "went up")
      .replace(/\b(approximately|approx)\b/gi, "about")
      .replace(/\b(investigate)\b/gi, "look into")
      .replace(/\b(analyze)\b/gi, "look at")
      .replace(/\b(determine)\b/gi, "find");

  if (L === "simple") {
    out = out.replace(/\([^)]*\)/g, "");
    out = simplifyWords(out);
    out = roundMoney(out);
    out = out
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim().split(/,|;|—|–/)[0])
      .join(" ");
  } else if (L === "balanced") {
    out = roundMoney(out);
  } else if (L === "advanced") {
    out = roundMoney(out);
  } // pro: untouched

  return out.trim();
}

/* ---------------- thin card ---------------- */
const CardShell = ({ title, right, children, ...props }) => (
  <Box borderWidth="1px" borderRadius="xl" bg="white" shadow="sm" p={4} {...props}>
    {(title || right) && (
      <HStack justify="space-between" mb={3}>
        {title ? <Text fontWeight="semibold">{title}</Text> : <span />}
        {right ?? null}
      </HStack>
    )}
    {children}
  </Box>
);

/* ---------------- KPI ---------------- */
const ForecastKPI = ({ loading, value }) => (
  <CardShell title="Forecast">
    {loading ? (
      <>
        <Skeleton height="28px" width="160px" mb={2} />
        <Skeleton height="10px" width="200px" />
      </>
    ) : (
      <>
        <Text fontSize="2xl" fontWeight="bold" mb={2}>
          {fmtUSD(value)}
        </Text>
        <Text fontSize="xs" color="gray.500">
          Based on latest month<br />+ model forecast
        </Text>
      </>
    )}
  </CardShell>
);

/* ---------------- Store card ---------------- */
function StoreSelectorCard({
  storeList, selectedStore, setSelectedStore,
  loadingStores, storesError, usedCacheRef, retryRefresh, etaMs,
}) {
  return (
    <CardShell title="Select a Store">
      {storesError && !usedCacheRef.current ? (
        <Alert status="error" borderRadius="lg" mb={3}>
          <AlertIcon />
          {storesError}
          <Button ml={4} size="sm" onClick={() => window.location.reload()}>Retry</Button>
        </Alert>
      ) : loadingStores ? (
        <LoaderCard etaMs={etaMs} label="Loading stores…" />
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
            <Text mt={2} fontSize="sm" color="orange.700">
              {storesError} <Button size="xs" ml={2} onClick={retryRefresh}>Retry refresh</Button>
            </Text>
          )}
        </>
      )}
    </CardShell>
  );
}

/** Inner page uses settings; outer default export wraps with SettingsProvider. */
function HomeInner() {
  const toast = useToast();
  const drawer = useDisclosure();
  const { explainStyle, readingLevel } = useSettings();

  // Stores
  const {
    storeList, loadingStores, storesError, retryRefresh, usedCacheRef, etaMs,
  } = useStores();
  const [selectedStore, setSelectedStore] = useState(null);

  // Forecast + AI
  const {
    history, forecast, timeline, summary,
    loadingForecast, loadingInsight, etaForecast, etaAi,
  } = useForecast(selectedStore, {
    onError: (err) =>
      toast({ title: "Failed to load forecast", description: String(err), status: "error" }),
  });

  // Category insight
  const [categoryInsight, setCategoryInsight] = useState("");

  // Fallback page-level forecast insight
  const [fallbackInsight, setFallbackInsight] = useState("");
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const fallbackReq = useRef(0);

  // Chart point popup (deep-dive)
  const [focusPoint, setFocusPoint] = useState(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusSummary, setFocusSummary] = useState("");
  const pointReqRef = useRef(0);

  // View toggle (Total vs Categories)
  const [graphViewIndex, setGraphViewIndex] = useState(0);
  const isCategoryView = ["total", "category"][graphViewIndex] === "category";

  // ---------- derive panel text/loading ----------
  const panelRaw = isCategoryView ? categoryInsight : (summary || fallbackInsight);

  const insightText = useMemo(
    () => applyLocalStyleAndLevel(panelRaw, explainStyle, readingLevel),
    [panelRaw, explainStyle, readingLevel]
  );

  const insightIsLoading = isCategoryView
    ? (!categoryInsight && history.length > 0)
    : (loadingInsight || fallbackLoading);

  useEffect(() => setCategoryInsight(""), [selectedStore, graphViewIndex]);

  // Auto-generate a Forecast insight for the panel if hook didn't provide one
  useEffect(() => {
    if (isCategoryView) return;
    if (!timeline?.length) return;
    if (summary && summary.trim()) {
      setFallbackInsight("");
      setFallbackLoading(false);
      return;
    }
    const id = ++fallbackReq.current;
    setFallbackLoading(true);

    const series = timeline.map((p) => ({ date: p.date, value: pickNumber(p), source: p.source }));
    const last = timeline[timeline.length - 1];
    const focus = { date: last.date, value: pickNumber(last), source: last.source || "actual" };

    (async () => {
      try {
        const ai = await explainForecast(series, focus, { explainStyle, readingLevel });
        if (id !== fallbackReq.current) return;
        const text = (ai?.summary || "").trim();
        setFallbackInsight(text || makeDeterministicInsight(series));
      } catch {
        if (id !== fallbackReq.current) return;
        setFallbackInsight(makeDeterministicInsight(series));
      } finally {
        if (id === fallbackReq.current) setFallbackLoading(false);
      }
    })();
  }, [isCategoryView, timeline, summary, explainStyle, readingLevel]);

  const toggleView = () => setGraphViewIndex((i) => 1 - i);

  const handlePointSelect = async (pt) => {
    const reqId = ++pointReqRef.current;
    setFocusPoint({ ...pt });
    setFocusLoading(true);
    setFocusSummary("Analyzing…");
    try {
      const series = (timeline || []).map((p) => ({ date: p.date, value: pickNumber(p), source: p.source }));
      const focus = { date: pt.date, value: typeof pt.value === "number" ? pt.value : pickNumber(pt), source: pt.source || "actual" };
      const ai = await explainForecast(series, focus, { explainStyle, readingLevel });
      if (reqId !== pointReqRef.current) return;
      setFocusSummary(ai?.summary || "No insight available.");
    } catch {
      if (reqId !== pointReqRef.current) return;
      setFocusSummary("Failed to fetch insight.");
    } finally {
      if (reqId === pointReqRef.current) setFocusLoading(false);
    }
  };

  const handleClosePopup = () => {
    pointReqRef.current++;
    setFocusPoint(null);
    setFocusSummary("");
    setFocusLoading(false);
  };

  // Manual regenerate for panel (↻ button)
  const handleRefetchInsight = () => {
    if (focusPoint) handlePointSelect(focusPoint); // refresh open popup too
    if (isCategoryView) return;

    setFallbackInsight("");
    fallbackReq.current++;
    setFallbackLoading(true);

    const series = (timeline || []).map((p) => ({ date: p.date, value: pickNumber(p), source: p.source }));
    const last = timeline?.[timeline.length - 1];
    if (!last) { setFallbackLoading(false); return; }

    (async () => {
      try {
        const ai = await explainForecast(
          series,
          { date: last.date, value: pickNumber(last), source: last.source || "actual" },
          { explainStyle, readingLevel }
        );
        const text = (ai?.summary || "").trim();
        setFallbackInsight(text || makeDeterministicInsight(series));
      } catch {
        setFallbackInsight(makeDeterministicInsight(series));
      } finally {
        setFallbackLoading(false);
      }
    })();
  };

  const forecastValue = useMemo(() => {
    if (!forecast?.length) return null;
    return pickNumber(forecast[0]);
  }, [forecast]);

  const insightTopic = isCategoryView ? "Category Mix Insight" : "Forecast Insight";

  // Children for AIInsight (render even if it ignores summary)
  const insightChildren = useMemo(() => {
    const s = String(insightText || "").trim();
    if (!s) return <Text fontSize="sm" color="gray.500">No insight yet. Try clicking a point on the chart.</Text>;
    const lines = s.split(/\r?\n/).filter(Boolean);
    const looksBulleted = lines.some((l) => /^[•*\-]\s/.test(l));
    if (looksBulleted) {
      return (
        <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
          {lines.map((l, i) => (
            <li key={i} style={{ marginBottom: 4 }}>{l.replace(/^[•*\-]\s/, "")}</li>
          ))}
        </ul>
      );
    }
    return <Text whiteSpace="pre-wrap">{s}</Text>;
  }, [insightText]);

  const aiKey = `${isCategoryView ? "cat" : "tot"}-${(insightText || "").length}`;

  return (
    <Container maxW="7xl" py={6} className="dashboard-grid">
      {/* LEFT COLUMN: top row (store + KPI) */}
      <Box className="dashboard-top">
        <StoreSelectorCard
          storeList={storeList}
          selectedStore={selectedStore}
          setSelectedStore={setSelectedStore}
          loadingStores={loadingStores}
          storesError={storesError}
          usedCacheRef={usedCacheRef}
          retryRefresh={retryRefresh}
          etaMs={etaMs}
        />
        <ForecastKPI loading={loadingForecast} value={forecastValue} />
      </Box>

      {/* LEFT COLUMN: chart under top row */}
      <Box className="dashboard-chart">
        <CardShell
          title={isCategoryView ? "Category Breakdown" : "Sales Growth + Forecast"}
          right={
            <HStack spacing={1}>
              <IconButton icon={<ArrowBackIcon />} aria-label="Prev" size="sm" variant="ghost" onClick={toggleView} />
              <IconButton icon={<ArrowForwardIcon />} aria-label="Next" size="sm" variant="ghost" onClick={toggleView} />
            </HStack>
          }
        >
          {loadingForecast ? (
            <LoaderCard etaMs={etaForecast} label="Loading Forecast…" />
          ) : insightIsLoading && !isCategoryView ? (
            <LoaderCard etaMs={etaAi} label="Generating AI Insight…" />
          ) : isCategoryView ? (
            <CategoryBreakdownChart
              key={`cat-${Number(selectedStore?.value ?? selectedStore) || 0}`}
              history={history}
              storeId={Number(selectedStore?.value ?? selectedStore) || 0}
              apiBase={API_BASE}
              onInsightText={setCategoryInsight}
            />
          ) : (
            <ForecastChart
              key={`tot-${Number(selectedStore?.value ?? selectedStore) || 0}`}
              history={history}
              forecast={forecast}
              height={380}
              onPointSelect={handlePointSelect}
              focusPoint={focusPoint}
              focusSummary={focusSummary}
              focusLoading={focusLoading}
              onClosePopup={handleClosePopup}
            />
          )}
        </CardShell>
      </Box>

      {/* RIGHT COLUMN: sticky AI panel */}
      <Box className="dashboard-right" display={{ base: "none", lg: "block" }}>
        <CardShell title="AI Insight">
          <AIInsight
            key={aiKey}
            topic={insightTopic}
            summary={insightText}
            loading={insightIsLoading}
            onRefetch={handleRefetchInsight}
            autoRefetch={false}
            boxProps={{ maxH: "58vh", overflowY: "auto", p: 0 }}
          >
            {insightChildren}
          </AIInsight>
          <Divider my={3} />
          <Text mt={1} fontSize="xs" color="gray.500">API: {API_BASE}</Text>
        </CardShell>
      </Box>

      {/* Mobile AI Drawer */}
      <Button
        display={{ base: "inline-flex", lg: "none" }}
        position="fixed" right={4} bottom={4}
        colorScheme="purple" onClick={drawer.onOpen} shadow="md" borderRadius="lg"
      >
        AI Insight
      </Button>
      <Drawer isOpen={drawer.isOpen} placement="right" onClose={drawer.onClose} size="sm">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader>AI Insight</DrawerHeader>
          <DrawerBody>
            <AIInsight
              key={`${aiKey}-mobile`}
              topic={insightTopic}
              summary={insightText}
              loading={insightIsLoading}
              onRefetch={handleRefetchInsight}
              autoRefetch={false}
            >
              {insightChildren}
            </AIInsight>
            <Text mt={3} fontSize="xs" color="gray.500">API: {API_BASE}</Text>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Container>
  );
}

// Wrap with SettingsProvider
export default function Home() {
  return (
    <SettingsProvider>
      <HomeInner />
    </SettingsProvider>
  );
}
