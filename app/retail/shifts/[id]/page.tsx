"use client";

import { Suspense } from "react";
import { useParams, usePathname } from "next/navigation";

import { runAction } from "@/components/list-frame/actions";
import { RecordFrame } from "@/components/record-frame/record-frame";
import { useToast } from "@/components/ui/use-toast";
import { shiftKind } from "@/lib/retail/record-kinds";
import type { ShiftRecordView } from "@/lib/retail/shift-record";

/** A shift (00-foundations 5.6.10): the reference record, on RecordFrame. Count and close is its own page (FLR-04). */
export default function ShiftPage() {
  return (
    <Suspense>
      <Shift />
    </Suspense>
  );
}

function Shift() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const pathname = usePathname();
  const { toast } = useToast();

  const onEvent = async (event: string, shift: ShiftRecordView) => {
    if (event === "print-z-report") {
      const outcome = await runAction(
        {
          key: "z-report",
          label: "Print Z-report",
          requires: [],
          do: { download: "/api/v2/retail/z-reports/print", idsAs: "shiftIds", open: true },
        },
        [shift.id],
        [],
        { pathname, search: "" },
      );
      if (outcome.kind === "done" && outcome.toast) toast(outcome.toast);
    }
  };

  return <RecordFrame kind={shiftKind} id={id} onEvent={(event, shift) => void onEvent(event, shift)} />;
}
