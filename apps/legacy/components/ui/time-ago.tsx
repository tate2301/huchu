"use client";

import { useEffect, useState } from "react";

/**
 * "3d ago", hydration-safe.
 *
 * Anything derived from `Date.now()` differs between the server render and
 * the browser's first paint, which is hydration error #418. So before mount
 * this emits the raw date slice of the ISO input — same bytes on both sides —
 * and only swaps to the relative wording after the mount effect, the same
 * trick ClientDate uses.
 */
export function TimeAgo({ value }: { value: string | null | undefined }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!value) return null;
  if (!mounted) return <>{value.slice(0, 10)}</>;

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return <>{value.slice(0, 10)}</>;

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const label =
    seconds < 60
      ? "just now"
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m ago`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h ago`
          : seconds < 86400 * 30
            ? `${Math.floor(seconds / 86400)}d ago`
            : seconds < 86400 * 365
              ? `${Math.floor(seconds / (86400 * 30))}mo ago`
              : `${Math.floor(seconds / (86400 * 365))}y ago`;

  return <>{label}</>;
}
