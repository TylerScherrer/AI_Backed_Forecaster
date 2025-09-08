// src/pages/Home.js
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Container, HStack, Text, Grid, GridItem, Button, useDisclosure,
  Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerOverlay,
  Alert, AlertIcon, IconButton, useToast, Stack, Divider, Skeleton
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

/* ---------- helpers ---------- */
const fmtUSD = (n) =>
  typeof n === "number"
    ? n.toLocaleString(undefined, { style: "currency", currency: "USD" })
    : "—";

/* ---------- reusable thin card ---------- */
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

/* ---------- KPI ---------- */
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

/* ---------- NEW: left card that always shows ---------- */
function StoreSelectorCard({
  storeList,
  selectedStore,
  setSelectedStore,
  loadingStores,
  storesError,
  usedCacheRef,
  retryRefresh,
  etaMs,
}) {
  return (
    <CardShell title="Select a Store" minW="280px">
      {storesError && !usedCacheRef.current ? (
        <Alert status="error" borderRadius="lg" mb={3}>
          <AlertIcon />
          {storesError}
          <Button ml={4} size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
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
            <HStack mt={2} spacing={3}>
              <Text fontSize="sm" color="orange.700">
                {storesError}
              </Text>
              <Button size="xs" onClick={retryRefresh}>
                Retry refresh
              </Button>
            </HStack>
          )}
        </>
      )}
    </CardShell>
  );
}

export default function Home() {
  const toast = useToast();
  const drawer = useDisclosure();

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

  // Category insight (tab)
  const [categoryInsight, setCategoryInsight] = useState("");

  // Point popup
  const [focusPoint, setFocusPoint] = useState(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusSummary, setFocusSummary] = useState("");
  const pointReqRef = useRef(0);

  // View toggle
  const [graphViewIndex, setGraphViewIndex] = useState(0);
  const isCategoryView = ["total", "category"][graphViewIndex] === "category";
  const insightText = isCategoryView ? categoryInsight : summary;
  const insightIsLoading = isCategoryView ? !categoryInsight && history.length > 0 : loadingInsight;

  useEffect(() => setCategoryInsight(""), [selectedStore, graphViewIndex]);

  const handleGraphViewChange = (dir) =>
    setGraphViewIndex((i) => (dir === "prev" ? (i + 1) % 2 : (i + 1) % 2));

  const handlePointSelect = async (pt) => {
    const reqId = ++pointReqRef.current;
    setFocusPoint({ ...pt });
    setFocusLoading(true);
    setFocusSummary("Analyzing…");
    try {
      const series = timeline.map((p) => ({ date: p.date, value: p.total, source: p.source }));
      const focus = { date: pt.date, value: pt.value ?? pt.total, source: pt.source || "actual" };
      const ai = await explainForecast(series, focus);
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

  const forecastValue = useMemo(() => {
    if (!forecast?.length) return null;
    const f = forecast[0];
    return Number(f.total ?? f.sales ?? f.value ?? NaN);
  }, [forecast]);

  return (
    <Container maxW="7xl" py={6} className="dashboard-grid">
      {/* Top row: left = store card, right = KPI */}
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

      {/* Chart directly under top row, left-aligned */}
      <Box className="dashboard-chart">
        {loadingForecast ? (
          <LoaderCard etaMs={etaForecast} label="Loading Forecast…" />
        ) : insightIsLoading ? (
          <LoaderCard etaMs={etaAi} label="Generating AI Insight…" />
        ) : (
          <CardShell
            title={isCategoryView ? "Category Breakdown" : "Sales Growth + Forecast"}
            right={
              <HStack spacing={1}>
                <IconButton
                  icon={<ArrowBackIcon />}
                  onClick={() => handleGraphViewChange("prev")}
                  aria-label="Prev"
                  size="sm"
                  variant="ghost"
                />
                <IconButton
                  icon={<ArrowForwardIcon />}
                  onClick={() => handleGraphViewChange("next")}
                  aria-label="Next"
                  size="sm"
                  variant="ghost"
                />
              </HStack>
            }
          >
            {isCategoryView ? (
              <CategoryBreakdownChart
                key={`cat-${Number(selectedStore?.value ?? selectedStore) || 0}`}
                history={history}
                storeId={Number(selectedStore?.value ?? selectedStore) || 0}
                apiBase={API_BASE}
                onInsightText={setCategoryInsight}
              />
            ) : (
              <ForecastChart
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
        )}
      </Box>

      {/* Sticky AI panel on the right */}
      <Box className="dashboard-right" display={{ base: "none", lg: "block" }}>
        <CardShell title="AI Insight">
          <AIInsight
            summary={insightText}
            loading={insightIsLoading}
            boxProps={{ maxH: "58vh", overflowY: "auto", p: 0 }}
          />
          <Divider my={3} />
          <Text mt={1} fontSize="xs" color="gray.500">
            API: {API_BASE}
          </Text>
        </CardShell>
      </Box>

      {/* Mobile drawer (unchanged) */}
      <Button
        display={{ base: "inline-flex", lg: "none" }}
        position="fixed"
        right={4}
        bottom={4}
        colorScheme="purple"
        onClick={drawer.onOpen}
        shadow="md"
        borderRadius="lg"
      >
        AI Insight
      </Button>
      <Drawer isOpen={drawer.isOpen} placement="right" onClose={drawer.onClose} size="sm">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader>AI Insight</DrawerHeader>
          <DrawerBody>
            <AIInsight summary={insightText} loading={insightIsLoading} />
            <Text mt={3} fontSize="xs" color="gray.500">
              API: {API_BASE}
            </Text>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Container>
  );
}
