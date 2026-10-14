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
  const { unmute } = useVaneActions();

  return (
    <>
      <PageChrome title="Muted" />
      <VanePage screen="vane">
        {muted.data ? (
          <MutedView
            rows={muted.data}
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
