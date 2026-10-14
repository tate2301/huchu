"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { PlansView } from "@/components/vane/plans-view";
import { useToast } from "@/components/ui/use-toast";
import { useVaneActions, useVanePlans } from "@/components/vane/use-vane";
import { getApiErrorMessage } from "@/lib/api-client";
import { VaneError, VaneFrame, VaneLoading } from "@/components/vane/vane-frame";
import { openVaneJob } from "@/components/vane/vane-job";

const GIVE_JOB = { label: "Give Vane a job", icon: "plus" as const, shortcut: "Ctrl J", onClick: openVaneJob };

/** `/vane/plans` (PageVanePlan): each plan, its steps in order, whose each is, and how far along it is. */
function PlansPage() {
  const params = useSearchParams();
  const plans = useVanePlans();
  const { tickStep } = useVaneActions();
  const { toast } = useToast();
  const tick = (planId: string, stepId: string, done: boolean) =>
    tickStep.mutate(
      { planId, stepId, done },
      {
        onError: (error) =>
          toast({ title: "The step did not change", description: getApiErrorMessage(error, "Try again."), variant: "destructive" }),
      },
    );
  return (
    <>
      <PageChrome title="Plans" primary={GIVE_JOB} />
      <VaneFrame>
        {plans.data ? (
          <PlansView plans={plans.data.plans} selectedId={params.get("plan")} onTick={tick} busy={tickStep.isPending} />
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
