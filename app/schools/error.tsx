"use client";

import { LoadError } from "@/components/records/states";

/**
 * The page-wide fault. A failed panel belongs in that panel, so this boundary
 * only sees the reads a screen cannot be drawn without.
 *
 * `reset` re-runs the render that threw, which is the retry — a second verb
 * beside it would be the same offer twice. The digest rides along because a
 * page nobody can get past is a page somebody has to quote down the phone.
 */
export default function SchoolsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-3">
      <LoadError what="this page" error={error} onRetry={reset} />
      {error.digest ? (
        <p className="text-sm text-[color:var(--text-muted)]">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
