"use client";

import { useMemo, useState } from "react";

import { Badge, Button } from "@corelithzw/react";
import { EntityLink } from "@/components/records/entity-link";
import { RecordMark } from "@/components/records/record-mark";
import { Building2, Calendar, Checklist, Coins, Funnel, MapPin, UserRound, Users } from "@/lib/icons";
import { NumericCell } from "@/components/ui/numeric-cell";
import { StatusChip } from "@/components/ui/status-chip";
import { ClientDate } from "@/components/ui/client-date";
import { ColumnPicker } from "@/components/ui/column-picker";
import type { CrmDealRecord } from "@/lib/crm/crm-v2";
import { isDealStale } from "@/lib/crm/pipelines";
import { DEAL_STATUS_OPTIONS, FORECAST_OPTIONS, optionLabel } from "@/lib/crm/record-labels";
import { DEAL_REGISTER } from "@/lib/crm/registers/defs/deal";
import { useVisibleColumns } from "@/lib/ui/visible-columns";
import type { CanonicalUiStatus } from "@/lib/ui/status-map";
import { RecordList, RecordListPager, type RecordListRow } from "@/components/records/record-list";
import { GroupedRecordList } from "@/components/records/record-list-groups";
import { RecordCell, RecordTable, RecordTableName, recordCellTone } from "@/components/records/record-table";
import { DirectoryCell } from "@/components/records/people-directory";
import { NothingMatched } from "@/components/records/states";
import { RegisterShell } from "@/components/crm/registers/register-shell";
import { REGISTER_PAGE_SIZE, useRegister } from "@/components/crm/registers/use-register";
import {
  emptyState,
  groupSections,
  registerColumns,
  tableSort,
  type ColumnRenderer,
} from "@/components/crm/registers/table-helpers";

import { BoardFieldsProvider, DEAL_CARD_FIELDS } from "./board-fields";
import { DealFormSheet } from "./deal-form-sheet";
import { DealsBoard } from "./deals-board";

type Deal = CrmDealRecord;

const STATUS_PRESENTATION: Record<string, CanonicalUiStatus> = {
  OPEN: "in_progress",
  WON: "passing",
  LOST: "failing",
};

function formatMoney(value: number | null, currency: string): string {
  if (typeof value !== "number") return "—";
  return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function StageCell({ deal }: { deal: Deal }) {
  const stale = isDealStale(
    { stageEnteredAt: deal.stageEnteredAt, status: deal.status },
    { inactivityDays: deal.stage.inactivityDays, status: deal.stage.status },
  );
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusChip status={STATUS_PRESENTATION[deal.stage.status] ?? "pending"} label={deal.stage.name} />
      {/* The same words as the filter that finds them. */}
      {stale ? (
        <Badge tone="warn" size="sm">
          Gone quiet
        </Badge>
      ) : null}
    </span>
  );
}

/** A relation to another record, or the faint dash that says there is none. */
function RelationCell({ href, name }: { href: string | null; name: string | null | undefined }) {
  return href && name ? (
    <span className="block truncate">
      <EntityLink href={href} className={recordCellTone("relation")}>
        {name}
      </EntityLink>
    </span>
  ) : (
    <RecordCell value={null} />
  );
}

/**
 * Deals: the pipeline, on the list engine.
 *
 * Opens on the board, because working the pipeline is what the page is for;
 * the views that answer a question — mine, closing this month, gone quiet —
 * are tables. Every filter, the search, the sort and the layout live in the
 * address bar, and a board is the pipeline filter's pipeline (the default one
 * when none is chosen) read with the same filters as the table.
 */
export function DealsContent({ openCreate = false }: { openCreate?: boolean }) {
  const register = useRegister<Deal>(DEAL_REGISTER);
  const { rows: deals, layout } = register;
  const [createOpen, setCreateOpen] = useState(openCreate);
  const boardFields = useVisibleColumns("crm.deals.board", DEAL_CARD_FIELDS);

  const renderers = useMemo<Record<string, ColumnRenderer<Deal>>>(
    () => ({
      name: {
        icon: Coins,
        cell: (deal) => (
          <RecordTableName
            leading={<RecordMark kind="deal" name={deal.title} emoji={deal.emoji} avatarUrl={deal.avatarUrl} size="sm" />}
            title={deal.title}
            subtitle={<span className="font-mono">{deal.dealNo}</span>}
          />
        ),
      },
      ref: { width: "8rem", cell: (deal) => <RecordCell kind="code" value={deal.dealNo} /> },
      company: {
        icon: Building2,
        width: "13rem",
        cell: (deal) => (
          <RelationCell href={deal.client ? `/crm/companies/${deal.client.id}` : null} name={deal.client?.name} />
        ),
      },
      stage: { icon: Funnel, width: "14rem", cell: (deal) => <StageCell deal={deal} /> },
      value: {
        icon: Coins,
        width: "10rem",
        align: "end",
        // Nowrap, or "USD 36,000" breaks after the currency and reads as two
        // stacked half-facts.
        cell: (deal) => <NumericCell className="whitespace-nowrap">{formatMoney(deal.value, deal.currency)}</NumericCell>,
      },
      close: {
        icon: Calendar,
        width: "9rem",
        cell: (deal) => (
          <span className="font-mono tabular-nums text-[var(--text-muted)]">
            <ClientDate value={deal.expectedCloseDate} mode="date" />
          </span>
        ),
      },
      owner: {
        icon: Users,
        width: "10rem",
        cell: (deal) => <DirectoryCell value={deal.assignedTo?.name} missing="Unassigned" />,
      },
      next: {
        icon: Checklist,
        width: "12rem",
        cell: (deal) =>
          deal.nextFollowUp ? (
            <span className="block min-w-0">
              <span className="block truncate">{deal.nextFollowUp.title}</span>
              <span className="block truncate font-mono text-sm tabular-nums text-[var(--text-muted)]">
                <ClientDate value={deal.nextFollowUp.dueAt} />
              </span>
            </span>
          ) : (
            <RecordCell value={null} />
          ),
      },
      status: {
        width: "7rem",
        cell: (deal) => (
          <StatusChip
            status={STATUS_PRESENTATION[deal.status] ?? "pending"}
            label={optionLabel(DEAL_STATUS_OPTIONS, deal.status)}
          />
        ),
      },
      pipeline: { width: "12rem", cell: (deal) => <RecordCell value={deal.pipeline.name} /> },
      probability: {
        width: "7rem",
        align: "end",
        cell: (deal) => <RecordCell kind="number" value={deal.probability === null ? null : `${deal.probability}%`} />,
      },
      forecast: {
        width: "8rem",
        cell: (deal) => <RecordCell value={optionLabel(FORECAST_OPTIONS, deal.forecastCategory)} />,
      },
      contact: {
        icon: UserRound,
        width: "12rem",
        cell: (deal) => (
          <RelationCell
            href={deal.primaryContact ? `/crm/people/${deal.primaryContact.id}` : null}
            name={deal.primaryContact?.fullName}
          />
        ),
      },
      site: {
        icon: MapPin,
        width: "12rem",
        cell: (deal) => <RelationCell href={deal.site ? `/crm/sites/${deal.site.id}` : null} name={deal.site?.name} />,
      },
      entered: {
        width: "8.5rem",
        cell: (deal) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={deal.stageEnteredAt} mode="date" />
          </span>
        ),
      },
      created: {
        width: "8.5rem",
        cell: (deal) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={deal.createdAt} mode="date" />
          </span>
        ),
      },
      updated: {
        width: "10rem",
        cell: (deal) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={deal.updatedAt} />
          </span>
        ),
      },
    }),
    [],
  );

  const columns = registerColumns(register, renderers);

  // On a phone, and in the List layout, the same deals come back as the rows
  // every other CRM surface uses: two lines, the value beside the title.
  const rows = useMemo<RecordListRow[]>(
    () =>
      deals.map((deal) => ({
        id: deal.id,
        href: `/crm/deals/${deal.id}`,
        leading: <RecordMark kind="deal" name={deal.title} emoji={deal.emoji} avatarUrl={deal.avatarUrl} size="md" />,
        title: deal.title,
        subtitle: `${deal.dealNo} · ${deal.client?.name ?? "No company"}`,
        status: <StatusChip status={STATUS_PRESENTATION[deal.stage.status] ?? "pending"} label={deal.stage.name} />,
        facts: [
          { value: formatMoney(deal.value, deal.currency), mono: true, primary: true },
          { label: "Owner", value: deal.assignedTo?.name ?? "Unassigned" },
        ],
      })),
    [deals],
  );

  const empty = emptyState(register, {
    none: "No deals yet",
    noneBody: "Convert a qualified lead, or add a deal of your own.",
  });
  const emptyAction =
    empty.kind === "none" ? (
      <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
        Add the first deal
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

  // The stage and status filters choose a board's columns as well as its
  // cards, so they can leave it with none at all.
  const noColumns = layout === "BOARD" && register.board.query.data?.columns.length === 0;

  return (
    <RegisterShell
      register={register}
      title="Deals"
      createLabel="New deal"
      onCreate={() => setCreateOpen(true)}
      display={
        layout === "BOARD" ? (
          <ColumnPicker columns={DEAL_CARD_FIELDS} state={boardFields} label="Fields" size="sm" />
        ) : undefined
      }
    >
      {layout === "BOARD" ? (
        noColumns ? (
          <NothingMatched what="stages" onClear={register.clearFilters} />
        ) : (
          <BoardFieldsProvider hidden={boardFields.hidden}>
            <DealsBoard register={register} />
          </BoardFieldsProvider>
        )
      ) : layout === "TABLE" ? (
        <RecordTable
          rows={deals}
          columns={columns}
          rowHref={(deal) => `/crm/deals/${deal.id}`}
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

      <DealFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </RegisterShell>
  );
}
