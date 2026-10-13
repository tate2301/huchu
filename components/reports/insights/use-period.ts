"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { addDays, todayIn } from "@/lib/workspace/format";

import type { Days } from "../insight-page";

/**
 * An insight page's address: its period (`period`), or days of one's own
 * (`from` and `to`, which win), and whatever else the page keeps there
 * (the view, the form, the rep).
 */
export function useInsightAddress<V extends string>(periods: readonly V[], fallback: V) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const from = search.get("from");
  const to = search.get("to");
  const days: Days | null = from && to ? { from, to } : null;
  const requested = search.get("period") as V | null;
  const period: V | null = days ? null : requested && periods.includes(requested) ? requested : fallback;

  const set = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, search],
  );

  return {
    period,
    days,
    get: (key: string) => search.get(key),
    set,
    setPeriod: (value: V) => set({ period: value === fallback ? null : value, from: null, to: null }),
    setDays: (value: Days) => set({ from: value.from, to: value.to, period: null }),
    clearDays: () => set({ from: null, to: null }),
  };
}

/** The days a preset period covers, ending today: "30d" is today and the 29 days before it. */
export function periodDays(period: "30d" | "90d" | "12m", today = todayIn()): Days {
  const back = period === "30d" ? 29 : period === "90d" ? 89 : 364;
  return { from: addDays(today, -back), to: today };
}
