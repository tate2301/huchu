"use client";

import { PageChrome } from "@/components/layout/page-chrome";
import { MutedView } from "@/components/vane/muted-view";
import { useVaneMuted } from "@/components/vane/use-vane";
import { VaneError, VaneFrame, VaneLoading } from "@/components/vane/vane-frame";

/** `/vane/muted` (PageVaneMuted): the cards people set aside, with the reason each gave. */
export default function VaneMutedPage() {
  const muted = useVaneMuted();
  return (
    <>
      <PageChrome title="Muted" />
      <VaneFrame>
        {muted.data ? (
          <MutedView rows={muted.data.rows} />
        ) : muted.isError ? (
          <VaneError what="Muted" onRetry={() => muted.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VaneFrame>
    </>
  );
}
