"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startVerification, getVerification, ApiError } from "./api";
import { isComplete, isFailed, type PollResponse } from "./types";
import { clearStoredVerification, loadStoredVerification, saveStoredVerification } from "./storage";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 5 * 60 * 1000; // give up after 5 minutes

export function useVerification() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number>(0);
  const currentUrl = useRef<string>("");
  const mounted = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const poll = useCallback((analysisId: string) => {
    const tick = async () => {
      try {
        const res = await getVerification(analysisId);
        if (!mounted.current) return;

        setResult(res);
        saveStoredVerification({
          analysisId,
          url: currentUrl.current,
          startedAt: startedAt.current,
          lastResult: res,
        });

        if (isComplete(res) || isFailed(res)) {
          setBusy(false);
          clearStoredVerification();
          return;
        }

        if (Date.now() - startedAt.current > MAX_POLL_MS) {
          setError("This is taking longer than expected. Please try again later.");
          setBusy(false);
          clearStoredVerification();
          return;
        }

        pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        if (!mounted.current) return;
        setError(err instanceof ApiError ? err.message : "Failed to fetch verification status.");
        setBusy(false);
      }
    };

    pollTimer.current = setTimeout(tick, 0);
  }, []);

  // Resume an in-flight verification after a page refresh.
  useEffect(() => {
    mounted.current = true;
    const stored = loadStoredVerification();

    if (stored && Date.now() - stored.startedAt < MAX_POLL_MS) {
      currentUrl.current = stored.url;
      startedAt.current = stored.startedAt;
      setBusy(true);
      if (stored.lastResult) setResult(stored.lastResult);
      poll(stored.analysisId);
    } else if (stored) {
      clearStoredVerification();
    }

    setRestoring(false);

    return () => {
      mounted.current = false;
      stopPolling();
    };
  }, [poll, stopPolling]);

  const submit = useCallback(
    async (url: string) => {
      stopPolling();
      setError(null);
      setResult(null);
      setBusy(true);
      currentUrl.current = url;
      startedAt.current = Date.now();

      try {
        const { analysisId } = await startVerification(url);
        const initial: PollResponse = { analysisId, status: "PROCESSING" };
        setResult(initial);
        saveStoredVerification({
          analysisId,
          url,
          startedAt: startedAt.current,
          lastResult: initial,
        });
        poll(analysisId);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to start verification.");
        setBusy(false);
      }
    },
    [poll, stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    clearStoredVerification();
    setBusy(false);
    setResult(null);
    setError(null);
  }, [stopPolling]);

  return { busy, result, error, restoring, submit, reset, startedAt: startedAt.current };
}
