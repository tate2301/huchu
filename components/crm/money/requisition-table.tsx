"use client";

import type { ReactNode } from "react";

import { EntityLink } from "@/components/records/entity-link";
import { RecordList } from "@/components/records/record-list";
import {
  RecordCell,
  RecordTable,
  RecordTableName,
  type RecordTableColumn,
} from "@/components/records/record-table";
import { StatusChip } from "@/components/ui/status-chip";
import { REQUISITION_STATUS } from "@/lib/crm/tones";
import { Coins, Tag, User, Wallet, Work } from "@/lib/icons";

import {
  CATEGORY_LABELS,
  REQUISITION_STATUS_LABELS,
  formatMoney,
  payable,
  type RequisitionRow,
} from "./money";

function statusChip(row: RequisitionRow) {
  return (
    <StatusChip
      status={REQUISITION_STATUS[row.status] ?? "inactive"}
      label={REQUISITION_STATUS_LABELS[row.status]}
    />
  );
}

/**
 * Requisitions, as a register.
 *
 * The same columns wherever requisitions are listed — a project's section, a
 * person's money, a dashboard drilldown — so "Amount" means the payable figure
 * everywhere: what was approved when an approver cut it, what was asked for
 * otherwise. A project's own table leaves out the project column and a
 * person's leaves out who asked; nothing else changes.
 */
export function RequisitionTable({
  rows,
  isLoading,
  showProject = true,
  showRequester = true,
  rowHref = () => "/crm/requisitions",
  emptyTitle = "Nobody has asked for money",
  emptyBody,
  emptyAction,
}: {
  rows: RequisitionRow[];
  isLoading?: boolean;
  showProject?: boolean;
  showRequester?: boolean;
  rowHref?: (row: RequisitionRow) => string;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
}) {
  const columns: RecordTableColumn<RequisitionRow>[] = [
    {
      id: "purpose",
      label: "Requisition",
      icon: Wallet,
      cell: (row) => <RecordTableName title={row.purpose} subtitle={row.requisitionNo} />,
    },
    ...(showRequester
      ? [
          {
            id: "requester",
            label: "Asked by",
            icon: User,
            width: "10rem",
            cell: (row: RequisitionRow) => (
              <RecordCell
                kind="relation"
                value={row.requestedBy?.name}
                href={row.requestedBy ? `/crm/reps/${row.requestedBy.id}` : null}
              />
            ),
          },
        ]
      : []),
    ...(showProject
      ? [
          {
            id: "project",
            label: "Project",
            icon: Work,
            width: "12rem",
            cell: (row: RequisitionRow) =>
              row.project ? (
                <span className="block truncate">
                  <EntityLink href={`/crm/projects/${row.project.id}`}>{row.project.name}</EntityLink>
                </span>
              ) : (
                // Fuel and airtime belong to nobody's project, and that is a
                // fact worth stating rather than a blank that reads as missing.
                <span className="text-[var(--text-subtle)]">Not for a project</span>
              ),
          },
        ]
      : []),
    {
      id: "category",
      label: "For",
      icon: Tag,
      width: "8rem",
      cell: (row) => <RecordCell kind="text" value={CATEGORY_LABELS[row.category]} />,
    },
    {
      id: "amount",
      label: "Amount",
      icon: Coins,
      width: "9rem",
      align: "end",
      cell: (row) => <RecordCell kind="money" value={formatMoney(payable(row), row.currency)} />,
    },
    {
      id: "status",
      label: "Where it is",
      width: "12rem",
      cell: statusChip,
    },
  ];

  return (
    <RecordTable
      rows={rows}
      columns={columns}
      rowHref={rowHref}
      isLoading={isLoading}
      emptyTitle={emptyTitle}
      emptyBody={emptyBody}
      emptyAction={emptyAction}
      mobile={
        <RecordList
          rows={rows.map((row) => ({
            id: row.id,
            href: rowHref(row),
            title: row.purpose,
            subtitle: [
              row.requisitionNo,
              showRequester ? row.requestedBy?.name : null,
              showProject ? row.project?.name : null,
            ]
              .filter(Boolean)
              .join(" · "),
            status: statusChip(row),
            facts: [{ label: "Amount", value: formatMoney(payable(row), row.currency), kind: "money" }],
          }))}
          isLoading={isLoading}
          emptyTitle={emptyTitle}
          emptyBody={emptyBody}
          emptyAction={emptyAction}
        />
      }
    />
  );
}
