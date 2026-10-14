"use client";

import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";

import { PlansView } from "./plans-view";
import { useVaneActions, useVanePlans } from "./use-vane";
import { VaneError, VaneLoading, VanePage } from "./vane-page";

/** Plans (design/core-modules/boards/view/PageVanePlan.html): `/vane/plans`, and one plan at `/vane/plans/<id>`. */
export function VanePlansPage({ planId }: { planId: string | null }) {
  const { toast } = useToast();
  const plans = useVanePlans();
  const { tick, start } = useVaneActions();
  const chosen = plans.data?.find((plan) => plan.id === planId) ?? null;

  return (
    <>
      <PageChrome
        title={planId && chosen ? chosen.title : "Plans"}
        backHref={planId ? "/vane/plans" : undefined}
        backLabel={planId ? "Plans" : undefined}
      />
      <VanePage screen="vane">
        {plans.data ? (
          <PlansView
            plans={plans.data}
            chosenId={planId}
            showList={!planId}
            ticking={tick.isPending}
            starting={start.isPending}
            onStart={(plan) =>
              start.mutate(
                { planId: plan.id },
                {
                  onSuccess: () => toast({ title: "Started", description: "Vane takes the first step on its next tick." }),
                  onError: (error) =>
                    toast({
                      title: "The plan did not start",
                      description: getApiErrorMessage(error, "Check the connection and try again."),
                      variant: "destructive",
                    }),
                },
              )
            }
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
