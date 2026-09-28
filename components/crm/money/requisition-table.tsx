"use client";

import type { ReactNode } from "react";

import { Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  StatusDot,
} from "@/components/management/ui";
import { REQUISITION_TONE } from "@/lib/crm/tones";

import {
  CATEGORY_LABELS,
  REQUISITION_STATUS_LABELS,
  formatMoney,
  payable,
  type RequisitionRow,
} from "./money";

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

/**
 * Requisitions, as a register: the number and what it was for, who asked and
 * for which project on the line under it, then where it has got to and the
 * amount.
 *
 * "Amount" means the payable figure everywhere requisitions are listed: what
 * was approved when an approver cut it, what was asked for otherwise. Where
 * it has got to is a dot and the word (rule 5) — amber while it waits on
 * somebody, green once it is accounted for — rather than a column of chips.
 */
export function RequisitionTable({
  rows,
  isLoading,
  showProject = true,
  showRequester = true,
  rowHref = (row) => `/crm/requisitions/${row.id}`,
  empty,
  emptyAction,
}: {
  rows: RequisitionRow[];
  isLoading?: boolean;
  showProject?: boolean;
  showRequester?: boolean;
  rowHref?: (row: RequisitionRow) => string;
  /** Said once, in the meta ink, when there are none. */
  empty: string;
  /** The one verb that fixes an empty list. */
  emptyAction?: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ColumnList
        label="Requisitions"
        maxWidth={WIDTH}
        empty={empty}
        columns={[
          { id: "requisition", label: "Requisition" },
          { id: "status", label: "Status" },
          { id: "amount", label: "Amount", align: "end" },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            requisition: (
              <ColumnName
                code={row.requisitionNo}
                name={row.purpose}
                meta={[
                  showRequester ? row.requestedBy?.name : null,
                  // Fuel and airtime belong to nobody's project, and that is
                  // a fact worth stating rather than a gap.
                  showProject ? (row.project?.name ?? "Not for a project") : null,
                  CATEGORY_LABELS[row.category],
                ]
                  .filter(Boolean)
                  .join(" · ")}
                href={rowHref(row)}
              />
            ),
            status: (
              <StatusDot tone={REQUISITION_TONE[row.status] ?? "neutral"} label={REQUISITION_STATUS_LABELS[row.status]} />
            ),
            amount: <ColumnFigure>{formatMoney(payable(row), row.currency)}</ColumnFigure>,
          },
        }))}
      />
      {rows.length === 0 ? emptyAction : null}
    </div>
  );
}
