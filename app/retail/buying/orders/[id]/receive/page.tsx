"use client";

import { use } from "react";

import { ReceivePage } from "@/components/buying/receive/receive-page";

/**
 * Receive a delivery against an order (40-buying 5.7, W-33; board Receive),
 * in the shell with Deliveries current: count, put breakages aside, keep or
 * close the rest, then post to stock (or send it for checking).
 */
export default function ReceiveDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ReceivePage orderId={id} />;
}
