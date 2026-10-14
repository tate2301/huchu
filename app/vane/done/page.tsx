"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { DONE_PERIODS, DoneView } from "@/components/vane/done-view";
import { useVaneDone } from "@/components/vane/use-vane";
import { VaneError, VaneLoading, VanePage } from "@/components/vane/vane-page";

/** Done (design/core-modules/boards/view/PageVaneDone.html). The period and the template live in the address. */
function Done() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const asked = Number(params.get("days"));
  const days = DONE_PERIODS.some((period) => period.days === asked) ? asked : 7;
  const template = params.get("template");
  const done = useVaneDone(days, template);

  const onQuery = (next: { days?: number; template?: string | null }) => {
    const merged = new URLSearchParams(params.toString());
    if (next.days !== undefined) {
      if (next.days === 7) merged.delete("days");
      else merged.set("days", String(next.days));
    }
    if (next.template !== undefined) {
      if (next.template) merged.set("template", next.template);
      else merged.delete("template");
    }
    const query = merged.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageChrome title="Done" />
      <VanePage screen="vane">
        {done.data ? (
          <DoneView data={done.data} days={days} template={template} onQuery={onQuery} />
        ) : done.isError ? (
          <VaneError what="Done" onRetry={() => done.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VanePage>
    </>
  );
}

export default function VaneDonePage() {
  return (
    <React.Suspense fallback={<VanePage screen="vane"><VaneLoading /></VanePage>}>
      <Done />
    </React.Suspense>
  );
}
