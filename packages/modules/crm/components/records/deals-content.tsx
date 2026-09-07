"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { RecordMark } from "@corelithzw/module-records/components/record-mark";
import { Building2, Calendar, Checklist, Coins, Funnel, Users } from "@corelithzw/ui/lib/icons";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Badge } from "@corelithzw/ui/components/badge";
import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";
import { fetchCrmDeals, fetchCrmPipelines, type CrmDealRecord } from "../../crm-v2";
import { isDealStale } from "../../pipelines";
import type { CanonicalUiStatus } from "@corelithzw/ui/lib/ui/status-map";

import { DealsBoard } from "./deals-board";
import { BoardFieldsProvider, DEAL_CARD_FIELDS } from "./board-fields";
import { ColumnPicker } from "@corelithzw/ui/components/column-picker";
import { useVisibleColumns, type ColumnOption } from "@corelithzw/ui/lib/ui/visible-columns";
import { DealFormSheet } from "./deal-form-sheet";
import { PipelineSwitcher } from "./pipeline-switcher";
import { RecordListShell } from "./record-list-shell";
import { RecordList, RecordListPager } from "@corelithzw/module-records/components/record-list";
import {
  RecordTable,
  RecordTableName,
  type RecordTableColumn,
} from "@corelithzw/module-records/components/record-table";
import { LayoutSwitch, type RecordLayout } from "./layout-switch";

const PAGE_SIZE = 50;

const STATUS_PRESENTATION: Record<string, CanonicalUiStatus> = {
  OPEN: "in_progress",
  WON: "passing",
  LOST: "failing",
};

function formatMoney(value: number | null, currency: string): string {
  if (typeof value !== "number") return "—";
  return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Every column the deals table knows how to draw, for the picker. */
const DEAL_TABLE_COLUMNS: ColumnOption[] = [
  { id: "deal", label: "Deal", required: true },
  { id: "company", label: "Company" },
  { id: "stage", label: "Stage" },
  { id: "value", label: "Value" },
  { id: "close", label: "Expected close" },
  { id: "owner", label: "Owner" },
  { id: "next", label: "Next task" },
];

export function DealsContent({
  openCreate = false,
  pipelineId: pipelineIdProp,
  onPickPipeline,
}: {
  openCreate?: boolean;
  /** Set by the unified workspace, which owns which pipeline is showing. */
  pipelineId?: string;
  onPickPipeline?: (target: "leads" | string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "WON" | "LOST" | "ALL">("OPEN");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(openCreate);
  const debouncedSearch = useDebounced(search, 300);

  // Which pipeline, and whether to work it as a board or read it as a list.
  // Both live in state rather than the URL because they are how you are
  // looking at the page, not what the page is.
  // Arriving from the leads page's pipeline menu lands on ?pipeline=<id>.
  const requestedPipeline = useSearchParams().get("pipeline");
  const [ownPipelineId, setOwnPipelineId] = useState<string | null>(requestedPipeline);
  // The parent wins when there is one: the unified workspace holds the choice
  // so the menu can cross to leads, which this component knows nothing about.
  const pipelineId = pipelineIdProp ?? ownPipelineId;
  const setPipelineId = (next: string) =>
    onPickPipeline ? onPickPipeline(next) : setOwnPipelineId(next);
  const [layout, setLayout] = useState<RecordLayout>("BOARD");

  const pipelinesQuery = useQuery({
    queryKey: ["crm", "pipelines"],
    queryFn: () => fetchCrmPipelines(),
  });

  const dealsQuery = useQuery({
    queryKey: ["crm", "deals", debouncedSearch, statusFilter, page],
    queryFn: () =>
      fetchCrmDeals({
        filters: {
          q: debouncedSearch,
          statuses: statusFilter === "ALL" ? undefined : [statusFilter],
        },
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);
  const total = dealsQuery.data?.pagination?.total ?? rows.length;
  const pipelines = useMemo(() => pipelinesQuery.data?.data ?? [], [pipelinesQuery.data]);
  // Nothing chosen means the default one, which is what the board falls back
  // to server-side; naming it here keeps the picker's label honest.
  const activePipeline =
    pipelines.find((pipeline) => pipeline.id === pipelineId) ??
    pipelines.find((pipeline) => pipeline.isDefault) ??
    pipelines[0] ??
    null;

  const tableColumns = useVisibleColumns("crm.deals.table", DEAL_TABLE_COLUMNS);
  const boardFields = useVisibleColumns("crm.deals.board", DEAL_CARD_FIELDS);

  const columns = useMemo<RecordTableColumn<CrmDealRecord>[]>(
    () => [
      {
        id: "deal",
        label: "Deal",
        icon: Coins,
        cell: (deal) => (
          <RecordTableName
            leading={<RecordMark kind="deal" name={deal.title} size="sm" />}
            title={deal.title}
            subtitle={<span className="font-mono">{deal.dealNo}</span>}
          />
        ),
      },
      {
        id: "company",
        label: "Company",
        icon: Building2,
        width: "13rem",
        cell: (deal) => (
          // `block truncate` on the cell, not on the link: a company called
          // "Chitungwiza Medical Centre" wrapped to two lines and made its row
          // twice as tall as its neighbours, which is what turns a table back
          // into a list.
          <span className="block truncate">
            {deal.client ? (
              <EntityLink href={`/crm/companies/${deal.client.id}`}>{deal.client.name}</EntityLink>
            ) : (
              <span className="text-[var(--text-subtle)]">—</span>
            )}
          </span>
        ),
      },
      {
        id: "stage",
        label: "Stage",
        icon: Funnel,
        width: "14rem",
        cell: (deal) => {
          const stale = isDealStale(
            { stageEnteredAt: deal.stageEnteredAt, status: deal.status },
            { inactivityDays: deal.stage.inactivityDays, status: deal.stage.status },
          );
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusChip
                status={STATUS_PRESENTATION[deal.stage.status] ?? "pending"}
                label={deal.stage.name}
              />
              {stale ? (
                <Badge variant="outline" className="text-sm text-[var(--status-warning-text)]">
                  Stale
                </Badge>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "value",
        label: "Value",
        icon: Coins,
        width: "10rem",
        align: "end",
        cell: (deal) => (
          // Nowrap, or "USD 36,000" breaks after the currency and the column
          // reads as two stacked half-facts.
          <NumericCell className="whitespace-nowrap">
            {formatMoney(deal.value, deal.currency)}
          </NumericCell>
        ),
      },
      {
        id: "close",
        label: "Expected close",
        icon: Calendar,
        width: "9rem",
        cell: (deal) => (
          <span className="text-[var(--text-muted)]">
            {deal.expectedCloseDate ? (
              <ClientDate value={deal.expectedCloseDate} mode="date" />
            ) : (
              "—"
            )}
          </span>
        ),
      },
      {
        id: "owner",
        label: "Owner",
        icon: Users,
        width: "10rem",
        cell: (deal) => (
          <span className="block truncate">
            {deal.assignedTo?.name ?? <span className="text-[var(--text-subtle)]">Unassigned</span>}
          </span>
        ),
      },
      {
        id: "next",
        label: "Next task",
        icon: Checklist,
        width: "12rem",
        cell: (deal) =>
          deal.nextFollowUp ? (
            <span className="block min-w-0">
              <span className="block truncate">{deal.nextFollowUp.title}</span>
              <span className="block truncate text-sm text-[var(--text-muted)]">
                <ClientDate value={deal.nextFollowUp.dueAt} />
              </span>
            </span>
          ) : (
            <span className="text-[var(--text-subtle)]">—</span>
          ),
      },
    ],
    [],
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => tableColumns.isVisible(column.id)),
    [columns, tableColumns],
  );

  return (
    <RecordListShell
      title="Deals"
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder="Search deals by title, number or company"
      createLabel="New deal"
      onCreate={() => setCreateOpen(true)}
      error={dealsQuery.error}
      count={`${rows.length} of ${total}`}
      // Below `sm` the status control is behind one button, and this list opens
      // narrowed to OPEN — so a business whose deals are all won or lost sees an
      // empty page with nothing on it to explain why. The default counts for
      // exactly that reason: it is hiding rows, and the reader cannot see it.
      // The pipeline is not counted; it swaps the set rather than narrowing it.
      filterCount={statusFilter === "ALL" ? 0 : 1}
      display={
        <ColumnPicker
          columns={layout === "BOARD" ? DEAL_CARD_FIELDS : DEAL_TABLE_COLUMNS}
          state={layout === "BOARD" ? boardFields : tableColumns}
          label={layout === "BOARD" ? "Fields" : "Columns"}
        />
      }
      filters={
        <>
          <SegmentedControl
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as typeof statusFilter);
              setPage(1);
            }}
            ariaLabel="Filter by status"
            options={[
              { value: "OPEN", label: "Open" },
              { value: "WON", label: "Won" },
              { value: "LOST", label: "Lost" },
              { value: "ALL", label: "All" },
            ]}
          />
          {/* A pipeline is a different shape of work, not a filter over one
              shape — supply-only and supply-and-fit do not share stages — so
              picking one swaps the board rather than narrowing it. */}
          <PipelineSwitcher
            active={activePipeline?.id ?? null}
            onPick={onPickPipeline}
            onPickPipeline={setPipelineId}
          />

        </>
      }
      layout={<LayoutSwitch value={layout} onChange={setLayout} options={["BOARD", "TABLE"]} />}
    >
      {layout === "BOARD" ? (
        <BoardFieldsProvider hidden={boardFields.hidden}>
          <DealsBoard
            pipelineId={activePipeline?.id ?? null}
            search={debouncedSearch}
            className="min-h-[24rem]"
          />
        </BoardFieldsProvider>
      ) : (
        <>
          <RecordTable
            rows={rows}
            columns={visibleColumns}
            rowHref={(deal) => `/crm/deals/${deal.id}`}
            isLoading={dealsQuery.isLoading}
            emptyTitle={
              statusFilter === "OPEN" ? "No open deals" : "No deals match this filter"
            }
            emptyBody={
              statusFilter === "OPEN" ? "Convert a qualified lead to start one." : undefined
            }
            // On a phone the same deals come back as the rows every other CRM
            // surface uses: two lines, and the value on the right of the title
            // rather than on a third line of its own.
            mobile={
              <RecordList
                isLoading={dealsQuery.isLoading}
                rows={rows.map((row) => ({
                  id: row.id,
                  href: `/crm/deals/${row.id}`,
                  title: row.title,
                  subtitle: `${row.dealNo} · ${row.client?.name ?? "No company"}`,
                  status: (
                    <StatusChip
                      status={STATUS_PRESENTATION[row.stage.status] ?? "pending"}
                      label={row.stage.name}
                    />
                  ),
                  facts: [
                    { value: formatMoney(row.value, row.currency), mono: true, primary: true },
                  ],
                }))}
                emptyTitle={
                  statusFilter === "OPEN" ? "No open deals" : "No deals match this filter"
                }
              />
            }
          />

          <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      <DealFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </RecordListShell>
  );
}
