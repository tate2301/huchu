"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BooksLoading } from "@/components/books/books-state";
import { Button, Empty, Kit, KitScreen } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { RemindPageView } from "@/components/schools/fees/remind-view";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { VaneActionView } from "@/lib/vane/actions/engine";
import type { RemindersPage } from "@/lib/schools/fee-reminders";

/**
 * Remind families (PageVaneSchool): the fee reminder Vane drafted, for a
 * person to change and send. Send approves Vane's action with the words and
 * the ticks as they left them (`POST /api/vane/actions/[id]`), which sends
 * each family its own reminder as them; Discard the drafts denies it.
 */
export default function RemindFamiliesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const page = useQuery({
    queryKey: ["schools", "fees", "reminders"],
    queryFn: () => fetchJson<RemindersPage>("/api/v2/schools/fees/reminders"),
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
  });
  const draft = page.data?.draft ?? null;

  const [message, setMessage] = React.useState<string | null>(null);
  const [leaveOut, setLeaveOut] = React.useState<string[] | null>(null);
  const words = message ?? draft?.message ?? "";
  const left = leaveOut ?? draft?.leaveOut ?? [];
  const going = draft ? draft.families.filter((family) => !left.includes(family.studentId)).length : 0;

  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      fetchJson<{ action: VaneActionView }>(`/api/vane/actions/${draft!.actionId}`, {
        method: "POST",
        body: JSON.stringify(approve ? { approve: true, changes: { message: words, leaveOut: left } } : { approve: false }),
      }),
    onSuccess: ({ action }, approve) => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "fees", "reminders"] });
      void queryClient.invalidateQueries({ queryKey: ["vane"] });
      if (!approve) {
        toast({ title: "The drafts are discarded", description: "No family was written to." });
        router.push("/schools/fees");
        return;
      }
      if (action.status === "failed") {
        toast({ title: "The reminders did not go", description: action.result ?? undefined, variant: "destructive" });
        return;
      }
      toast({ title: action.result ?? "The reminders went" });
      router.push("/schools/fees");
    },
    onError: (error) =>
      toast({ title: "Nothing was sent", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const refused = page.error instanceof ApiError && page.error.status === 403;
  const send = draft
    ? going > 0
      ? {
          label: going === 1 ? "Send 1 reminder" : `Send ${going} reminders`,
          icon: "send" as const,
          shortcut: "S",
          onClick: () => (decide.isPending ? undefined : decide.mutate(true)),
        }
      : { label: "Send the reminders", disabled: "Tick at least one family." }
    : null;

  return (
    <>
      <PageChrome title="Remind families" backHref="/schools/fees" backLabel="Fees" primary={send}>
        {draft ? (
          <Kit contents>
            <Button icon="x" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
              Discard the drafts
            </Button>
          </Kit>
        ) : null}
      </PageChrome>
      <Kit className="kit-main">
        <KitScreen slug="schools-remind">
          <div className="mn">
            {draft ? (
              <RemindPageView
                draft={draft}
                message={words}
                leaveOut={left}
                disabled={decide.isPending}
                onMessage={setMessage}
                onTick={(studentId, ticked) =>
                  setLeaveOut((current) => {
                    const now = current ?? draft.leaveOut;
                    return ticked ? now.filter((id) => id !== studentId) : [...new Set([...now, studentId])];
                  })
                }
              />
            ) : page.data ? (
              <Empty icon="remind" title="No reminder waits for you">
                When families fall behind on this term’s fees, Vane drafts a reminder for each, for you to check and send. Fees lists who owes now.
              </Empty>
            ) : refused ? (
              <Empty icon="lock" title="Reminders are the bursary’s">
                Your role cannot write to families. The bursar or the head can.
              </Empty>
            ) : page.isError ? (
              <Empty
                icon="warn"
                title="The reminders did not load"
                action={
                  <Button icon="history" onClick={() => page.refetch()}>
                    Try again
                  </Button>
                }
              >
                Check the connection and try again.
              </Empty>
            ) : (
              <BooksLoading />
            )}
          </div>
        </KitScreen>
      </Kit>
    </>
  );
}
