"use client";

import { useMemo } from "react";
import type { CrmLeadStage } from "@corelithzw/db";

import { Button } from "@corelithzw/ui/components/button";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import {
  Archive,
  Building2,
  Checklist,
  ChevronDown,
  Clock,
  Coins,
  Funnel,
  Megaphone,
  UserRound,
  Users,
} from "@corelithzw/ui/lib/icons";
import type { CrmLeadListRecord } from "@/lib/crm/crm-v2";
import type { ColumnOption } from "@corelithzw/ui/lib/ui/visible-columns";
import { cn } from "@corelithzw/ui/lib/utils";

import { EntityLink } from "@/components/records/entity-link";
import { RecordMark } from "@/components/records/record-mark";
import { RecordList, RecordListPager } from "@/components/crm/records/record-list";
import {
  RecordTable,
  RecordTableName,
  type RecordTableColumn,
} from "@/components/records/record-table";

import type { LeadFilterOwner } from "./leads-filters";
import {
  CRM_CHANNEL_LABELS,
  CRM_LEAD_STAGES,
  CRM_STAGE_LABELS,
  CRM_STAGE_STATUS,
  formatLeadValue,
  isOverdue,
} from "./stage-config";

/**
 * Every column this table knows how to draw, for the picker.
 *
 * Kept beside the definitions rather than in a shared file so the two cannot
 * drift: a column somebody can turn on that the table does not render is worse
 * than no picker at all.
 */
export const LEAD_TABLE_COLUMNS: ColumnOption[] = [
  { id: "leadNo", label: "Lead", required: true },
  { id: "client", label: "Client" },
  { id: "stage", label: "Stage" },
  { id: "value", label: "Value" },
  { id: "owner", label: "Owner" },
  { id: "nextTask", label: "Next task" },
  { id: "source", label: "Source" },
  { id: "updatedAt", label: "Updated" },
];

function OwnerCell({ owner }: { owner: CrmLeadListRecord["assignedTo"] }) {
  if (!owner) {
    return <span className="text-[var(--text-subtle)]">Unassigned</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <RecordMark kind="rep" name={owner.name} size="sm" />
      <span className="min-w-0 truncate">{owner.name ?? "Unnamed"}</span>
    </span>
  );
}

function NextTaskCell({ task }: { task: CrmLeadListRecord["nextFollowUp"] }) {
  if (!task) return <span className="text-[var(--text-subtle)]">—</span>;
  const overdue = isOverdue(task.dueAt);
  return (
    <span className="block min-w-0">
      <span className="block truncate">{task.title}</span>
      <span
        className={cn(
          "block truncate text-sm",
          overdue ? "font-medium text-[var(--status-error-text)]" : "text-[var(--text-muted)]",
        )}
      >
        {overdue ? "Overdue · " : ""}
        <ClientDate value={task.dueAt} />
      </span>
    </span>
  );
}

/**
 * The leads register, as columns.
 *
 * On the same `RecordTable` as people, companies, sites and deals rather than
 * on `DataTable`. Leads was the last CRM list with a table of its own, which
 * meant the module's busiest screen had a different row height, a different
 * header and a different empty state from the four beside it — and a fix to
 * "the CRM table" landed on four of five.
 *
 * What was given up in the swap is column-header sorting, and only because it
 * was already duplicated: the options row above carries a sort button that
 * writes the same `LeadSort`, and two controls for one setting is the pattern
 * the toolbar was consolidated to stop.
 */
export function LeadsTable({
  leads,
  total,
  page,
  pageSize,
  isLoading,
  owners,
  onPageChange,
  onBulkAssign,
  onBulkStage,
  onBulkArchive,
  showingArchived = false,
  hiddenColumns,
  selectedIds,
  onSelectionChange,
}: {
  leads: CrmLeadListRecord[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  owners: LeadFilterOwner[];
  onPageChange: (page: number) => void;
  onBulkAssign: (ids: string[], assignedToId: string | null, done: () => void) => void;
  onBulkStage: (ids: string[], stage: CrmLeadStage, done: () => void) => void;
  onBulkArchive: (ids: string[], archived: boolean, done: () => void) => void;
  /** Whether these rows are the archive, which flips Archive into Restore. */
  showingArchived?: boolean;
  /** Column ids the reader has switched off. */
  hiddenColumns?: string[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const columns = useMemo<RecordTableColumn<CrmLeadListRecord>[]>(
    () => [
      {
        id: "leadNo",
        label: "Lead",
        icon: Funnel,
        cell: (lead) => (
          <RecordTableName
            leading={<RecordMark kind="lead" name={lead.title ?? lead.leadNo} size="sm" />}
            title={lead.title ?? lead.leadNo}
            subtitle={<span className="font-mono">{lead.leadNo}</span>}
          />
        ),
      },
      {
        id: "client",
        label: "Client",
        icon: Building2,
        width: "13rem",
        cell: (lead) => (
          <span className="block min-w-0">
            <span className="block truncate">
              {lead.client ? (
                <EntityLink href={`/crm/companies/${lead.client.id}`}>
                  {lead.client.name}
                </EntityLink>
              ) : (
                <span className="text-[var(--text-subtle)]">—</span>
              )}
            </span>
            {lead.contactName ? (
              <span className="block truncate text-sm text-[var(--text-muted)]">
                {lead.contactName}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "stage",
        label: "Stage",
        icon: Funnel,
        width: "10rem",
        cell: (lead) => (
          <StatusChip status={CRM_STAGE_STATUS[lead.stage]} label={CRM_STAGE_LABELS[lead.stage]} />
        ),
      },
      {
        id: "value",
        label: "Value",
        icon: Coins,
        width: "10rem",
        align: "end",
        cell: (lead) => (
          <NumericCell className="whitespace-nowrap">
            {formatLeadValue(lead.estimatedValue, lead.currency)}
          </NumericCell>
        ),
      },
      {
        id: "owner",
        label: "Owner",
        icon: Users,
        width: "11rem",
        cell: (lead) => <OwnerCell owner={lead.assignedTo} />,
      },
      {
        id: "nextTask",
        label: "Next task",
        icon: Checklist,
        width: "12rem",
        cell: (lead) => <NextTaskCell task={lead.nextFollowUp} />,
      },
      {
        id: "source",
        label: "Source",
        icon: Megaphone,
        width: "10rem",
        cell: (lead) => (
          <span className="block min-w-0">
            <span className="block truncate">{lead.source ?? "—"}</span>
            <span className="block truncate text-sm text-[var(--text-muted)]">
              {CRM_CHANNEL_LABELS[lead.sourceChannel ?? ""] ?? lead.sourceChannel ?? ""}
            </span>
          </span>
        ),
      },
      {
        id: "updatedAt",
        label: "Updated",
        icon: Clock,
        width: "9rem",
        cell: (lead) => (
          <span className="text-[var(--text-muted)]">
            <ClientDate value={lead.updatedAt} />
          </span>
        ),
      },
    ],
    [],
  );

  const hiddenSet = useMemo(() => new Set(hiddenColumns ?? []), [hiddenColumns]);
  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenSet.has(column.id)),
    [columns, hiddenSet],
  );

  return (
    <>
      <RecordTable
        rows={leads}
        columns={visibleColumns}
        rowHref={(lead) => `/crm/leads/${lead.id}`}
        isLoading={isLoading}
        emptyTitle="No leads match these filters"
        selection={{
          selectedIds,
          onChange: onSelectionChange,
          actions: ({ ids, clear }) => (
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    Assign owner
                    <ChevronDown className="size-3 text-[var(--text-muted)]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  <DropdownMenuLabel>
                    Assign {ids.length} lead{ids.length === 1 ? "" : "s"} to
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {owners.map((owner) => (
                    <DropdownMenuItem
                      key={owner.id}
                      onClick={() => onBulkAssign(ids, owner.id, clear)}
                    >
                      <UserRound />
                      {owner.name ?? "Unnamed"}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onBulkAssign(ids, null, clear)}>
                    <UserRound />
                    Leave unassigned
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    Change stage
                    <ChevronDown className="size-3 text-[var(--text-muted)]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {CRM_LEAD_STAGES.map((stage: CrmLeadStage) => (
                    <DropdownMenuItem
                      key={stage}
                      // Lost is the one stage move that is a claim about the
                      // business rather than progress along it.
                      variant={stage === "LOST" ? "destructive" : "default"}
                      onClick={() => onBulkStage(ids, stage, clear)}
                    >
                      <Funnel />
                      {CRM_STAGE_LABELS[stage]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Tidying up is a bulk job by nature — an import that ran
                  twice, a morning of spam through the web form. Restoring is
                  the same control read the other way round, so the archived
                  view has a way back. */}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onBulkArchive(ids, !showingArchived, clear)}
              >
                <Archive className="size-4" />
                {showingArchived ? "Restore" : "Archive"}
              </Button>
            </div>
          ),
        }}
        // On a phone the table becomes the same list every other CRM surface
        // uses: one row per lead, two lines inside it, rows separated by
        // whitespace. The owner joins the reference line rather than earning a
        // third row of its own, and the value sits on the right.
        mobile={
          <RecordList
            isLoading={isLoading}
            emptyTitle="No leads match these filters"
            rows={leads.map((lead) => ({
              id: lead.id,
              href: `/crm/leads/${lead.id}`,
              title: lead.title ?? lead.leadNo,
              subtitle: `${lead.leadNo} · ${lead.client?.name ?? "No client"} · ${
                lead.assignedTo?.name ?? "Unassigned"
              }`,
              status: (
                <StatusChip
                  status={CRM_STAGE_STATUS[lead.stage]}
                  label={CRM_STAGE_LABELS[lead.stage]}
                />
              ),
              facts: [
                {
                  value: formatLeadValue(lead.estimatedValue, lead.currency),
                  mono: true,
                  primary: true,
                },
              ],
            }))}
          />
        }
      />

      <RecordListPager
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
      />
    </>
  );
}
