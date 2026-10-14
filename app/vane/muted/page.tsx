"use client";

import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { MutedView } from "@/components/vane/muted-view";
import { useVaneActions, useVaneMuted } from "@/components/vane/use-vane";
import { VaneError, VaneFrame, VaneLoading } from "@/components/vane/vane-frame";
import { getApiErrorMessage } from "@/lib/api-client";

/** `/vane/muted` (PageVaneMuted): the cards people set aside, with the reason each gave, and Bring back. */
export default function VaneMutedPage() {
  const muted = useVaneMuted();
  const { bringBack, chooseKind } = useVaneActions();
  const { toast } = useToast();
  const failed = (title: string) => (error: unknown) =>
    toast({ title, description: getApiErrorMessage(error, "Try again."), variant: "destructive" });
  return (
    <>
      <PageChrome title="Muted" />
      <VaneFrame>
        {muted.data ? (
          <MutedView
            muted={muted.data}
            busy={bringBack.isPending || chooseKind.isPending}
            onBringBack={(id) =>
              bringBack.mutate(id, {
                onSuccess: () => toast({ title: "Back in For you" }),
                onError: failed("The card did not come back"),
              })
            }
            onChoose={(id, stopped) =>
              chooseKind.mutate(
                { id, stopped },
                {
                  onSuccess: () =>
                    toast({ title: stopped ? "Vane will stop showing it to you" : "Vane will keep showing it to you" }),
                  onError: failed("Your choice was not kept"),
                },
              )
            }
          />
        ) : muted.isError ? (
          <VaneError what="Muted" onRetry={() => muted.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VaneFrame>
    </>
  );
}
