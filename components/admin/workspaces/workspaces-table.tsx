"use client";

import {
  MobileList,
  MobileListContent,
  MobileListItem,
  MobileListMeta,
  MobileListSubtitle,
  MobileListTitle,
} from "@corelithzw/react";

import { StandingBadge } from "@/components/admin/standing-badge";
import { standingDetail } from "@/lib/admin/standing";
import { WorkspaceMark } from "@/components/admin/workspace-mark";
import { RecordCell, RecordTable, RecordTableName, type RecordTableColumn } from "@/components/records/record-table";
import { formatWhen } from "@/lib/admin/format";
import type { WorkspaceSummary } from "@/lib/admin/workspaces";
import { Buildings, Clock, Coins, Flag, Layers, SignIn, User, Users } from "@/lib/icons";

const href = (row: WorkspaceSummary) => `/admin/w/${row.slug}`;

const COLUMNS: RecordTableColumn<WorkspaceSummary>[] = [
  {
    id: "workspace",
    label: "Workspace",
    icon: Buildings,
    cell: (row) => (
      <RecordTableName
        leading={<WorkspaceMark product={row.product} profile={row.profile} />}
        title={row.name}
        subtitle={row.slug}
      />
    ),
  },
  {
    id: "product",
    label: "Product",
    icon: Layers,
    width: "11rem",
    cell: (row) => (
      <RecordCell
        value={
          <>
            {row.productName}
            {row.profile ? <span className="text-[var(--text-muted)]">, {row.profile.toLowerCase()}</span> : null}
          </>
        }
      />
    ),
  },
  { id: "plan", label: "Plan", icon: Coins, width: "8rem", cell: (row) => <RecordCell value={row.plan?.name} /> },
  { id: "standing", label: "Standing", icon: Flag, width: "8rem", cell: (row) => <StandingBadge reading={row.standing} /> },
  {
    id: "until",
    label: "Until",
    icon: Clock,
    width: "11rem",
    cell: (row) => <RecordCell value={standingDetail(row.standing)} className="text-[var(--text-muted)]" />,
  },
  { id: "members", label: "Members", icon: Users, width: "7rem", align: "end", cell: (row) => <RecordCell kind="number" value={row.members} /> },
  { id: "owner", label: "Owner", icon: User, width: "11rem", cell: (row) => <RecordCell value={row.owner?.name} /> },
  {
    id: "last",
    label: "Last sign-in",
    icon: SignIn,
    width: "9rem",
    cell: (row) => <RecordCell kind="date" value={formatWhen(row.lastSignInAt)} />,
  },
];

export function WorkspacesTable({ rows, emptyTitle }: { rows: WorkspaceSummary[]; emptyTitle: string }) {
  return (
    <RecordTable
      rows={rows}
      columns={COLUMNS}
      rowHref={href}
      emptyTitle={emptyTitle}
      mobile={
        <MobileList>
          {rows.map((row) => (
            <MobileListItem key={row.id} href={href(row)} variant="touchable">
              <WorkspaceMark product={row.product} profile={row.profile} />
              <MobileListContent>
                <MobileListTitle>{row.name}</MobileListTitle>
                <MobileListSubtitle>
                  {[row.productName, row.plan?.name, standingDetail(row.standing)].filter(Boolean).join(" · ")}
                </MobileListSubtitle>
              </MobileListContent>
              <MobileListMeta>
                <StandingBadge reading={row.standing} />
              </MobileListMeta>
            </MobileListItem>
          ))}
        </MobileList>
      }
    />
  );
}
