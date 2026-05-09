"use client";

import { useEffect, useState } from "react";

/**
 * Renders a date string in the user's locale, but only after mount.
 *
 * During SSR and the first client render we emit a stable, locale-free ISO
 * slice so that server-rendered HTML matches the hydration pass. After the
 * effect runs we swap to `toLocaleString()` / `toLocaleDateString()`.
 *
 * This avoids React #418 (hydration mismatch) on pages that display
 * timestamps without an explicit locale.
 */
export function ClientDate({
  value,
  mode = "datetime",
  fallback = "—",
}: {
  value: string | null | undefined;
  mode?: "datetime" | "date";
  fallback?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!value) return <>{fallback}</>;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <>{fallback}</>;

  if (!mounted) {
    // SSR-stable: identical bytes on server and first client render.
    return (
      <>
        {mode === "date"
          ? value.slice(0, 10)
          : value.slice(0, 16).replace("T", " ")}
      </>
    );
  }

  return <>{mode === "date" ? d.toLocaleDateString() : d.toLocaleString()}</>;
}
