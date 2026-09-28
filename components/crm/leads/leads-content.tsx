"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/react";
import { NumericCell } from "@/components/ui/numeric-cell";
import { StatusChip } from "@/components/ui/status-chip";
import { ClientDate } from "@/components/ui/client-date";
import { ColumnPicker } from "@/components/ui/column-picker";
import { EntityLink } from "@/components/records/entity-link";
import { RecordMark } from "@/components/records/record-mark";
import { RecordList, RecordListPager, type RecordListRow } from "@/components/records/record-list";
import { GroupedRecordList } from "@/components/records/record-list-groups";
import { RecordCell, RecordTable, RecordTableName, recordCellTone } from "@/components/records/record-table";
import { DirectoryCell } from "@/components/records/people-directory";
import { BoardFieldsProvider, LEAD_CARD_FIELDS } from "@/components/crm/records/board-fields";
import { RegisterShell } from "@/components/crm/registers/register-shell";
import { useTeamMembers } from "@/components/crm/registers/register-data";
import { REGISTER_PAGE_SIZE, useRegister } from "@/components/crm/registers/use-register";
import {
  emptyState,
  groupSections,
  registerColumns,
  tableSort,
  type ColumnRenderer,
} from "@/components/crm/registers/table-helpers";
import { Building2, Calendar, Checklist, Clock, Coins, Funnel, Mail, Megaphone, Phone, UserRound, Users } from "@/lib/icons";
import type { CrmLeadListRecord } from "@/lib/crm/crm-v2";
import { LEAD_CHANNEL_OPTIONS, optionLabel } from "@/lib/crm/record-labels";
import { LEAD_REGISTER } from "@/lib/crm/registers/defs/lead";
import { useVisibleColumns } from "@/lib/ui/visible-columns";
import { cn } from "@/lib/utils";

import { LeadFormSheet } from "./lead-form-sheet";
import { LeadsBoard } from "./leads-board";
import { CRM_STAGE_LABELS, CRM_STAGE_STATUS, formatLeadValue, isOverdue } from "./stage-config";

type Lead = CrmLeadListRecord;

function OwnerCell({ owner }: { owner: Lead["assignedTo"] }) {
  if (!owner) return <DirectoryCell value={null} missing="Unassigned" />;
  return (
    <span className="flex items-center gap-2">
      <RecordMark kind="rep" name={owner.name} size="sm" />
      <span className="min-w-0 truncate">{owner.name ?? "Unnamed"}</span>
    </span>
  );
}

function NextTaskCell({ task }: { task: Lead["nextFollowUp"] }) {
  if (!task) return <RecordCell value={null} />;
  const overdue = isOverdue(task.dueAt);
  return (
    <span className="block min-w-0">
      <span className="block truncate">{task.title}</span>
      <span
        className={cn(
          "block truncate font-mono text-sm tabular-nums",
          overdue ? "font-medium text-[var(--status-error-text)]" : "text-[var(--text-muted)]",
        )}
      >
        {overdue ? "Overdue · " : ""}
        <ClientDate value={task.dueAt} />
      </span>
    </span>
  );
}

function StageChip({ lead }: { lead: Lead }) {
  return <StatusChip status={CRM_STAGE_STATUS[lead.stage]} label={CRM_STAGE_LABELS[lead.stage]} />;
}

/**
 * Leads: the enquiries coming in, on the list engine.
 *
 * Opens on the board, a column per stage, because working the intake is what
 * the page is for. Every filter, the search, the sort and the layout live in
 * the address bar, and the board is read with the same filters as the table.
 */
export function LeadsContent({ openCreate = false }: { openCreate?: boolean }) {
  const register = useRegister<Lead>(LEAD_REGISTER);
  const { rows: leads, layout } = register;
  const [createOpen, setCreateOpen] = useState(openCreate);
  const boardFields = useVisibleColumns("crm.leads.board", LEAD_CARD_FIELDS);
  const team = useTeamMembers(createOpen);
  const queryClient = useQueryClient();
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }), [queryClient]);

  const renderers = useMemo<Record<string, ColumnRenderer<Lead>>>(
    () => ({
      name: {
        icon: Funnel,
        cell: (lead) => (
          <RecordTableName
            leading={
              <RecordMark
                kind="lead"
                name={lead.title ?? lead.leadNo}
                emoji={lead.emoji}
                avatarUrl={lead.avatarUrl}
                size="sm"
              />
            }
            title={lead.title ?? lead.leadNo}
            subtitle={<span className="font-mono">{lead.deal?.dealNo ?? lead.leadNo}</span>}
          />
        ),
      },
      ref: { width: "8rem", cell: (lead) => <RecordCell kind="code" value={lead.leadNo} /> },
      company: {
        icon: Building2,
        width: "13rem",
        cell: (lead) => (
          <span className="block min-w-0">
            <span className="block truncate">
              {lead.client ? (
                <EntityLink href={`/crm/companies/${lead.client.id}`} className={recordCellTone("relation")}>
                  {lead.client.name}
                </EntityLink>
              ) : (
                <RecordCell value={null} />
              )}
            </span>
            {lead.contactName ? (
              <span className="block truncate text-sm text-[var(--text-muted)]">{lead.contactName}</span>
            ) : null}
          </span>
        ),
      },
      stage: { icon: Funnel, width: "10rem", cell: (lead) => <StageChip lead={lead} /> },
      value: {
        icon: Coins,
        width: "10rem",
        align: "end",
        cell: (lead) => (
          <NumericCell className="whitespace-nowrap">{formatLeadValue(lead.estimatedValue, lead.currency)}</NumericCell>
        ),
      },
      owner: { icon: Users, width: "11rem", cell: (lead) => <OwnerCell owner={lead.assignedTo} /> },
      next: { icon: Checklist, width: "12rem", cell: (lead) => <NextTaskCell task={lead.nextFollowUp} /> },
      source: {
        icon: Megaphone,
        width: "10rem",
        cell: (lead) => (
          <span className="block min-w-0">
            <span className="block truncate">{lead.source ?? "—"}</span>
            <span className="block truncate text-sm text-[var(--text-muted)]">
              {optionLabel(LEAD_CHANNEL_OPTIONS, lead.sourceChannel)}
            </span>
          </span>
        ),
      },
      channel: {
        width: "9rem",
        cell: (lead) => <RecordCell value={optionLabel(LEAD_CHANNEL_OPTIONS, lead.sourceChannel)} />,
      },
      contact: { icon: UserRound, width: "11rem", cell: (lead) => <RecordCell value={lead.contactName} /> },
      email: {
        icon: Mail,
        width: "14rem",
        cell: (lead) => <DirectoryCell kind="email" value={lead.contactEmail} missing="no email" />,
      },
      phone: {
        icon: Phone,
        width: "10rem",
        cell: (lead) => <DirectoryCell kind="phone" value={lead.contactPhone} missing="no phone" />,
      },
      created: {
        icon: Calendar,
        width: "8.5rem",
        cell: (lead) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={lead.createdAt} mode="date" />
          </span>
        ),
      },
      updated: {
        icon: Clock,
        width: "9rem",
        cell: (lead) => (
          <span className="font-mono tabular-nums text-[var(--text-muted)]">
            <ClientDate value={lead.updatedAt} />
          </span>
        ),
      },
    }),
    [],
  );

  const columns = registerColumns(register, renderers);

  // On a phone, and in the List layout, the same leads come back as the rows
  // every other CRM surface uses: two lines, the value beside the title.
  const rows = useMemo<RecordListRow[]>(
    () =>
      leads.map((lead) => ({
        id: lead.id,
        href: `/crm/leads/${lead.id}`,
        leading: (
          <RecordMark kind="lead" name={lead.title ?? lead.leadNo} emoji={lead.emoji} avatarUrl={lead.avatarUrl} size="md" />
        ),
        title: lead.title ?? lead.leadNo,
        subtitle: `${lead.leadNo} · ${lead.client?.name ?? lead.contactName ?? "No client"} · ${
          lead.assignedTo?.name ?? "Unassigned"
        }`,
        status: <StageChip lead={lead} />,
        facts: [{ value: formatLeadValue(lead.estimatedValue, lead.currency), mono: true, primary: true }],
      })),
    [leads],
  );

  const empty = emptyState(register, {
    none: "No leads yet",
    noneBody: "Add one, or connect a web form and they arrive on their own.",
  });
  const emptyAction =
    empty.kind === "none" ? (
      <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
        Add the first lead
      </Button>
    ) : empty.kind === "filtered" ? (
      <Button variant="secondary" size="sm" onClick={register.clearFilters}>
        Clear the filters
      </Button>
    ) : undefined;

  const list = register.groups ? (
    <GroupedRecordList
      sections={groupSections(register.groups, rows)}
      isLoading={register.isLoading}
      emptyTitle={empty.title}
      emptyBody={empty.body}
      emptyAction={emptyAction}
    />
  ) : (
    <RecordList
      rows={rows}
      isLoading={register.isLoading}
      emptyTitle={empty.title}
      emptyBody={empty.body}
      emptyAction={emptyAction}
    />
  );

  return (
    <RegisterShell
      register={register}
      title="Leads"
      createLabel="New lead"
      onCreate={() => setCreateOpen(true)}
      display={
        layout === "BOARD" ? (
          <ColumnPicker columns={LEAD_CARD_FIELDS} state={boardFields} label="Fields" size="sm" />
        ) : undefined
      }
    >
      {layout === "BOARD" ? (
        <BoardFieldsProvider hidden={boardFields.hidden}>
          <LeadsBoard register={register} />
        </BoardFieldsProvider>
      ) : layout === "TABLE" ? (
        <RecordTable
          rows={leads}
          columns={columns}
          rowHref={(lead) => `/crm/leads/${lead.id}`}
          isLoading={register.isLoading}
          selection={{ selectedIds: register.selection.ids, onChange: register.selection.set }}
          sort={tableSort(register)}
          groups={register.groups}
          emptyTitle={empty.title}
          emptyBody={empty.body}
          emptyAction={emptyAction}
          mobile={list}
        />
      ) : (
        list
      )}

      {layout === "BOARD" ? null : (
        <RecordListPager
          page={register.page}
          pageSize={REGISTER_PAGE_SIZE}
          total={register.total}
          onPageChange={register.setPage}
        />
      )}

      <LeadFormSheet open={createOpen} onOpenChange={setCreateOpen} owners={team.data ?? []} onSaved={refresh} />
    </RegisterShell>
  );
}
