import type { FrameModel } from "../frameCatalog";

export type UserBike = FrameModel & {
  submitted_by_user_id: string;
};

async function jsonOrThrow(res: Response): Promise<any> {
  if (!res.ok) {
    let detail = `request_failed_${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
      else if (Array.isArray(data?.detail)) {
        detail = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ");
      }
    } catch {
      // ignore
    }
    const err = new Error(detail);
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchBikes(): Promise<UserBike[]> {
  const res = await fetch("/bikes", { credentials: "include" });
  const data = await jsonOrThrow(res);
  return (data.bikes ?? []) as UserBike[];
}

export async function fetchBrands(): Promise<string[]> {
  const res = await fetch("/bikes/brands", { credentials: "include" });
  const data = await jsonOrThrow(res);
  return (data.brands ?? []) as string[];
}

export async function createBike(payload: Omit<FrameModel, "id">): Promise<UserBike> {
  const res = await fetch("/bikes", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await jsonOrThrow(res)) as UserBike;
}

export async function patchBike(id: string, payload: Omit<FrameModel, "id">): Promise<UserBike> {
  const res = await fetch(`/bikes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await jsonOrThrow(res)) as UserBike;
}

export async function flagBike(id: string, reason: string): Promise<void> {
  const res = await fetch(`/bikes/${encodeURIComponent(id)}/flag`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  await jsonOrThrow(res);
}
