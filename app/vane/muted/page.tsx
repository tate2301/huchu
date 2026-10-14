"use client";

import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { MutedView } from "@/components/vane/muted-view";
import { useVaneActions, useVaneMuted } from "@/components/vane/use-vane";
import { VaneError, VaneLoading, VanePage } from "@/components/vane/vane-page";
import { getApiErrorMessage } from "@/lib/api-client";

/** Muted (design/core-modules/boards/view/PageVaneMuted.html). */
export default function VaneMutedPage() {
  const { toast } = useToast();
  const muted = useVaneMuted();
  const { unmute, chooseKind } = useVaneActions();

  return (
    <>
      <PageChrome title="Muted" />
      <VanePage screen="vane">
        {muted.data ? (
          <MutedView
            rows={muted.data.cards}
            offer={muted.data.offer}
            choosing={chooseKind.isPending}
            onChoose={(offer, stopped) =>
              chooseKind.mutate(
                { id: offer.itemId, stopped },
                {
                  onSuccess: () => toast({ title: stopped ? "Vane will stop showing it to you" : "Vane will keep showing it to you" }),
                  onError: (error) =>
                    toast({
                      title: "Your choice was not kept",
                      description: getApiErrorMessage(error, "Check the connection and try again."),
                      variant: "destructive",
                    }),
                },
              )
            }
            bringing={unmute.isPending ? (unmute.variables?.id ?? null) : null}
            onBringBack={(row) =>
              unmute.mutate(
                { id: row.id },
                {
                  onSuccess: () => toast({ title: "Back on For you" }),
                  onError: (error) =>
                    toast({
                      title: "The card is still muted",
                      description: getApiErrorMessage(error, "Check the connection and try again."),
                      variant: "destructive",
                    }),
                },
              )
            }
          />
        ) : muted.isError ? (
          <VaneError what="Muted" onRetry={() => muted.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VanePage>
    </>
  );
}
