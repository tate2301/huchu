"use client";

import "@/components/list-frame/list-frame.css";

import { Suspense, use } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Points movements (CUS-03, defined here): every row of a customer's points
 * ledger with the balance it left, from `retail-points` scoped to them. The
 * back link reads their name; the sub what their points are worth.
 */
export default function PointsMovementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ListFrame
        source="retail-points"
        title="Points movements"
        keepTitle
        back={{ label: "Customer", href: `/retail/customers/${id}` }}
        parent={{ key: "customer", value: id }}
        defaultSort="newest"
      />
    </Suspense>
  );
}
