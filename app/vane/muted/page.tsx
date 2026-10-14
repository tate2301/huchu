"use client";

import * as React from "react";

import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { MutedView } from "@/components/vane/muted-view";
import { useVaneActions, useVaneMuted, useVaneTopic } from "@/components/vane/use-vane";
import { VaneError, VaneLoading, VanePage } from "@/components/vane/vane-page";
import { getApiErrorMessage } from "@/lib/api-client";

/** "Keep showing it" is this viewer's answer for this month, kept in the browser: next month Vane may ask again. */
const KEPT = () => `vane-kept-topics-${new Date().toISOString().slice(0, 7)}`;

function keptThisMonth(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEPT()) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function keepForMonth(topic: string): string[] {
  const next = [...new Set([...keptThisMonth(), topic])];
  try {
    window.localStorage.setItem(KEPT(), JSON.stringify(next));
  } catch {
    // Without storage the offer simply goes until the page is opened again.
  }
  return next;
}

/** Muted (design/core-modules/boards/view/PageVaneMuted.html). */
export default function VaneMutedPage() {
  const { toast } = useToast();
  const muted = useVaneMuted();
  const { unmute } = useVaneActions();
  const topic = useVaneTopic();
  const [kept, setKept] = React.useState<string[]>(() => keptThisMonth());

  return (
    <>
      <PageChrome title="Muted" />
      <VanePage screen="vane">
        {muted.data ? (
          <MutedView
            rows={muted.data.cards}
            offers={muted.data.offers.filter((offer) => !kept.includes(offer.topic))}
            stopped={muted.data.stopped}
            changingTopic={topic.isPending ? (topic.variables?.topic ?? null) : null}
            onKeep={(name) => setKept(keepForMonth(name))}
            onTopic={(name, stop) =>
              topic.mutate(
                { topic: name, stopped: stop },
                {
                  onSuccess: () => toast({ title: stop ? `You won't see “${name}” any more` : `“${name}” is back on For you` }),
                  onError: (error) => toast({ title: "Not changed", description: getApiErrorMessage(error), variant: "destructive" }),
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
