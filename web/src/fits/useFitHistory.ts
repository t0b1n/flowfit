import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createFit, deleteFit, getFit, listFits, renameFit, type FitIn, type FitOut, type FitSummary } from "./api";
import { compareTargetFromFit, type CompareTarget } from "./capture";

export interface FitHistory {
  fits: FitSummary[];
  /** The fit (or session snapshot) metrics/ghost are compared against. */
  compareTo: CompareTarget | null;
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  refresh: () => Promise<void>;
  save: (payload: FitIn) => Promise<FitOut>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Fetches the full fit (inputs + snapshot) for Load / `?fit=`. */
  load: (id: string) => Promise<FitOut>;
  compareWith: (id: string | null) => Promise<void>;
  /** Compare against an arbitrary target (e.g. the session snapshot). */
  setCompareTo: (target: CompareTarget | null) => void;
}

/** Loads when signed in, clears on logout. Signed-out users keep session-only comparison (setCompareTo). */
export function useFitHistory(): FitHistory {
  const { user } = useAuth();
  const [fits, setFits] = useState<FitSummary[]>([]);
  const [compareTo, setCompareTo] = useState<CompareTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      setFits(await listFits());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (uid) void refresh();
    else {
      setFits([]);
      setCompareTo(null);
      setError(null);
    }
  }, [uid, refresh]);

  const save = useCallback(
    async (payload: FitIn) => {
      const fit = await createFit(payload);
      await refresh();
      return fit;
    },
    [refresh],
  );
  const rename = useCallback(
    async (id: string, name: string) => {
      await renameFit(id, name);
      await refresh();
    },
    [refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      await deleteFit(id);
      setFits((f) => f.filter((x) => x.id !== id));
      setCompareTo((c) => (c && c.label === fits.find((x) => x.id === id)?.name ? null : c));
    },
    [fits],
  );
  const compareWith = useCallback(async (id: string | null) => {
    if (!id) return setCompareTo(null);
    setCompareTo(compareTargetFromFit(await getFit(id)));
  }, []);

  return { fits, compareTo, loading, error, signedIn: !!uid, refresh, save, rename, remove, load: getFit, compareWith, setCompareTo };
}
