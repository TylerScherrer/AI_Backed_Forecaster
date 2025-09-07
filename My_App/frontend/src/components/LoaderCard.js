// src/components/LoaderCard.js
import { useEffect, useRef, useState } from "react";
import { Box, HStack, Progress, Spinner, Text } from "@chakra-ui/react";

export default function LoaderCard({ etaMs = 1500, label = "Loading…" }) {
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
    </Box>
  );
}
