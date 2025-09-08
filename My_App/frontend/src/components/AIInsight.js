// src/components/AIInsight.js
import React, { useEffect, useMemo } from "react";
import {
  Box, HStack, Select, Spinner, Text, Spacer,
  IconButton, Tooltip
} from "@chakra-ui/react";
import { RepeatIcon } from "@chakra-ui/icons";
import { useSettings } from "../context/SettingsContext";

export default function AIInsight({
  topic = "Insight",
  summary,
  loading,
  onRefetch,
  autoRefetch = false, // keep false
  boxProps = {},
  children,
}) {
  const {
    explainStyle, setExplainStyle,
    readingLevel, setReadingLevel,
  } = useSettings();

  useEffect(() => {
    if (!autoRefetch || !onRefetch) return;
    const id = setTimeout(() => onRefetch({ explainStyle, readingLevel }), 600);
    return () => clearTimeout(id);
  }, [autoRefetch, explainStyle, readingLevel, onRefetch]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <HStack py={2}>
          <Spinner size="sm" />
          <Text fontSize="sm" color="gray.600">Generating insight…</Text>
        </HStack>
      );
    }
    if (children) return children;
    if (summary?.trim()) return <Text whiteSpace="pre-wrap">{summary}</Text>;
    return <Text fontSize="sm" color="gray.500">No insight yet.</Text>;
  }, [loading, summary, children]);

  return (
    <Box {...boxProps}>
      <HStack mb={2}>
        <Text fontWeight="semibold">{topic}</Text>
        <Spacer />
        <Tooltip label="Regenerate with AI">
          <IconButton
            aria-label="Regenerate"
            icon={<RepeatIcon />}
            size="sm"
            variant="ghost"
            onClick={() => onRefetch?.({ explainStyle, readingLevel })}
            isDisabled={!onRefetch}
            isLoading={loading}
          />
        </Tooltip>
        <Select
          w="150px"
          size="sm"
          value={explainStyle}
          onChange={(e) => setExplainStyle(e.target.value)}
          isDisabled={loading}
        >
          <option value="bullets">Bullets</option>
          <option value="narrative">Narrative</option>
          <option value="actions">Action plan</option>
        </Select>
        <Select
          w="150px"
          size="sm"
          value={readingLevel}
          onChange={(e) => setReadingLevel(e.target.value)}
          isDisabled={loading}
        >
          <option value="simple">Simple</option>
          <option value="balanced">Balanced</option>
          <option value="advanced">Advanced</option>
          <option value="pro">Pro</option>
        </Select>
      </HStack>

      <Box fontSize="sm">
        {content}
      </Box>
    </Box>
  );
}
