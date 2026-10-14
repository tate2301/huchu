"use client";

import {
  MobileList,
  MobileListContent,
  MobileListItem,
  MobileListMeta,
  MobileListSubtitle,
  MobileListTitle,
} from "@corelithzw/react";
import Link from "next/link";

import { RecordCell, RecordTable, type RecordTableColumn } from "@/components/records/record-table";
import type { ActivityItem } from "@/lib/admin/activity";
import { formatWhen } from "@/lib/admin/format";
import { Buildings, Clock, EditSquare, Hash, User } from "@/lib/icons";

export type AuditRow = ActivityItem & { workspace: { slug: string; name: string } | null };

/**
 * The audit log as a register: when, who, what, why. Corelith staff are
 * marked as staff; the chain column is the start of each row's hash, so a
 * row altered after the fact is one whose hash no longer matches.
 */
export function AuditTable({ rows, withWorkspace, olderHref }: { rows: AuditRow[]; withWorkspace: boolean; olderHref: string | null }) {
  const columns: RecordTableColumn<AuditRow>[] = [
    { id: "when", label: "When", icon: Clock, width: "10rem", cell: (row) => <RecordCell kind="date" value={formatWhen(row.at)} /> },
    {
      id: "who",
      label: "Who",
      icon: User,
      width: "13rem",
      cell: (row) => (
        <span className="block truncate">
          <span className="font-medium text-[var(--ink)]">{row.actor.name}</span>
          {row.actor.kind === "operator" ? <span className="text-[var(--text-muted)]"> · staff</span> : null}
        </span>
      ),
    },
    {
      id: "what",
      label: "What",
      icon: EditSquare,
      cell: (row) => (
        <span className="block min-w-0">
          <span className="block truncate text-[var(--text-body)]">{row.did}</span>
          {row.reason ? <span className="block truncate text-[13px] text-[var(--text-muted)]">“{row.reason}”</span> : null}
        </span>
      ),
    },
    ...(withWorkspace
      ? [
          {
            id: "workspace",
            label: "Workspace",
            icon: Buildings,
            width: "13rem",
            cell: (row: AuditRow) =>
              row.workspace ? (
                <RecordCell kind="relation" value={row.workspace.name} href={`/admin/w/${row.workspace.slug}/audit`} />
              ) : (
                <span className="text-[var(--text-muted)]">Admin portal</span>
              ),
          },
        ]
      : []),
    {
      id: "chain",
      label: "Chain",
      icon: Hash,
      width: "7rem",
      cell: (row) => <span className="font-mono text-xs text-[var(--text-faint)]" title={row.hash}>{row.hash.slice(0, 8)}</span>,
    },
  ];

  return (
    <>
      <RecordTable
        rows={rows}
        columns={columns}
        emptyTitle="Nothing recorded here yet"
        mobile={
          <MobileList>
            {rows.map((row) => (
              <MobileListItem key={row.id}>
                <MobileListContent>
                  <MobileListTitle>
                    {row.actor.name} {row.did}
                  </MobileListTitle>
                  <MobileListSubtitle>{[row.workspace?.name, row.reason ? `“${row.reason}”` : null].filter(Boolean).join(" · ")}</MobileListSubtitle>
                </MobileListContent>
                <MobileListMeta>
                  <span className="font-mono text-xs">{formatWhen(row.at)}</span>
                </MobileListMeta>
              </MobileListItem>
            ))}
          </MobileList>
        }
      />
      {olderHref ? (
        <div className="flex justify-center py-4">
          <Link href={olderHref} className="text-sm font-medium text-[var(--text-link)] hover:underline">
            Older
          </Link>
        </div>
      ) : null}
    </>
  );
}
