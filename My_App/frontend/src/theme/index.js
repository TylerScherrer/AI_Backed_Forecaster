// Minimal theme lift: better fonts, brand color, softer cards & buttons
import { extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
  fonts: {
    heading: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, 'Apple Color Emoji', 'Segoe UI Emoji'",
    body:    "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, 'Apple Color Emoji', 'Segoe UI Emoji'",
  },
  colors: {
    brand: {
      50:  "#eefcf7",
      100: "#c8f3e3",
      200: "#a3ead1",
      300: "#7de2be",
      400: "#57d9ac",
      500: "#3dc092",
      600: "#2f9673",
      700: "#216b53",
      800: "#144134",
      900: "#071715",
    },
  },
  components: {
    Button: {
      baseStyle: { rounded: "xl", fontWeight: 600 },
    },
  },
  styles: {
    global: {
      body: {
        bg: "gray.50",
      },
    },
  },
});

export default theme;
