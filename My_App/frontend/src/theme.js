// Simple Chakra theme polish: soft page bg, slightly larger radius, nicer shadow
import { extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
  styles: {
    global: {
      body: {
        bg: "gray.50",      // subtle gray app background
        color: "gray.800",
      },
    },
  },
  radii: {
    xl: "14px",            // rounder cards
  },
  shadows: {
    sm: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)", // softer
  },
});

export default theme;
