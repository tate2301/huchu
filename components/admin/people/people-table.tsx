"use client";

import {
  Avatar,
  Badge,
  MobileList,
  MobileListContent,
  MobileListItem,
  MobileListSubtitle,
  MobileListTitle,
} from "@corelithzw/react";

import { RecordCell, RecordTable, RecordTableName, type RecordTableColumn } from "@/components/records/record-table";
import { formatWhen } from "@/lib/admin/format";
import type { PersonRow } from "@/lib/admin/people";
import { Badge as RoleIcon, Buildings, Flag, Phone, SignIn, User } from "@/lib/icons";

const href = (row: PersonRow) => `/admin/w/${row.workspace.slug}/members`;

const COLUMNS: RecordTableColumn<PersonRow>[] = [
  {
    id: "person",
    label: "Person",
    icon: User,
    cell: (row) => <RecordTableName leading={<Avatar name={row.name} size="sm" />} title={row.name} subtitle={row.email} />,
  },
  { id: "workspace", label: "Workspace", icon: Buildings, width: "14rem", cell: (row) => <RecordCell value={row.workspace.name} /> },
  { id: "role", label: "Role", icon: RoleIcon, width: "10rem", cell: (row) => <RecordCell value={row.roleLabel} /> },
  {
    id: "state",
    label: "State",
    icon: Flag,
    width: "9rem",
    cell: (row) => <Badge tone="neutral">{row.isActive ? "Has access" : "Access removed"}</Badge>,
  },
  { id: "phone", label: "Phone", icon: Phone, width: "10rem", cell: (row) => <RecordCell kind="phone" value={row.phone} /> },
  { id: "last", label: "Last sign-in", icon: SignIn, width: "9rem", cell: (row) => <RecordCell kind="date" value={formatWhen(row.lastSignInAt)} /> },
];

/** People across every workspace. Opening one opens their workspace's members, where everything about them is done. */
export function PeopleTable({ rows, emptyTitle }: { rows: PersonRow[]; emptyTitle: string }) {
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
              <Avatar name={row.name} size="sm" />
              <MobileListContent>
                <MobileListTitle>{row.name}</MobileListTitle>
                <MobileListSubtitle>{[row.workspace.name, row.roleLabel, row.email].filter(Boolean).join(" · ")}</MobileListSubtitle>
              </MobileListContent>
            </MobileListItem>
          ))}
        </MobileList>
      }
    />
  );
}
