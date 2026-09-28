"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { ClientDate } from "@/components/ui/client-date";
import { getApiErrorMessage } from "@/lib/api-client";
import { AlertCircle, Clock } from "@/lib/icons";
import { updateCrmDealStage, type CrmDealRecord, type RegisterBoardData } from "@/lib/crm/crm-v2";
import { stageColor } from "@/lib/crm/tones";

import { isOverdue } from "@/components/crm/leads/stage-config";
import type { RegisterHandle } from "@/components/crm/registers/use-register";
import { RecordMark } from "@/components/records/record-mark";

import { BoardCardFace, BoardCardSignal } from "./board-card-face";
import { useBoardField } from "./board-fields";
import { RecordBoard, type RecordBoardCard, type RecordBoardColumn } from "./record-board";

type Deal = CrmDealRecord;
type DealBoard = RegisterBoardData<Deal>;

function money(value: number | null, currency: string): string {
  if (typeof value !== "number") return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function DealCardBody({ deal }: { deal: Deal }) {
  const showReference = useBoardField("reference");
  const showClient = useBoardField("client");
  const showValue = useBoardField("value");
  const showOwner = useBoardField("owner");
  const showCloseDate = useBoardField("closeDate");
  const showOverdue = useBoardField("overdue");

  const overdue = showOverdue && isOverdue(deal.nextFollowUp?.dueAt);

  return (
    <BoardCardFace
      leading={
        <RecordMark
          kind="deal"
          name={deal.title}
          emoji={deal.emoji}
          avatarUrl={deal.avatarUrl}
          size="sm"
        />
      }
      title={deal.title}
      subtitle={
        showReference || showClient ? (
          <>
            {showReference ? <span className="font-mono">{deal.dealNo}</span> : null}
            {showReference && showClient ? " · " : null}
            {showClient ? (deal.client?.name ?? "No company") : null}
          </>
        ) : undefined
      }
      figure={showValue ? money(deal.value, deal.currency) : undefined}
      owner={showOwner ? (deal.assignedTo?.name ?? null) : undefined}
    >
      {deal.expectedCloseDate && showCloseDate ? (
        <BoardCardSignal icon={Clock}>
          Expected <ClientDate value={deal.expectedCloseDate} mode="date" />
        </BoardCardSignal>
      ) : null}
      {overdue ? (
        <BoardCardSignal icon={AlertCircle} tone="danger">
          Overdue: {deal.nextFollowUp?.title ?? "task"}
        </BoardCardSignal>
      ) : null}
    </BoardCardFace>
  );
}

/** Move a card between columns in the cache, keeping counts and totals in step. */
function moveCardInCache(board: DealBoard, dealId: string, toStageId: string): DealBoard {
  let moved: Deal | undefined;
  const stripped = board.columns.map((column) => {
    const found = column.cards.find((deal) => deal.id === dealId);
    if (!found) return column;
    moved = found;
    return {
      ...column,
      count: Math.max(0, column.count - 1),
      totalValue: Math.max(0, column.totalValue - (found.value ?? 0)),
      cards: column.cards.filter((deal) => deal.id !== dealId),
    };
  });

  if (!moved) return board;
  const card = { ...moved, stageId: toStageId };

  return {
    ...board,
    columns: stripped.map((column) =>
      column.stage.id === toStageId
        ? {
            ...column,
            count: column.count + 1,
            totalValue: column.totalValue + (card.value ?? 0),
            cards: [card, ...column.cards],
          }
        : column,
    ),
  };
}

/**
 * One pipeline's deals as a board, read by the deals list with its own
 * filters — the pipeline filter's pipeline, or the default one.
 *
 * One pipeline at a time, because a board mixing pipelines would have
 * columns meaning different things depending on which card sits in them —
 * and dragging between those columns would be nonsense.
 */
export function DealsBoard({ register, className }: { register: RegisterHandle<Deal>; className?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { query: boardQuery, queryKey } = register.board;

  const move = useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      updateCrmDealStage(dealId, stageId),
    onMutate: async ({ dealId, stageId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DealBoard>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, moveCardInCache(previous, dealId, stageId));
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      // Put it back where it was: a card that stayed in the new column after a
      // failed save is a lie the next reader has no way to spot.
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({
        title: "Could not move the deal",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    // The board and every page of the list share the deals prefix.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["crm", "deals"] }),
  });

  const board = boardQuery.data;
  const currency = board?.columns.flatMap((column) => column.cards)[0]?.currency ?? "USD";
  const { set } = register;

  const columns = useMemo<RecordBoardColumn[]>(
    () =>
      (board?.columns ?? []).map((column) => ({
        id: column.stage.id,
        name: column.stage.name,
        dot: stageColor(column.stage.colorToken).dot,
        count: column.count,
        total: column.totalValue > 0 ? money(column.totalValue, currency) : undefined,
        // Past the cards a column draws, the table has the rest of them: the
        // same filters, this pipeline, this stage.
        footer: column.hasMore ? (
          <button
            type="button"
            className="underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--text-strong)]"
            onClick={() =>
              set((previous) => ({
                ...previous,
                layout: "TABLE",
                filters: {
                  ...previous.filters,
                  ...(board?.pipeline ? { pipeline: [board.pipeline.id] } : {}),
                  stage: [column.stage.id],
                },
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
        column.cards.map((deal) => ({
          id: deal.id,
          columnId: column.stage.id,
          href: `/crm/deals/${deal.id}`,
          label: deal.title,
          content: <DealCardBody deal={deal} />,
          row: {
            title: deal.title,
            subtitle: `${deal.dealNo} · ${deal.client?.name ?? "No company"}`,
            facts: [{ value: money(deal.value, deal.currency), mono: true, primary: true }],
          },
        })),
      ),
    [board],
  );

  const { mutateAsync } = move;
  const onMove = useCallback(
    (dealId: string, stageId: string) => mutateAsync({ dealId, stageId }),
    [mutateAsync],
  );

  // A load error is the shell's to say, above the board.
  if (boardQuery.error) return null;

  return (
    <RecordBoard
      columns={columns}
      cards={cards}
      isLoading={boardQuery.isLoading && !board}
      noun={{ one: "deal", many: "deals" }}
      emptyLabel="No deals in this stage"
      onMove={onMove}
      className={className}
    />
  );
}
