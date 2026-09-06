"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { LostReasonDialog } from "@/components/crm/leads/lost-reason-dialog";
import { ArrowRight } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

type Stage = { id: string; name: string; status: "OPEN" | "WON" | "LOST"; position: number };

/**
 * The stage stepper on a deal, driven by the pipeline's own configured stages
 * rather than a fixed list. Won and Lost sit apart from the path because they
 * are outcomes, not steps along it.
 */
export function DealStageBar({
  dealId,
  stages,
  currentStageId,
  checklist,
  pipelineName,
  compact,
}: {
  dealId: string;
  stages: Stage[];
  currentStageId: string;
  checklist: Array<{ key: string; label: string }> | null;
  pipelineName: string;
  /**
   * The band's stage rail rather than the standing column's stepper.
   *
   * Two controls for two shapes, the same split the lead record makes. The
   * band has horizontal room and none to spare vertically — 44px, and a
   * control that grew it would push the sticky stack down on record pages
   * only — so it gets the rail. The column is the reverse shape, so it keeps
   * the stepper, which stacks.
   */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingLost, setPendingLost] = useState<Stage | null>(null);
  const [blockers, setBlockers] = useState<{ stage: Stage; reasons: string[] } | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // The move owns its own request so it can catch the 409 the API returns when
  // a stage's requirements are unmet, and offer to proceed anyway.
  const move = useMutation({
    mutationFn: async (input: { stage: Stage; lostReason?: string; force?: boolean }) => {
      const response = await fetch(`/api/v2/crm/deals/${dealId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId: input.stage.id,
          lostReason: input.lostReason,
          force: input.force,
        }),
      });
      const payload = await response.json();
      if (response.status === 409 && payload?.code === "STAGE_REQUIREMENTS") {
        return {
          kind: "blocked" as const,
          stage: input.stage,
          reasons: (payload.blockers ?? []) as string[],
        };
      }
      if (!response.ok) throw new Error(payload?.error ?? "Could not move the deal");
      return { kind: "moved" as const, stage: input.stage };
    },
    onSuccess: (result) => {
      if (result.kind === "blocked") {
        setBlockers({ stage: result.stage, reasons: result.reasons });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["crm", "deal", dealId] });
      queryClient.invalidateQueries({ queryKey: ["crm", "deals"] });
      toast({ title: `Moved to ${result.stage.name}` });
    },
    onError: (error) =>
      toast({
        title: "Could not move the deal",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
  });

  const isPending = move.isPending;

  const path = stages.filter((stage) => stage.status === "OPEN").sort((a, b) => a.position - b.position);
  const wonStage = stages.find((stage) => stage.status === "WON");
  const lostStage = stages.find((stage) => stage.status === "LOST");
  const currentIndex = path.findIndex((stage) => stage.id === currentStageId);

  const requestMove = (stage: Stage) => {
    if (stage.id === currentStageId) return;
    if (stage.status === "LOST") {
      setPendingLost(stage);
      return;
    }
    move.mutate({ stage });
  };

  // One copy, shared by both shapes: a move can be refused for unmet
  // requirements or need a lost reason wherever it was pressed from.
  const dialogs = (
    <>
    <LostReasonDialog
      open={Boolean(pendingLost)}
      isPending={isPending}
      onCancel={() => setPendingLost(null)}
      onConfirm={(reason) => {
        if (pendingLost) move.mutate({ stage: pendingLost, lostReason: reason });
        setPendingLost(null);
      }}
    />

    <Dialog
      open={Boolean(blockers)}
      onOpenChange={(next) => (!next ? setBlockers(null) : undefined)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This stage expects a bit more</DialogTitle>
          <DialogDescription>
            You can move it anyway, but here is what is usually done first.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {blockers?.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBlockers(null)}>
            Go back
          </Button>
          <Button
            onClick={() => {
              if (blockers) move.mutate({ stage: blockers.stage, force: true });
              setBlockers(null);
            }}
          >
            Move anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );

  /*
    The band's stage rail — the same control the lead record carries.

    Every stage named inline at 22px with the current one filled, in the ink
    rather than the brand: a row of chips with one brand-tinted competes with
    every other blue on the page, where solid near-black reads as "you are
    here" without claiming to be an action. Won and Lost sit on the end of the
    same run, because a deal that is Won should say so where a deal that is
    Quoted says that.
  */
  if (compact) {
    const rail = [...path, wonStage, lostStage].filter(
      (stage): stage is Stage => stage !== undefined,
    );
    const next = currentIndex >= 0 ? path[currentIndex + 1] : undefined;

    return (
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="flex min-w-0 items-center gap-[3px] overflow-x-auto"
          role="tablist"
          aria-label={`${pipelineName} stage`}
        >
          {rail.map((stage) => {
            const isCurrent = stage.id === currentStageId;
            return (
              <button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                disabled={isPending}
                onClick={() => requestMove(stage)}
                className={cn(
                  "acct-stage-chip disabled:cursor-not-allowed disabled:opacity-60",
                  isCurrent
                    ? "bg-[var(--text-strong)] font-bold text-[var(--surface)]"
                    : "font-medium text-[var(--text-subtle)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-body)]",
                )}
              >
                {stage.name}
              </button>
            );
          })}
        </div>

        {next ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={isPending}
            onClick={() => requestMove(next)}
            endIcon={<ArrowRight className="size-3.5" aria-hidden="true" />}
          >
            Move to {next.name}
          </Button>
        ) : null}

        {dialogs}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--text-muted)]">{pipelineName}</p>

      <div className="flex flex-wrap gap-1">
        {path.map((stage, index) => {
          const isCurrent = stage.id === currentStageId;
          const isPast = currentIndex > index;
          return (
            <button
              key={stage.id}
              type="button"
              disabled={isPending}
              onClick={() => requestMove(stage)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "rounded-[var(--button-radius)] px-2 py-1 text-sm font-medium transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isCurrent
                  ? "bg-[var(--action-primary-bg)] text-[var(--action-primary-text)]"
                  : isPast
                    ? "bg-[var(--surface-subtle)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
              )}
            >
              {stage.name}
            </button>
          );
        })}
      </div>

      <div className="flex gap-1">
        {wonStage ? (
          <Button
            size="sm"
            variant={currentStageId === wonStage.id ? "default" : "outline"}
            className="flex-1"
            disabled={isPending}
            onClick={() => requestMove(wonStage)}
          >
            {wonStage.name}
          </Button>
        ) : null}
        {lostStage ? (
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={isPending}
            onClick={() => requestMove(lostStage)}
          >
            {lostStage.name}
          </Button>
        ) : null}
      </div>

      {checklist && checklist.length > 0 ? (
        <div className="space-y-1 border-t border-[var(--border)] pt-2">
          <p className="text-sm text-[var(--text-muted)]">What should happen at this stage</p>
          {checklist.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={checked[item.key] === true}
                onCheckedChange={(value) =>
                  setChecked((prev) => ({ ...prev, [item.key]: value === true }))
                }
                className="mt-0.5"
              />
              <span className={checked[item.key] ? "text-[var(--text-muted)] line-through" : ""}>
                {item.label}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {dialogs}
    </div>
  );
}

/**
 * "What should happen at this stage", as a scratch list.
 *
 * Deliberately not persisted — ticking a box here is a reader keeping their
 * place while they work the deal, not a claim recorded against it. The stage's
 * real requirements are enforced by the server on the move, which is what the
 * blockers dialog reports.
 *
 * Split out of `DealStageBar` because the stage control moved to the band,
 * where a stack of checkboxes has nowhere to go: 44px, and the band is shared
 * with the identity and the figure. The checklist belongs in the column, which
 * is the shape that stacks.
 */
export function StageChecklist({
  checklist,
}: {
  checklist: Array<{ key: string; label: string }>;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-1">
      {checklist.map((item) => (
        <label key={item.key} className="flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox
            checked={checked[item.key] === true}
            onCheckedChange={(value) =>
              setChecked((prev) => ({ ...prev, [item.key]: value === true }))
            }
            className="mt-0.5"
          />
          <span className={checked[item.key] ? "text-[var(--text-muted)] line-through" : ""}>
            {item.label}
          </span>
        </label>
      ))}
    </div>
  );
}
