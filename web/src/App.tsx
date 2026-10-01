import React from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from "react-router-dom";

import "./styles/base.css";
import "./styles/shell.css";
import "./styles/controls.css";
import "./styles/builder.css";
import "./styles/stage2d.css";
import "./styles/stage3d.css";
import "./styles/transfer.css";
import "./styles/forms.css";
import "./styles/profile.css";
import { AddBikeMode } from "./AddBikeMode";
import { FitBuilderMode } from "./FitBuilderMode";
import { FitTransferMode } from "./FitTransferMode";
import { ProfilePage } from "./ProfilePage";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { RequireAuth } from "./auth/RequireAuth";
import { CatalogProvider } from "./catalog/CatalogContext";
import { BrandMark } from "./design/BrandMark";
import { DesignRoute } from "./design/DesignRoute";
import { ThemeToggle } from "./design/ThemeToggle";

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const tab = ({ isActive }: { isActive: boolean }) => `top-tab${isActive ? " top-tab--active" : ""}`;

  return (
    <header className="top-nav">
      <Link to="/" className="top-nav__brand" aria-label="FlowFit home">
        <BrandMark />
      </Link>
      <nav className="top-nav__tabs" aria-label="Modes">
        <NavLink to="/" end className={tab}>
          Fit Builder
        </NavLink>
        <NavLink to="/transfer" className={tab}>
          Fit Transfer
        </NavLink>
        <NavLink to="/add" className={tab}>
          Add Bike
        </NavLink>
      </nav>
      <div className="top-nav__right">
        <ThemeToggle />
        {user ? (
          <>
            <Link to="/profile" className="top-nav__account" title="Profile">
              {user.email}
            </Link>
            <button type="button" className="ff-pill ff-pill--ghost" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="ff-pill ff-pill--ghost">
              Sign in
            </Link>
            <Link to="/register" className="ff-pill ff-pill--ghost">
              Register
            </Link>
          </>
        )}
      </div>
    </header>
  );
};

/** `bleed` pages (the builder) manage their own full-width columns; the rest sit in a padded page. */
const Shell: React.FC<{ children: React.ReactNode; bleed?: boolean }> = ({ children, bleed }) => (
  <div className="app-shell">
    <Header />
    <main className={`app-main${bleed ? " app-main--bleed" : ""}`}>{children}</main>
  </div>
);

export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <CatalogProvider>
        <Routes>
          {import.meta.env.DEV && <Route path="/design" element={<DesignRoute />} />}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <Shell bleed>
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
