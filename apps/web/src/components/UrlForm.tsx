"use client";

import { useMemo, useState } from "react";
import { detectPlatform, isSupportedPostUrl } from "@/lib/url";

interface Props {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X (Twitter)",
};

export function UrlForm({ onSubmit, disabled }: Props) {
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmed = url.trim();
  const platform = useMemo(() => detectPlatform(trimmed), [trimmed]);
  const isEmpty = trimmed.length === 0;
  const isValid = useMemo(() => isSupportedPostUrl(trimmed), [trimmed]);
  const showError = touched && !isEmpty && !isValid;
  const errorMessage = platform
    ? "That looks like a profile, home, or search link — paste a link to a specific post instead."
    : "That doesn't look like a Facebook, Instagram, or X post URL.";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (isValid) onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <label htmlFor="post-url" className="mb-2 block text-sm font-medium text-neutral-400">
        Paste a public Facebook, Instagram, or X post URL
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id="post-url"
            type="url"
            required
            value={url}
            disabled={disabled}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="https://x.com/example/status/123"
            aria-invalid={showError}
            className={`w-full rounded-lg border bg-neutral-900 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
              showError
                ? "border-red-700 focus:border-red-500"
                : "border-neutral-700 focus:border-neutral-500"
            }`}
          />
          {isValid && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-emerald-400">
              {PLATFORM_LABEL[platform!]}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={disabled || (touched && !isEmpty && !isValid)}
          className="shrink-0 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disabled ? "Verifying…" : "Verify"}
        </button>
      </div>
      {showError && <p className="mt-2 text-sm text-red-400">{errorMessage}</p>}
    </form>
  );
}
