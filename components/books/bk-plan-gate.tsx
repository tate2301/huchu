"use client";

import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

import { booksTierForPath, booksTierForView, type BooksTier } from "@/lib/books/tiers";

import { BkPlanUpsell, type PlanUpsellFacts } from "./bk-plan-upsell";

const RANK: Record<BooksTier, number> = { free: 0, screens: 1, advanced: 2 };

/**
 * The line between running a business and doing the accounting, on screen
 * (lib/books/tiers.ts). A free address shows its page on every plan; a paid
 * one, or a paid view of a free page (`?view=by-age`), shows what its plan
 * adds in its place. The layout reads the plan; this reads the address, which
 * a layout cannot. The server refuses the page's APIs on its own.
 */
export function BkPlanGate({ plan, facts, children }: { plan: BooksTier; facts: PlanUpsellFacts; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const view = useSearchParams()?.get("view");
  const needs = booksTierForView(pathname, view) ?? booksTierForPath(pathname) ?? "free";
  if (RANK[plan] >= RANK[needs]) return <>{children}</>;
  return <BkPlanUpsell tier={needs === "advanced" ? "advanced" : "screens"} facts={facts} />;
}
