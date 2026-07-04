import React from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from "react-router-dom";

import "./App.css";
import { AddBikeMode } from "./AddBikeMode";
import { FitBuilderMode } from "./FitBuilderMode";
import { FitTransferMode } from "./FitTransferMode";
import { ProfilePage } from "./ProfilePage";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { RequireAuth } from "./auth/RequireAuth";
import { CatalogProvider } from "./catalog/CatalogContext";

const Header: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="mode-nav">
      <div className="mode-nav__brand">
        <div className="eyebrow">bikegeo</div>
        <h1>Bike Fit Tool</h1>
      </div>
      <nav className="mode-nav__tabs">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `mode-tab ${isActive ? "mode-tab--active" : ""}`}
        >
          <strong>Fit Builder</strong>
          <span>Body → ideal contact points</span>
        </NavLink>
        <NavLink
          to="/transfer"
          className={({ isActive }) => `mode-tab ${isActive ? "mode-tab--active" : ""}`}
        >
          <strong>Fit Transfer</strong>
          <span>Frame A setup → Frame B components</span>
        </NavLink>
        <NavLink
          to="/add"
          className={({ isActive }) => `mode-tab ${isActive ? "mode-tab--active" : ""}`}
        >
          <strong>Add bike</strong>
          <span>Contribute a frame to the catalog</span>
        </NavLink>
      </nav>
      <div className="mode-nav__auth">
        {user ? (
          <>
            <Link to="/profile" className="link-btn">
              {user.email}
            </Link>
            <button className="link-btn" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="link-btn">
              Sign in
            </Link>
            <Link to="/register" className="link-btn">
              Register
            </Link>
          </>
        )}
      </div>
    </header>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="app-shell">
    <div className="app-glow app-glow--left" />
    <div className="app-glow app-glow--right" />
    <Header />
    <main>{children}</main>
  </div>
);

export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <CatalogProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <Shell>
                <FitBuilderMode />
              </Shell>
            }
          />
          <Route
            path="/transfer"
            element={
              <Shell>
                <FitTransferMode />
              </Shell>
            }
          />
          <Route
            path="/add"
            element={
              <RequireAuth>
                <Shell>
                  <AddBikeMode />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Shell>
                  <ProfilePage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CatalogProvider>
    </AuthProvider>
  </BrowserRouter>
);
