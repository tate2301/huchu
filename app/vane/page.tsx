"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ForYouView } from "@/components/vane/for-you-view";
import { useDecideAction, useVaneActions, useVaneForYou, useVaneWatching } from "@/components/vane/use-vane";
import { VaneCardDrawer } from "@/components/vane/vane-card-drawer";
import { VaneError, VaneLoading, VanePage } from "@/components/vane/vane-page";
import { getApiErrorMessage } from "@/lib/api-client";
import type { VaneCard } from "@/lib/vane/panel";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

/** For you (design/core-modules/html/vane.html): everything Vane has for this person, across the workspace. */
function ForYou() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: session } = useSession();
  const forYou = useVaneForYou();
  const watching = useVaneWatching();
  const { notNow, act: actOn, pause } = useVaneActions();
  const decide = useDecideAction();
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


  // The card open beside the list, by its id in the address (`?card=`), so it can be linked to.
  const openId = params.get("card");
  const openCard = forYou.data?.items.find((card) => card.id === openId) ?? null;
  const showCard = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("card", id);
    else next.delete("card");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // The card's own act goes to Done with this person's name; its second, quieter
  // way in ("Read them first") only looks.
  const act = (card: VaneCard, target?: string) => {
    if (!target) actOn.mutate({ id: card.id });
    const to = target ?? card.action?.target;
    if (to) router.push(to);
  };

  const mute = (card: VaneCard, reason: string) => {
    if (openId === card.id) showCard(null);
    notNow.mutate(
      { id: card.id, reason },
      {
        onError: (error) =>
          toast({
            title: "The card is still here",
            description: getApiErrorMessage(error, "Check the connection and try again."),
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <>
      <PageChrome title="For you" />
      <VanePage screen="vane">
        {forYou.data ? (
          <ForYouView
            panel={forYou.data}
            from={from ? { key: from.key, name: from.name } : null}
            canResume={canPause}
            onResume={() => setPaused(false)}
            resuming={pause.isPending}
            onAct={act}
            onRead={(card) => showCard(card.id)}
            onMute={mute}
            deciding={decide.isPending ? (decide.variables?.id ?? null) : null}
            onDecide={(action, decision) =>
              decide.mutate(
                { id: action.id, ...decision },
                {
                  onError: (error) =>
                    toast({
                      title: decision.approve ? "That did not happen" : "Not recorded",
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
      <VaneCardDrawer card={openCard} onClose={() => showCard(null)} onAct={(card) => act(card)} onMute={mute} />
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
