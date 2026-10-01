import type { MetricId } from "../fitMetrics";

/** Mirrors bikegeo_api/schemas_fits.py. */
export interface SnapPoint {
  name: string;
  pos: [number, number, number];
}

export interface FitSnapshot {
  metrics: Partial<Record<MetricId, number>>;
  mannequin_points: SnapPoint[];
  components: Record<string, number | null>;
  frame_label: string | null;
}

export interface FitSummary {
  id: string;
  name: string;
  created_at: string;
  metrics: Partial<Record<MetricId, number>>;
  frame_label: string | null;
}

export interface FitOut extends FitSummary {
  schema_version: number;
  /** Builder state to restore (see capture.ts `BuilderInputs`); versioned by `inputs.v`. */
  inputs: Record<string, unknown>;
  snapshot: FitSnapshot;
}

export interface FitIn {
  name: string;
  inputs: Record<string, unknown>;
  snapshot: FitSnapshot;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `request_failed_${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
      else if (Array.isArray(data?.detail)) detail = data.detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join("; ");
    } catch {
      /* keep the default */
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: "include",
  headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export async function listFits(): Promise<FitSummary[]> {
  const data = await jsonOrThrow<{ fits: FitSummary[] }>(await fetch("/fits", json("GET")));
  return data.fits ?? [];
}

export const getFit = async (id: string): Promise<FitOut> => jsonOrThrow<FitOut>(await fetch(`/fits/${encodeURIComponent(id)}`, json("GET")));

export const createFit = async (payload: FitIn): Promise<FitOut> => jsonOrThrow<FitOut>(await fetch("/fits", json("POST", payload)));

export const renameFit = async (id: string, name: string): Promise<FitOut> =>
  jsonOrThrow<FitOut>(await fetch(`/fits/${encodeURIComponent(id)}`, json("PATCH", { name })));

export const deleteFit = async (id: string): Promise<void> => jsonOrThrow<void>(await fetch(`/fits/${encodeURIComponent(id)}`, json("DELETE")));
