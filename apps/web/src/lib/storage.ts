import type { PollResponse } from "./types";

const STORAGE_KEY = "sverify:active-verification";

export interface StoredVerification {
  analysisId: string;
  url: string;
  startedAt: number;
  lastResult: PollResponse | null;
}

export function loadStoredVerification(): StoredVerification | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredVerification;
    if (!parsed?.analysisId || typeof parsed.startedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredVerification(data: StoredVerification): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures (e.g. private browsing quota)
  }
}

export function clearStoredVerification(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
