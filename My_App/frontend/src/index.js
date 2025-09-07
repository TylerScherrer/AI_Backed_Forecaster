// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider, ColorModeScript, extendTheme } from "@chakra-ui/react";
import App from "./App";
import "./index.css";

// optional, but nice to have
const theme = extendTheme({
  initialColorMode: "light",
  useSystemColorMode: false,
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config?.initialColorMode || "light"} />
      <App />
    </ChakraProvider>
  </React.StrictMode>
);
