"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Vouchers (PRD-10, `VouchersList.png`): drawn by ListFrame from the
 * `retail-vouchers` source. "+ Issue vouchers" opens `?sheet=voucher-new`, a
 * row's or the ticked rows' "Extend" `?sheet=voucher-extend`; a code opens its
 * record — kinds in `lib/retail/sheet-kinds/vouchers.ts`.
 */
export default function VouchersPage() {
  return (
    <Suspense>
      <ListFrame source="retail-vouchers" title="Vouchers" />
    </Suspense>
  );
}
