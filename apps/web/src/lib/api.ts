import type { PollResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
const REQUEST_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The server took too long to respond. Please try again.", 0);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  return new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
}

export async function startVerification(url: string): Promise<{ analysisId: string }> {
  return withTimeout(async (signal) => {
    const res = await fetch(`${API_BASE}/api/v1/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });

    if (!res.ok) throw await parseError(res);
    return res.json();
  });
}

export async function getVerification(analysisId: string): Promise<PollResponse> {
  return withTimeout(async (signal) => {
    const res = await fetch(`${API_BASE}/api/v1/verify/${analysisId}`, {
      cache: "no-store",
      signal,
    });

    if (!res.ok) throw await parseError(res);
    return res.json();
  });
}
