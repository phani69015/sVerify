"use client";

import { useEffect, useState } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_URL: "That URL doesn't look valid.",
  UNSUPPORTED_PLATFORM: "Only public Facebook, Instagram, and X post URLs are supported.",
  PRIVATE_OR_LOGIN_REQUIRED: "This post is private or requires login — we can't access it.",
  DELETED_OR_NOT_FOUND: "This post appears to be deleted or does not exist.",
  EXTRACTION_FAILED: "We couldn't extract this post. Please try again later.",
};

const STEPS = [
  { at: 0, label: "Extracting post…" },
  { at: 15, label: "Analyzing media for signs of manipulation…" },
  { at: 40, label: "Checking claims against evidence…" },
  { at: 90, label: "Finalizing verdict…" },
];

function useElapsedSeconds(startedAt: number) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function StatusPanel({
  status,
  errorCode,
  startedAt,
}: {
  status: "PROCESSING" | "FAILED";
  errorCode?: string | null;
  startedAt: number;
}) {
  const elapsed = useElapsedSeconds(startedAt || Date.now());

  if (status === "PROCESSING") {
    const currentStep = [...STEPS].reverse().find((s) => elapsed >= s.at) ?? STEPS[0];

    return (
      <div className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-400" />
          </span>
          <span className="text-sm text-neutral-200">{currentStep.label}</span>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Elapsed: {formatDuration(elapsed)} — this can take a minute or two. Feel free to leave the page;
          your result will still be here when you come back.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl rounded-xl border border-red-800 bg-red-950/50 p-5">
      <div className="text-sm font-semibold text-red-300">Verification failed</div>
      <p className="mt-1 text-sm text-red-200">
        {(errorCode && ERROR_MESSAGES[errorCode]) ?? "Something went wrong while verifying this post."}
      </p>
    </div>
  );
}
