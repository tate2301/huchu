"use client";

import { use } from "react";

import { CountReview } from "@/components/retail/stock/count-review";

/**
 * Approve the differences (30-stock W-22 steps 3–4, STK-06; board
 * CountReview), in the shell. Approvers only: everyone else is told so; a
 * count not waiting for approval goes to its record.
 */
export default function CountReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CountReview countId={id} />;
}
