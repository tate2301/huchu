"use client";

import { useSession } from "next-auth/react";

import { booksPlanOf, BOOKS_PAID_FEATURES, hasBooksTier, type BooksTier } from "@/lib/books/tiers";

/**
 * The Books plan the person's workspace has, for what a free list leaves out
 * on screen (bulk actions, saved views; lib/books/tiers.ts). The server
 * refuses on its own: this only keeps a control from being drawn.
 */
export function useBooksPlan(): { plan: BooksTier; bulk: boolean; savedViews: boolean } {
  const { data } = useSession();
  const features = data?.user?.enabledFeatures;
  return {
    plan: booksPlanOf(features),
    bulk: hasBooksTier(features, BOOKS_PAID_FEATURES.bulk),
    savedViews: hasBooksTier(features, BOOKS_PAID_FEATURES.savedViews),
  };
}
