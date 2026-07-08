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

