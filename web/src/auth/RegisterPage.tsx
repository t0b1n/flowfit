import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "./AuthContext";
import { AuthLayout } from "./AuthLayout";

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError("Registration failed. Try a different email or check your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Free — used to track bikes you contribute."
      footer={<>Already registered? <Link to="/login" state={{ from: redirectTo }}>Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
          <small>Min 10 characters.</small>
        </label>
        {error ? <div className="auth-error">{error}</div> : null}
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
};
