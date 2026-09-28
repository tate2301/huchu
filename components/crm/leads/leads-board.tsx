"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadStage } from "@prisma/client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchCrmLeadsBoard,
  updateCrmLeadStage,
  type CrmBoardCard,
  type CrmBoardColumn,
} from "@/lib/crm/crm-v2";
import type { LeadViewFilters } from "@/lib/crm/views";
import { LEAD_STAGE_COLOR, stageColor } from "@/lib/crm/tones";

import {
  RecordBoard,
  type RecordBoardCard,
  type RecordBoardColumn,
} from "@/components/crm/records/record-board";

import { LeadCardBody } from "./lead-card";
import { LostReasonDialog } from "./lost-reason-dialog";
import { CRM_STAGE_LABELS, formatLeadValue } from "./stage-config";

type BoardData = { columns: CrmBoardColumn[]; cardsPerColumn: number };

/** Move a card between columns in the cache, keeping counts and totals in step. */
function moveCardInCache(
  data: BoardData,
  leadId: string,
  toStage: CrmLeadStage,
): BoardData {
  let moved: CrmBoardCard | undefined;
  const stripped = data.columns.map((column) => {
    const found = column.leads.find((lead) => lead.id === leadId);
    if (!found) return column;
    moved = found;
    const value = found.estimatedValue ?? 0;
    return {
      ...column,
      count: Math.max(0, column.count - 1),
      totalValue: column.totalValue - value,
      leads: column.leads.filter((lead) => lead.id !== leadId),
    };
  });

  if (!moved) return data;
  const card = { ...moved, stage: toStage, stageEnteredAt: new Date().toISOString() };
  const value = card.estimatedValue ?? 0;

  return {
    ...data,
    columns: stripped.map((column) =>
      column.stage === toStage
        ? {
            ...column,
            count: column.count + 1,
            totalValue: column.totalValue + value,
            leads: [card, ...column.leads],
          }
        : column,
    ),
  };
}

export function LeadsBoard({ filters }: { filters: LeadViewFilters }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingLost, setPendingLost] = useState<CrmBoardCard | null>(null);
  // Settles the board's move once the lost-reason dialog closes either way.
  const closeLost = useRef<(() => void) | null>(null);

  const queryKey = useMemo(() => ["crm", "board", filters] as const, [filters]);

  const boardQuery = useQuery({
    queryKey,
    queryFn: () => fetchCrmLeadsBoard(filters),
    placeholderData: (previous) => previous,
  });

  const moveStage = useMutation({
    mutationFn: ({
      leadId,
      stage,
      lostReason,
    }: {
      leadId: string;
      stage: CrmLeadStage;
      lostReason?: string;
    }) => updateCrmLeadStage(leadId, stage, lostReason),
    onMutate: async ({ leadId, stage }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BoardData>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, moveCardInCache(previous, leadId, stage));
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      // Put it back where it was: a card that stayed in the new column after a
      // failed save is a lie the next reader has no way to spot.
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({
        title: "Could not move the lead",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "board"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
    },
  });

  // Filtering by stage on a board means the columns you unticked go away.
  // Leaving them in place and emptying them is the version that looks broken:
  // eight columns, two with cards, and no explanation.
  const allColumns = boardQuery.data?.columns;
  const chosen = filters.stages;
  const columns = useMemo(
    () =>
      chosen && chosen.length > 0
        ? (allColumns ?? []).filter((column) => chosen.includes(column.stage))
        : (allColumns ?? []),
    [allColumns, chosen],
  );

  // Columns report their own currency mix; the first lead's currency is a
  // reasonable label for a tenant that trades in one.
  const currency =
    columns.flatMap((column) => column.leads).find((lead) => lead.currency)?.currency ?? "USD";

  const boardColumns = useMemo<RecordBoardColumn[]>(
    () =>
      columns.map((column) => ({
        id: column.stage,
        name: CRM_STAGE_LABELS[column.stage],
        dot: (LEAD_STAGE_COLOR[column.stage] ?? stageColor(null)).dot,
        count: column.count,
        total: column.totalValue > 0 ? formatLeadValue(column.totalValue, currency) : undefined,
        footer: column.hasMore
          ? `Showing ${column.leads.length} of ${column.count}. The table has the rest.`
          : undefined,
      })),
    [columns, currency],
  );

  const cards = useMemo<RecordBoardCard[]>(
    () =>
      columns.flatMap((column) =>
        column.leads.map((lead) => ({
          id: lead.id,
          columnId: column.stage,
          // Once promoted, the deal is the live record — the lead behind it is
          // history. Opening the lead from the board would show the husk.
          href: lead.deal ? `/crm/deals/${lead.deal.id}` : `/crm/leads/${lead.id}`,
          label: lead.title ?? lead.leadNo,
          content: <LeadCardBody lead={lead} />,
          row: {
            title: lead.title ?? lead.leadNo,
            subtitle: [
              lead.deal?.dealNo ?? lead.leadNo,
              lead.client?.name ?? lead.contactName ?? "No client",
            ].join(" · "),
            facts: [
              {
                value: formatLeadValue(lead.estimatedValue, lead.currency ?? currency),
                mono: true,
                primary: true,
              },
            ],
          },
        })),
      ),
    [columns, currency],
  );

  const { mutateAsync } = moveStage;
  const onMove = useCallback(
    (leadId: string, stage: string) => {
      // Lost needs a reason. The card waits in the Lost column while the
      // dialog asks for it, so the question reads as a consequence of the
      // drop; cancelling puts it back.
      if (stage === "LOST") {
        const lead = columns.flatMap((column) => column.leads).find((item) => item.id === leadId);
        if (!lead) return Promise.resolve();
        setPendingLost(lead);
        return new Promise<void>((resolve) => {
          closeLost.current = resolve;
        });
      }
      return mutateAsync({ leadId, stage: stage as CrmLeadStage });
    },
    [columns, mutateAsync],
  );

  const finishLost = () => {
    closeLost.current?.();
    closeLost.current = null;
    setPendingLost(null);
  };

  if (boardQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load the pipeline</AlertTitle>
        <AlertDescription>{getApiErrorMessage(boardQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <RecordBoard
        columns={boardColumns}
        cards={cards}
        isLoading={boardQuery.isLoading}
        noun={{ one: "lead", many: "leads" }}
        emptyLabel="No leads in this stage"
        onMove={onMove}
      />

      <LostReasonDialog
        open={Boolean(pendingLost)}
        leadLabel={pendingLost?.title ?? pendingLost?.leadNo}
        isPending={moveStage.isPending}
        onCancel={finishLost}
        onConfirm={(reason) => {
          if (!pendingLost) return;
          mutateAsync({ leadId: pendingLost.id, stage: "LOST", lostReason: reason })
            .catch(() => undefined)
            .finally(finishLost);
        }}
      />
    </>
  );
}
