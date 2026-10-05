"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { runAction } from "@/components/list-frame/actions";
import { RecordFrame } from "@/components/record-frame/record-frame";
import { useToast } from "@/components/ui/use-toast";
import { shiftKind } from "@/lib/retail/record-kinds";
import type { ShiftRecordView } from "@/lib/retail/shift-record";

import { CountCloseDialog } from "./count-close-dialog";

/** A shift (00-foundations 5.6.10): the reference record, on RecordFrame. */
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [closing, setClosing] = React.useState<ShiftRecordView | null>(null);

  const onEvent = async (event: string, shift: ShiftRecordView) => {
    if (event === "count-and-close") setClosing(shift);
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

  return (
    <RecordFrame kind={shiftKind} id={id} onEvent={(event, shift) => void onEvent(event, shift)}>
      {closing ? (
        <CountCloseDialog
          shift={closing}
          open
          onOpenChange={(open) => !open && setClosing(null)}
          onClosed={(message) => {
            setClosing(null);
            toast({ title: message, variant: "success" });
            void Promise.all(
              [shiftKind.queryKey(id), ["record-activity"], ["reports"], ["retail-shifts"], ["nav-badges"]].map((queryKey) =>
                queryClient.invalidateQueries({ queryKey }),
              ),
            );
          }}
        />
      ) : null}
    </RecordFrame>
  );
}
