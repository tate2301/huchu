"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { LostReasonDialog } from "@/components/crm/leads/lost-reason-dialog";
import { RailSection } from "@/components/records/record-page-shell";
import { StageMenu, type StageMenuStage } from "@/components/records/stage-menu";
import { Check } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Stage = { id: string; name: string; status: "OPEN" | "WON" | "LOST"; position: number };

/**
 * A deal's stage, driven by the pipeline's own configured stages rather than a
 * fixed list, as the app bar's stage menu. Won and Lost sit apart from the path
 * because they are outcomes, not steps along it. A move the stage's
 * requirements refuse, or one to Lost, asks first.
 */
export function DealStageBar({
  dealId,
  stages,
  currentStageId,
  pipelineName,
}: {
  dealId: string;
  stages: Stage[];
  currentStageId: string;
  pipelineName: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingLost, setPendingLost] = useState<Stage | null>(null);
  const [blockers, setBlockers] = useState<{ stage: Stage; reasons: string[] } | null>(null);

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

  const options: StageMenuStage[] = [
    ...path.map((stage) => ({ id: stage.id, label: stage.name })),
    ...[wonStage, lostStage]
      .filter((stage): stage is Stage => stage !== undefined)
      .map((stage) => ({ id: stage.id, label: stage.name, outcome: true })),
  ];

  return (
    <>
      <StageMenu
        label={`${pipelineName} stage`}
        stages={options}
        currentId={currentStageId}
        disabled={isPending}
        onPick={(picked) => {
          const stage = stages.find((entry) => entry.id === picked.id);
          if (stage) requestMove(stage);
        }}
      />
      {dialogs}
    </>
  );
}

/**
 * "What should happen at this stage", as a scratch list with its tally.
 *
 * Deliberately not persisted — ticking a box here is a reader keeping their
 * place while they work the deal, not a claim recorded against it. The stage's
 * real requirements are enforced by the server on the move, which is what the
 * blockers dialog reports.
 */
export function StageChecklist({
  title,
  checklist,
}: {
  title: string;
  checklist: Array<{ key: string; label: string }>;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const done = checklist.filter((item) => checked[item.key]).length;

  return (
    <RailSection title={title} meta={`${done} of ${checklist.length}`}>
      <div className="rec-checks">
        {checklist.map((item) => {
          const isDone = checked[item.key] === true;
          return (
            <button
              key={item.key}
              type="button"
              role="checkbox"
              aria-checked={isDone}
              className={cn("rec-check", isDone && "is-done")}
              onClick={() => setChecked((prev) => ({ ...prev, [item.key]: !isDone }))}
            >
              <span className="rec-check-bx" aria-hidden="true">
                <Check />
              </span>
              <span className="rec-check-t">{item.label}</span>
            </button>
          );
        })}
      </div>
    </RailSection>
  );
}
