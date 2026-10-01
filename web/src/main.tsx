import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/geist/500.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/doto/800.css";
import "./design/tokens.css";
import { initTheme } from "./design/useTheme";
import { App } from "./App";

initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

