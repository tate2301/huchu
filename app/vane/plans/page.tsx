"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { PlansView } from "@/components/vane/plans-view";
import { useVanePlans } from "@/components/vane/use-vane";
import { VaneError, VaneFrame, VaneLoading } from "@/components/vane/vane-frame";
import { openVaneJob } from "@/components/vane/vane-job";

const GIVE_JOB = { label: "Give Vane a job", icon: "plus" as const, shortcut: "Ctrl J", onClick: openVaneJob };

/** `/vane/plans` (PageVanePlan): each plan, its steps in order, whose each is, and how far along it is. */
function PlansPage() {
  const params = useSearchParams();
  const plans = useVanePlans();
  return (
    <>
      <PageChrome title="Plans" primary={GIVE_JOB} />
      <VaneFrame>
        {plans.data ? (
          <PlansView plans={plans.data.plans} selectedId={params.get("plan")} />
        ) : plans.isError ? (
          <VaneError what="Plans" onRetry={() => plans.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VaneFrame>
    </>
  );
}

export default function VanePlansPage() {
  return (
    <React.Suspense fallback={<VaneFrame><VaneLoading /></VaneFrame>}>
      <PlansPage />
    </React.Suspense>
  );
}
