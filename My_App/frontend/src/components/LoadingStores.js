// LoadingTask.js (you can also keep the filename LoadingStores.js if you prefer)
import { useEffect, useState } from "react";
import { Box, HStack, Spinner, Text, Progress } from "@chakra-ui/react";

const fmt = (ms) => {
  const sec = Math.max(0, Math.round(ms / 100) / 10); // 1 decimal
  return sec >= 60
    ? `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`
    : `${sec.toFixed(1)}s`;
};

/**
 * Props:
 *   - label: string (e.g. "Creating forecast…")
 *   - etaMs?: number  (countdown target; e.g. 60000)
 *   - helperText?: string
 */
export default function LoadingTask({
  label = "Loading…",
  etaMs = 60000,
  helperText = "This may take up to a minute on first run."
}) {
  const [remaining, setRemaining] = useState(etaMs);

  useEffect(() => {
    setRemaining(etaMs);
    const t = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 100));
    }, 100);
    return () => clearInterval(t);
  }, [etaMs]);

  const pct = Math.min(100, ((etaMs - remaining) / etaMs) * 100);

  return (
    <Box p={4} borderWidth="1px" borderRadius="xl" bg="white" shadow="sm">
      <HStack spacing={3} mb={3}>
        <Spinner size="sm" />
        <Text fontWeight="semibold">
          {label} ETA: {fmt(remaining)}
        </Text>
      </HStack>
      <Progress value={pct} size="sm" isAnimated hasStripe />
      {helperText && (
        <Text mt={2} fontSize="sm" color="gray.600">
          {helperText}
        </Text>
      )}
    </Box>
  );
}
