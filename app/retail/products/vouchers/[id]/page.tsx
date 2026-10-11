"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { voucherKind } from "@/lib/retail/record-kinds";

/**
 * A voucher (PRD-10, `VoucherRecord.png`): on RecordFrame, what is left and
 * where it was spent, money spent from it by month, its uses and changes, and
 * its details; Extend opens `voucher-edit` over it.
 */
export default function VoucherPage() {
  return (
    <Suspense>
      <Voucher />
    </Suspense>
  );
}

function Voucher() {
  const params = useParams<{ id: string }>();
  return <RecordFrame kind={voucherKind} id={params?.id ?? ""} />;
}
