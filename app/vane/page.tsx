"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { Button } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { CardDrawer } from "@/components/vane/card-drawer";
import { ForYouView } from "@/components/vane/for-you-view";
import { useVaneActions, useVaneCard, useVaneForYou, useVaneNav } from "@/components/vane/use-vane";
import { VaneError, VaneFrame, VaneLoading } from "@/components/vane/vane-frame";
import { getApiErrorMessage } from "@/lib/api-client";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

/**
 * `/vane`: For you (VaneForYou) with Vane's states (PageVaneStates), and a
 * card's What I read (PageVaneCard, `?card=`). `?module=` narrows For you to
 * one module Vane watches; `?view=working` goes to Working on.
 */
function ForYouPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: session } = useSession();
  const watched = params.get("module");
  const cardId = params.get("card");
  const view = params.get("view");

  const home = useVaneForYou(watched);
  const nav = useVaneNav();
  const card = useVaneCard(cardId);
  const { notNow, pause } = useVaneActions();
  const canPause = VANE_SETTINGS_ROLES.includes(session?.user?.role ?? "");
  const paused = home.data?.status.paused ?? false;
  const moduleLabel = watched ? (nav.data?.watching.find((watch) => watch.key === watched)?.name ?? watched) : null;

  const go = React.useCallback(
    (next: Record<string, string | null>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null) merged.delete(key);
        else merged.set(key, value);
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Working on is the column beside the cards: the panel's row goes to it.
  const loaded = Boolean(home.data);
  React.useEffect(() => {
    if (view === "working" && loaded) document.getElementById("vn-working")?.scrollIntoView({ block: "start" });
  }, [view, loaded]);

  const setPaused = (next: boolean) =>
    pause.mutate(next, {
      onSuccess: () => toast({ title: next ? "Vane is paused" : "Vane is working again" }),
      onError: (error) =>
        toast({
          title: next ? "Vane did not pause" : "Vane did not resume",
          description: getApiErrorMessage(error, "Check the connection and try again."),
          variant: "destructive",
        }),
    });

  const mute = (id: string, reason: string) =>
    notNow.mutate(
      { id, reason },
      {
        onSuccess: () => {
          toast({ title: "Moved to Muted", description: `Reason: ${reason}.` });
          if (cardId === id) go({ card: null });
        },
        onError: (error) =>
          toast({ title: "The card did not move", description: getApiErrorMessage(error, "Try again."), variant: "destructive" }),
      },
    );

  const act = (target: string | undefined) => {
    if (target) router.push(target);
  };

  return (
    <>
      <PageChrome title="For you" sub={moduleLabel ? `From ${moduleLabel}` : null}>
        {canPause && home.data ? (
          <Button icon={paused ? "run" : "pause"} busy={pause.isPending} onClick={() => setPaused(!paused)}>
            {paused ? "Resume Vane" : "Pause Vane"}
          </Button>
        ) : null}
      </PageChrome>
      <VaneFrame screen="vane">
        {home.data ? (
          <ForYouView
            data={home.data}
            moduleLabel={moduleLabel}
            canPause={canPause}
            onResume={() => setPaused(false)}
            resuming={pause.isPending}
            onAct={(item, target) => act(target ?? item.action?.target)}
            onRead={(item) => go({ card: item.id })}
            onNotNow={(item, reason) => mute(item.id, reason)}
            muting={notNow.isPending ? (notNow.variables?.id ?? null) : null}
          />
        ) : home.isError ? (
          <VaneError what="For you" onRetry={() => home.refetch()} />
        ) : (
          <VaneLoading />
        )}
      </VaneFrame>
      <CardDrawer
        open={Boolean(cardId)}
        onOpenChange={(open) => (open ? null : go({ card: null }))}
        card={card.data ?? null}
        loading={card.isLoading}
        failed={card.isError}
        onAct={(item) => act(item.action?.target)}
        onNotNow={(item, reason) => mute(item.id, reason)}
        muting={notNow.isPending}
      />
    </>
  );
}

export default function VanePage() {
  // The card and the module are read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<VaneFrame screen="vane"><VaneLoading /></VaneFrame>}>
      <ForYouPage />
    </React.Suspense>
  );
}
