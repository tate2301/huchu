"use client";

import { use } from "react";

import { CountPhone } from "@/components/retail/stock/count-phone";

/**
 * Count on a phone (30-stock 5.7, W-22 step 2; board CountPhone): the
 * counter's page, full screen like the till, whatever their role. The page
 * and its API ask the counter rule themselves.
 */
export default function CountOnPhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CountPhone countId={id} />;
}
