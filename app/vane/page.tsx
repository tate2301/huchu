"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { Button } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ForYouView } from "@/components/vane/for-you-view";
import { useVaneActions, useVaneForYou, useVaneWatching } from "@/components/vane/use-vane";
import { VaneError, VaneLoading, VanePage } from "@/components/vane/vane-page";
import { getApiErrorMessage } from "@/lib/api-client";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

/** For you (design/core-modules/html/vane.html): everything Vane has for this person, across the workspace. */
function ForYou() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: session } = useSession();
  const forYou = useVaneForYou();
  const watching = useVaneWatching();
  const { notNow, pause } = useVaneActions();
  const canPause = VANE_SETTINGS_ROLES.includes(session?.user?.role ?? "");

  const fromKey = params.get("from");
  const from = fromKey ? (watching.data?.find((module) => module.key === fromKey) ?? null) : null;

  const setPaused = (paused: boolean) =>
    pause.mutate(paused, {
      onError: (error) =>
        toast({
          title: paused ? "Vane did not pause" : "Vane did not resume",
          description: getApiErrorMessage(error, "Check the connection and try again."),
          variant: "destructive",
        }),
    });

  const paused = forYou.data?.status.paused ?? false;

  return (
    <>
      <PageChrome title="For you">
        {canPause && forYou.data && !paused ? (
          <Button icon="pause" busy={pause.isPending} onClick={() => setPaused(true)}>
            Pause Vane
          </Button>
        ) : null}
      </PageChrome>
      <VanePage screen="vane">
        {forYou.data ? (
          <ForYouView
            panel={forYou.data}
            from={from ? { key: from.key, name: from.name } : null}
            canResume={canPause}
            onResume={() => setPaused(false)}
            resuming={pause.isPending}
            onAct={(card, target) => {
              const to = target ?? card.action?.target;
              if (to) router.push(to);
            }}
            onNotNow={(card) =>
              notNow.mutate(
                { id: card.id },
                {
                  onError: (error) =>
                    toast({
                      title: "The card is still here",
                      description: getApiErrorMessage(error, "Check the connection and try again."),
                      variant: "destructive",
                    }),
                },
              )
            }
          />
        ) : forYou.isError ? (
          <VaneError what="For you" onRetry={() => forYou.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VanePage>
    </>
  );
}

export default function VaneForYouPage() {
  // The module filter is read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<VanePage screen="vane"><VaneLoading /></VanePage>}>
      <ForYou />
    </React.Suspense>
  );
}
