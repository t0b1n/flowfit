export interface SolveRequest {
  setup: any;
}

export interface SolveResponse {
  result: any;
}

export async function solve(request: SolveRequest): Promise<SolveResponse> {
  const res = await fetch("/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!res.ok) {
    throw new Error(`Solve failed with status ${res.status}`);
  }
  return (await res.json()) as SolveResponse;
}

export async function fetchGeometry3D(setup: any): Promise<any> {
  const res = await fetch("/geometry3d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setup }),
  });
  if (!res.ok) {
    throw new Error(`geometry3d failed with status ${res.status}`);
  }
  return res.json();
}

