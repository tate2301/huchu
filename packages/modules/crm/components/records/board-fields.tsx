"use client";

import * as React from "react";

import type { ColumnOption } from "@corelithzw/ui/lib/ui/visible-columns";

/**
 * Which facts a board's cards show.
 *
 * A board has columns in the kanban sense — the stages — and columns in the
 * table sense: the handful of facts each card carries. Somebody asking to
 * "hide a column" on a board almost always means the second, so the same
 * picker drives both surfaces and a board just calls its fields columns.
 *
 * Passed by context rather than as a prop because it has to reach the card
 * body through the board, the stage column and the sortable wrapper, none of
 * which have any business knowing about it.
 */
const BoardFieldsContext = React.createContext<ReadonlySet<string>>(new Set());

export function BoardFieldsProvider({
  hidden,
  children,
}: {
  hidden: string[];
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => new Set(hidden), [hidden]);
  return (
    <BoardFieldsContext.Provider value={value}>{children}</BoardFieldsContext.Provider>
  );
}

/** True when this fact should be drawn. Defaults to shown outside a provider. */
export function useBoardField(id: string): boolean {
  return !React.useContext(BoardFieldsContext).has(id);
}

/** The facts a pipeline card can carry, in the order they appear on it. */
export const LEAD_CARD_FIELDS: ColumnOption[] = [
  { id: "title", label: "Title", required: true },
  { id: "reference", label: "Reference number" },
  { id: "client", label: "Client" },
  { id: "value", label: "Value" },
  { id: "owner", label: "Owner" },
  { id: "sla", label: "Time in stage" },
  { id: "overdue", label: "Overdue marker" },
];

/** The facts a deal card can carry. */
export const DEAL_CARD_FIELDS: ColumnOption[] = [
  { id: "title", label: "Title", required: true },
  { id: "reference", label: "Reference number" },
  { id: "client", label: "Client" },
  { id: "value", label: "Value" },
  { id: "owner", label: "Owner" },
  { id: "closeDate", label: "Expected close" },
  { id: "overdue", label: "Overdue marker" },
];
