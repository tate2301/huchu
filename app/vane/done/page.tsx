"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { DoneView } from "@/components/vane/done-view";
import { useVaneDone } from "@/components/vane/use-vane";
import { VaneError, VaneFrame, VaneLoading } from "@/components/vane/vane-frame";
import type { DoneQuery } from "@/lib/vane/pages";

/** `/vane/done` (PageVaneDone): what Vane finished, by day, with what a person did next. The filters live in the address. */
function DonePage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const done = useVaneDone(search);

  const onQuery = (next: Partial<DoneQuery>) => {
    const merged = new URLSearchParams(search);
    for (const [key, value] of Object.entries(next)) {
      const fallback = (key === "period" && value === "7d") || (key === "who" && value === "everyone");
      if (value === null || value === undefined || value === "" || fallback) merged.delete(key);
      else merged.set(key, String(value));
    }
    const query = merged.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageChrome title="Done" />
      <VaneFrame>
        {done.data ? (
          <DoneView data={done.data} onQuery={onQuery} />
        ) : done.isError ? (
          <VaneError what="Done" onRetry={() => done.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VaneFrame>
    </>
  );
}

export default function VaneDonePage() {
  return (
    <React.Suspense fallback={<VaneFrame><VaneLoading /></VaneFrame>}>
      <DonePage />
    </React.Suspense>
  );
}
