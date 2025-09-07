// src/pages/Home.js
import { useEffect, useRef, useState } from "react";
import {
  Box,
  Container,
  HStack,
  Text,
  Grid,
  GridItem,
  Button,
  useDisclosure,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Alert,
  AlertIcon,
  IconButton,
  useToast,
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

export default function Home() {
  const toast = useToast();
  const drawer = useDisclosure();

  // ---------------- Stores ----------------
  const {
    storeList,
    loadingStores,
    storesError,
    retryRefresh,
    usedCacheRef,
    etaMs,
  } = useStores();

  const [selectedStore, setSelectedStore] = useState(null);

  // ---------------- Forecast + total-page insight ----------------
  const {
    history,
    forecast,
    timeline,
    summary,
    setSummary, // exposed by hook; we only set if you want manual overrides
    loadingForecast,
    loadingInsight,
    etaForecast,
    etaAi,
  } = useForecast(selectedStore, {
    onError: (err) =>
      toast({
        title: "Failed to load forecast",
        description: String(err),
        status: "error",
      }),
  });

  // ---------------- Category insight (right panel when viewing Category tab) ----------------
  const [categoryInsight, setCategoryInsight] = useState("");

  // ---------------- Chart point popup (Forecast tab) ----------------
  const [focusPoint, setFocusPoint] = useState(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusSummary, setFocusSummary] = useState("");
  const pointReqRef = useRef(0); // guards against stale async writes

  // ---------------- View toggle ----------------
  const graphViews = ["total", "category"];
  const [graphViewIndex, setGraphViewIndex] = useState(0);
  const isCategoryView = graphViews[graphViewIndex] === "category";
  const insightText = isCategoryView ? categoryInsight : summary;
  const insightIsLoading = isCategoryView
    ? !categoryInsight && history.length > 0
    : loadingInsight;

  // Clear category insight whenever store or tab changes (prevents stale text)
  useEffect(() => {
    setCategoryInsight("");
  }, [selectedStore, graphViewIndex]);

  const handleGraphViewChange = (direction) => {
    const next =
      direction === "prev"
        ? (graphViewIndex - 1 + graphViews.length) % graphViews.length
        : (graphViewIndex + 1) % graphViews.length;
    setGraphViewIndex(next);
    // Don't force a re-fetch here; the hook already fetched 'summary'.
  };

  // Point click: fetch point-specific AI explanation (safe against race conditions)
  const handlePointSelect = async (pt) => {
    const focus = {
      date: pt.date,
      value: pt.value ?? pt.total,
      source: pt.source || "actual",
    };

    const reqId = ++pointReqRef.current;

    setFocusPoint({ ...pt });
    setFocusLoading(true);
    setFocusSummary("Analyzing…");

    try {
      const series = timeline.map((p) => ({
        date: p.date,
        value: p.total,
        source: p.source,
      }));

      const ai = await explainForecast(series, focus);

      if (reqId !== pointReqRef.current) return; // ignore stale response
      setFocusSummary(ai?.summary || "No insight available.");
    } catch {
      if (reqId !== pointReqRef.current) return;
      setFocusSummary("Failed to fetch insight.");
    } finally {
      if (reqId === pointReqRef.current) setFocusLoading(false);
    }
  };

  const handleClosePopup = () => {
    pointReqRef.current++; // cancel any in-flight point request
    setFocusPoint(null);
    setFocusSummary("");
    setFocusLoading(false);
  };

  const chartTitle = isCategoryView ? "Category Breakdown" : "Sales Growth + Forecast";
  const storeIdNum = Number(selectedStore?.value ?? selectedStore) || 0;

  return (
    <Container maxW="7xl" py={6}>
      <Grid templateColumns={{ base: "1fr", lg: "2fr 1fr" }} gap={6} alignItems="start">
        {/* ---------------- Left column ---------------- */}
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
              <LoaderCard etaMs={etaMs} label="Loading stores…" />
            ) : storeList.length === 0 ? (
              <Alert status="warning" borderRadius="lg">
                <AlertIcon />
                No stores were returned by the server.
              </Alert>
            ) : (
              <Box p={4} borderWidth="1px" borderRadius="xl" bg="white">
                <Text fontWeight="bold" mb={2}>
                  Select a Store
                </Text>
                <StoreSelector
                  storeList={storeList}
                  selectedStore={selectedStore}
                  setSelectedStore={setSelectedStore}
                />
                {storesError && usedCacheRef.current && (
                  <HStack mt={3} spacing={3}>
                    <Text fontSize="sm" color="orange.700">
                      {storesError}
                    </Text>
                    <Button size="xs" onClick={retryRefresh}>
                      Retry refresh
                    </Button>
                  </HStack>
                )}
              </Box>
            )}
          </Box>

          {/* Inline loaders */}
          {loadingForecast ? (
            <Box mb={4}>
              <LoaderCard etaMs={etaForecast} label="Loading Forecast…" />
            </Box>
          ) : insightIsLoading ? (
            <Box mb={4}>
              <LoaderCard etaMs={etaAi} label="Generating AI Insight…" />
            </Box>
          ) : null}

          {/* Chart card */}
          <Box
            maxW="800px"
            mx="auto"
            position="relative"
            zIndex={0}
            p={2}
            borderWidth="1px"
            borderRadius="xl"
            bg="white"
          >
            <HStack justify="space-between" mb={2}>
              <Text fontWeight="bold">{chartTitle}</Text>
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
            </HStack>

            {isCategoryView ? (
              <CategoryBreakdownChart
                key={`cat-${storeIdNum}`} // force fresh per store
                history={history}
                storeId={storeIdNum}
                apiBase={API_BASE}
                onInsightText={setCategoryInsight}
              />
            ) : (
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
            )}
          </Box>
        </GridItem>

        {/* ---------------- Right column (AI panel) ---------------- */}
        <GridItem display={{ base: "none", lg: "block" }}>
          <Box w="720px" position="sticky" top="80px" p={4} borderWidth="1px" borderRadius="xl" bg="white">
            <Text fontWeight="bold" mb={2}>AI Insight</Text>
            <AIInsight
              summary={insightText}
              loading={insightIsLoading}
              boxProps={{ maxH: "70vh", overflowY: "auto", p: 0 }}
            />
            <Text mt={3} fontSize="xs" color="gray.500">
              API: {API_BASE}
            </Text>
          </Box>
        </GridItem>
      </Grid>

      {/* ---------------- Mobile drawer ---------------- */}
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
            <AIInsight summary={insightText} loading={insightIsLoading} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Container>
  );
}
