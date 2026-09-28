"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadStage } from "@prisma/client";

import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { updateCrmLeadStage, type CrmLeadListRecord, type RegisterBoardData } from "@/lib/crm/crm-v2";
import { LEAD_STAGE_COLOR, stageColor } from "@/lib/crm/tones";

import type { RegisterHandle } from "@/components/crm/registers/use-register";
import {
  RecordBoard,
  type RecordBoardCard,
  type RecordBoardColumn,
} from "@/components/crm/records/record-board";

import { LeadCardBody } from "./lead-card";
import { LostReasonDialog } from "./lost-reason-dialog";
import { formatLeadValue } from "./stage-config";

type Lead = CrmLeadListRecord;
type LeadBoard = RegisterBoardData<Lead>;

/** Move a card between columns in the cache, keeping counts and totals in step. */
function moveCardInCache(board: LeadBoard, leadId: string, toStage: string): LeadBoard {
  let moved: Lead | undefined;
  const stripped = board.columns.map((column) => {
    const found = column.cards.find((lead) => lead.id === leadId);
    if (!found) return column;
    moved = found;
    return {
      ...column,
      count: Math.max(0, column.count - 1),
      totalValue: column.totalValue - (found.estimatedValue ?? 0),
      cards: column.cards.filter((lead) => lead.id !== leadId),
    };
  });

  if (!moved) return board;
  const card = { ...moved, stage: toStage as CrmLeadStage, stageEnteredAt: new Date().toISOString() };

  return {
    ...board,
    columns: stripped.map((column) =>
      column.stage.id === toStage
        ? {
            ...column,
            count: column.count + 1,
            totalValue: column.totalValue + (card.estimatedValue ?? 0),
            cards: [card, ...column.cards],
          }
        : column,
    ),
  };
}

/**
 * The leads as a board, a column per stage, read by the leads list with its
 * own filters — a stage filter chooses the columns. Dropping a card on Lost
 * asks why before it lands.
 */
export function LeadsBoard({ register }: { register: RegisterHandle<Lead> }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { query: boardQuery, queryKey } = register.board;
  const [pendingLost, setPendingLost] = useState<Lead | null>(null);
  // Settles the board's move once the lost-reason dialog closes either way.
  const closeLost = useRef<(() => void) | null>(null);

  const moveStage = useMutation({
    mutationFn: ({ leadId, stage, lostReason }: { leadId: string; stage: CrmLeadStage; lostReason?: string }) =>
      updateCrmLeadStage(leadId, stage, lostReason),
    onMutate: async ({ leadId, stage }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<LeadBoard>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, moveCardInCache(previous, leadId, stage));
      return { previous };
    },
    onError: (error, _variables, context) => {
      // Put it back where it was: a card that stayed in the new column after a
      // failed save is a lie the next reader has no way to spot.
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({ title: "Could not move the lead", description: getApiErrorMessage(error), variant: "destructive" });
    },
    // The board and every page of the list share the leads prefix.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
  });

  const board = boardQuery.data;
  const leads = useMemo(() => (board?.columns ?? []).flatMap((column) => column.cards), [board]);
  // Columns report their own currency mix; the first lead's currency is a
  // reasonable label for a tenant that trades in one.
  const currency = leads.find((lead) => lead.currency)?.currency ?? "USD";
  const { set } = register;

  const columns = useMemo<RecordBoardColumn[]>(
    () =>
      (board?.columns ?? []).map((column) => ({
        id: column.stage.id,
        name: column.stage.name,
        dot: (LEAD_STAGE_COLOR[column.stage.id as CrmLeadStage] ?? stageColor(null)).dot,
        count: column.count,
        total: column.totalValue > 0 ? formatLeadValue(column.totalValue, currency) : undefined,
        // Past the cards a column draws, the table has the rest of them.
        footer: column.hasMore ? (
          <button
            type="button"
            className="underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--text-strong)]"
            onClick={() =>
              set((previous) => ({
                ...previous,
                layout: "TABLE",
                filters: { ...previous.filters, stage: [column.stage.id] },
              }))
            }
          >
            Showing <span className="font-mono tabular-nums">{column.cards.length}</span> of{" "}
            <span className="font-mono tabular-nums">{column.count}</span> — see them all
          </button>
        ) : undefined,
      })),
    [board, currency, set],
  );

  const cards = useMemo<RecordBoardCard[]>(
    () =>
      (board?.columns ?? []).flatMap((column) =>
        column.cards.map((lead) => ({
          id: lead.id,
          columnId: column.stage.id,
          // Once promoted, the deal is the live record — the lead behind it is
          // history. Opening the lead from the board would show the husk.
          href: lead.deal ? `/crm/deals/${lead.deal.id}` : `/crm/leads/${lead.id}`,
          label: lead.title ?? lead.leadNo,
          content: <LeadCardBody lead={lead} />,
          row: {
            title: lead.title ?? lead.leadNo,
            subtitle: [lead.deal?.dealNo ?? lead.leadNo, lead.client?.name ?? lead.contactName ?? "No client"].join(
              " · ",
            ),
            facts: [
              {
                value: formatLeadValue(lead.deal?.value ?? lead.estimatedValue, lead.currency ?? currency),
                mono: true,
                primary: true,
              },
            ],
          },
        })),
      ),
    [board, currency],
  );

  const { mutateAsync } = moveStage;
  const onMove = useCallback(
    (leadId: string, stage: string) => {
      // Lost needs a reason. The card waits in the Lost column while the
      // dialog asks for it, so the question reads as a consequence of the
      // drop; cancelling puts it back.
      if (stage === "LOST") {
        const lead = leads.find((item) => item.id === leadId);
        if (!lead) return Promise.resolve();
        setPendingLost(lead);
        return new Promise<void>((resolve) => {
          closeLost.current = resolve;
        });
      }
      return mutateAsync({ leadId, stage: stage as CrmLeadStage });
    },
    [leads, mutateAsync],
  );

  const finishLost = () => {
    closeLost.current?.();
    closeLost.current = null;
    setPendingLost(null);
  };

  // A load error is the shell's to say, above the board.
  if (boardQuery.error) return null;

  return (
    <>
      <RecordBoard
        columns={columns}
        cards={cards}
        isLoading={boardQuery.isLoading && !board}
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
