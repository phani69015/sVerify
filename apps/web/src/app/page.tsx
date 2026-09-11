"use client";

import { UrlForm } from "@/components/UrlForm";
import { StatusPanel } from "@/components/StatusPanel";
import { ResultView } from "@/components/ResultView";
import { useVerification } from "@/lib/useVerification";
import { isComplete, isFailed } from "@/lib/types";

export default function Home() {
  const { busy, result, error, restoring, submit, reset, startedAt } = useVerification();

  const showForm = !result || isComplete(result) || isFailed(result);

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">sVerify</h1>
        <p className="mt-2 text-neutral-400">
          Paste a public Facebook, Instagram, or X post URL to check its media authenticity and factual
          claims.
        </p>
      </div>

      {restoring ? (
        <div className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 text-sm text-neutral-400">
          Checking for an in-progress verification…
        </div>
      ) : (
        <>
          {showForm && <UrlForm onSubmit={submit} disabled={busy} />}

          {error && (
            <div className="flex w-full max-w-2xl items-start justify-between gap-4 rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-200">
              <span>{error}</span>
              <button
                onClick={reset}
                className="shrink-0 rounded-md border border-red-700 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-900/50"
              >
                Dismiss
              </button>
            </div>
          )}

          {result && !isComplete(result) && (
            <StatusPanel
              status={result.status}
              errorCode={isFailed(result) ? result.errorCode : null}
              startedAt={startedAt}
            />
          )}

          {result && isFailed(result) && (
            <div className="flex w-full max-w-2xl justify-center">
              <button
                onClick={reset}
                className="rounded-lg border border-neutral-700 px-5 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
              >
                Try another post
              </button>
            </div>
          )}

          {result && isComplete(result) && (
            <>
              <ResultView result={result} />
              <button
                onClick={reset}
                className="rounded-lg border border-neutral-700 px-5 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
              >
                Verify another post
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}
