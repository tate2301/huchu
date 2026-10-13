"use client";

import { PageChrome } from "@/components/layout/page-chrome";
import { useVaneWorking } from "@/components/vane/use-vane";
import { VaneError, VaneLoading, VanePage } from "@/components/vane/vane-page";
import { WorkingView } from "@/components/vane/working-view";

/** Working on: what Vane is running, queued and waiting to try again. No board of its own; drawn like Done. */
export default function VaneWorkingPage() {
  const working = useVaneWorking();
  return (
    <>
      <PageChrome title="Working on" />
      <VanePage screen="vane">
        {working.data ? (
          <WorkingView jobs={working.data} />
        ) : working.isError ? (
          <VaneError what="Working on" onRetry={() => working.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VanePage>
    </>
  );
}
