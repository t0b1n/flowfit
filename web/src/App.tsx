import React, { useState } from "react";
import "./App.css";
import { FitBuilderMode } from "./FitBuilderMode";
import { FitTransferMode } from "./FitTransferMode";
import type { AppMode } from "./types";

export const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>("builder");

  return (
    <div className="app-shell">
      <div className="app-glow app-glow--left" />
      <div className="app-glow app-glow--right" />

      <header className="mode-nav">
        <div className="mode-nav__brand">
          <div className="eyebrow">bikegeo</div>
          <h1>Bike Fit Tool</h1>
        </div>
        <nav className="mode-nav__tabs">
          <button
            className={`mode-tab ${mode === "builder" ? "mode-tab--active" : ""}`}
            onClick={() => setMode("builder")}
          >
            <strong>Fit Builder</strong>
            <span>Body → ideal contact points</span>
          </button>
          <button
            className={`mode-tab ${mode === "transfer" ? "mode-tab--active" : ""}`}
            onClick={() => setMode("transfer")}
          >
            <strong>Fit Transfer</strong>
            <span>Frame A setup → Frame B components</span>
          </button>
        </nav>
      </header>

      <main>
        {mode === "builder" ? <FitBuilderMode /> : <FitTransferMode />}
      </main>
    </div>
  );
};
