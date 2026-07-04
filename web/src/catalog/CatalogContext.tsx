import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { FRAME_CATALOG, makeCatalogHelpers, type FrameModel, type SizeData } from "../frameCatalog";
import { fetchBikes, type UserBike } from "./api";

type CatalogState = {
  catalog: FrameModel[];
  userBikes: UserBike[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getModelById: (modelId: string) => FrameModel;
  getSizeData: (modelId: string, size: string) => SizeData;
};

const CatalogContext = createContext<CatalogState | null>(null);

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userBikes, setUserBikes] = useState<UserBike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const bikes = await fetchBikes();
      setUserBikes(bikes);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setUserBikes([]);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const helpers = useMemo(() => {
    const merged = [...FRAME_CATALOG, ...userBikes];
    return makeCatalogHelpers(merged);
  }, [userBikes]);

  const value = useMemo<CatalogState>(
    () => ({
      catalog: helpers.catalog,
      userBikes,
      loading,
      error,
      refresh,
      getModelById: helpers.getModelById,
      getSizeData: helpers.getSizeData,
    }),
    [helpers, userBikes, loading, error, refresh],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export function useCatalog(): CatalogState {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
