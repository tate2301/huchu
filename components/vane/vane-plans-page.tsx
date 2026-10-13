"use client";

import * as React from "react";

import { PageChrome } from "@/components/layout/page-chrome";
import { useShell } from "@/components/layout/shell-state";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";

import { PlansView } from "./plans-view";
import { useVaneActions, useVanePlans } from "./use-vane";
import { VaneError, VaneLoading, VanePage } from "./vane-page";

/** Plans (design/core-modules/boards/view/PageVanePlan.html): `/vane/plans`, and one plan at `/vane/plans/<id>`. */
export function VanePlansPage({ planId }: { planId: string | null }) {
  const { toast } = useToast();
  const shell = useShell();
  const plans = useVanePlans();
  const { tick } = useVaneActions();
  const { setVaneJobOpen } = shell;
  // One object across renders: the header holds on to it.
  const giveJob = React.useMemo(
    () => ({ label: "Give Vane a job", icon: "plus" as const, shortcut: "Ctrl J", onClick: () => setVaneJobOpen(true) }),
    [setVaneJobOpen],
  );
  const chosen = plans.data?.find((plan) => plan.id === planId) ?? null;

  return (
    <>
      <PageChrome
        title={planId && chosen ? chosen.title : "Plans"}
        backHref={planId ? "/vane/plans" : undefined}
        backLabel={planId ? "Plans" : undefined}
        primary={giveJob}
      />
      <VanePage screen="vane">
        {plans.data ? (
          <PlansView
            plans={plans.data}
            chosenId={planId}
            showList={!planId}
            ticking={tick.isPending}
            onTick={(plan, step, done) =>
              tick.mutate(
                { planId: plan.id, stepId: step.id, done },
                {
                  onError: (error) =>
                    toast({
                      title: "The step did not change",
                      description: getApiErrorMessage(error, "Check the connection and try again."),
                      variant: "destructive",
                    }),
                },
              )
            }
          />
        ) : plans.isError ? (
          <VaneError what="Plans" onRetry={() => plans.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VanePage>
    </>
  );
}
