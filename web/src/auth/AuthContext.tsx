import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AuthUser = {
  id: string;
  email: string;
  created_at: string;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ");
    }
    return `request_failed_${res.status}`;
  } catch {
    return `request_failed_${res.status}`;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/auth/me", { credentials: "include" });
    if (res.ok) {
      setUser((await res.json()) as AuthUser);
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const res = await postJson("/auth/login", { email, password });
    if (!res.ok) {
      throw new Error(await readError(res));
    }
    setUser((await res.json()) as AuthUser);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setError(null);
    const res = await postJson("/auth/register", { email, password });
    if (!res.ok) {
      throw new Error(await readError(res));
    }
    setUser((await res.json()) as AuthUser);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, login, register, logout, refresh }),
    [user, loading, error, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
