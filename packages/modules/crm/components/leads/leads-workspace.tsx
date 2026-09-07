"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmLeadStage } from "@corelithzw/db";

import { Button } from "@corelithzw/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { Funnel, Plus } from "@corelithzw/ui/lib/icons";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { LayoutSwitch } from "../records/layout-switch";
import { PipelineSwitcher } from "../records/pipeline-switcher";
import { ListSearch } from "../records/list-search";
import { ViewToolbar } from "@corelithzw/module-records/components/view-toolbar";
import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";
import {
  bulkUpdateCrmLeads,
  fetchCrmLeads,
  fetchCrmSavedViews,
} from "../../crm-v2";
import { DEFAULT_LEAD_SORT, type LeadSort, type LeadViewFilters } from "../../views";
import { useVisibleColumns } from "@corelithzw/ui/lib/ui/visible-columns";
import { ColumnPicker } from "@corelithzw/ui/components/column-picker";
import {
  BoardFieldsProvider,
  LEAD_CARD_FIELDS,
} from "../records/board-fields";

import { LeadsBoard } from "./leads-board";
import {
  LeadsFilters,
  LeadsSortButton,
  LeadStageFilter,
  type LeadFilterOwner,
} from "./leads-filters";
import { LEAD_TABLE_COLUMNS, LeadsTable } from "./leads-table";
import { LeadFormSheet } from "./lead-form-sheet";
import { LostReasonDialog } from "./lost-reason-dialog";
import {
  BUILT_IN_VIEWS,
  savedViewToLeadView,
  ViewPicker,
  type LeadView,
} from "./view-picker";

const PAGE_SIZE = 50;

type PendingLostBulk = { ids: string[]; done: () => void };

export function LeadsWorkspace({
  initialFilters = {},
  initialView = "BOARD",
  initialViewId = null,
  onPickPipeline,
}: {
  /** Parsed from the page's query string, so links like /crm/leads?stages=QUOTED land pre-filtered. */
  initialFilters?: LeadViewFilters;
  initialView?: "TABLE" | "BOARD";
  /** From `?view=`, so the sidebar's saved-view links land on that view. */
  initialViewId?: string | null;
  /** Set by the unified workspace so the pipeline menu swaps in place. */
  onPickPipeline?: (target: "leads" | string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [viewType, setViewType] = useState<"TABLE" | "BOARD">(initialView);

  // A table's columns and a board's card facts are the same question asked of
  // two surfaces, so they get one control and two remembered answers.
  const tableColumns = useVisibleColumns("crm.leads.table", LEAD_TABLE_COLUMNS);
  const boardFields = useVisibleColumns("crm.leads.board", LEAD_CARD_FIELDS);
  const [filters, setFilters] = useState<LeadViewFilters>(initialFilters);
  // Held apart from `filters` so typing does not re-key the board query on
  // every keystroke, and debounced at the 300ms every other list here uses.
  const [search, setSearch] = useState(initialFilters.q ?? "");
  const debouncedSearch = useDebounced(search, 300);
  const [sort, setSort] = useState<LeadSort>(DEFAULT_LEAD_SORT);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeViewKey, setActiveViewKey] = useState<string>(
    initialViewId ?? BUILT_IN_VIEWS[0].key,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingLostBulk, setPendingLostBulk] = useState<PendingLostBulk | null>(null);

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: LeadFilterOwner[] }>("/api/v2/crm/team"),
  });

  const sourcesQuery = useQuery({
    queryKey: ["crm", "lead-sources"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string; isActive: boolean }> }>(
        "/api/v2/crm/lead-sources",
      ),
  });

  const savedViewsQuery = useQuery({
    queryKey: ["crm", "saved-views"],
    queryFn: () => fetchCrmSavedViews(),
  });

  // The text box is a filter like any other by the time a query sees it — it
  // is only held apart in state so that typing does not re-key the board on
  // every keystroke. `q` is dropped rather than sent empty so a saved view
  // that carries its own text is not silently overwritten by a blank box.
  const activeFilters = useMemo<LeadViewFilters>(() => {
    const trimmed = debouncedSearch.trim();
    const rest = { ...filters };
    delete rest.q;
    return trimmed ? { ...rest, q: trimmed } : rest;
  }, [filters, debouncedSearch]);

  // How many of the toolbar's controls are actually narrowing the list.
  //
  // Below `sm` the five of them are behind one button, so without this a lead
  // list emptied by a stage filter and a lead list with nothing in it read
  // identically — and the reader has no way to guess which. The button says
  // "Filters (2)" instead of "View" and the question answers itself.
  //
  // What is left out is as deliberate as what is in. The search box is on the
  // row on a phone, so counting it would double-report something the reader
  // can already see. `archived` swaps the set rather than narrowing it — the
  // same call `LeadsFilters` makes about its own badge — and a pipeline is a
  // different shape of work, not a filter over one shape.
  const filterCount = useMemo(
    () =>
      [
        filters.stages?.length,
        filters.assignedToIds?.length,
        filters.unassigned ? 1 : 0,
        filters.mineOnly ? 1 : 0,
        filters.channels?.length,
        filters.sources?.length,
        filters.valueMin !== undefined || filters.valueMax !== undefined ? 1 : 0,
        filters.createdFrom || filters.createdTo ? 1 : 0,
        filters.overdueOnly ? 1 : 0,
      ].reduce<number>((sum, entry) => sum + (entry ?? 0), 0),
    [filters],
  );

  const leadsQuery = useQuery({
    queryKey: ["crm", "leads", activeFilters, sort, page],
    queryFn: () => fetchCrmLeads({ filters: activeFilters, sort, page, limit: PAGE_SIZE }),
    enabled: viewType === "TABLE",
    placeholderData: (previous) => previous,
  });

  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);
  const sources = useMemo(
    () => (sourcesQuery.data?.data ?? []).filter((s) => s.isActive).map((s) => s.name),
    [sourcesQuery.data],
  );
  // Built-ins first, then whatever has been saved — one list, so the picker
  // does not have to know which is which beyond whether it can be renamed.
  const views = useMemo<LeadView[]>(
    () => [
      ...BUILT_IN_VIEWS,
      ...(savedViewsQuery.data?.data ?? []).map(savedViewToLeadView),
    ],
    [savedViewsQuery.data],
  );

  // A saved view arriving by link is only known once the list has loaded, so
  // its filters are applied during render the moment it appears rather than in
  // an effect that would paint the wrong leads first.
  const [appliedViewKey, setAppliedViewKey] = useState<string | null>(null);
  if (initialViewId && appliedViewKey !== initialViewId) {
    const linked = views.find((view) => view.key === initialViewId);
    if (linked) {
      setAppliedViewKey(initialViewId);
      setActiveViewKey(linked.key);
      setViewType(linked.layout);
      setFilters(linked.filters);
      setSearch(linked.filters.q ?? "");
      setSort(linked.sort ?? DEFAULT_LEAD_SORT);
    }
  }

  const refreshLeadLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
    queryClient.invalidateQueries({ queryKey: ["crm", "board"] });
  }, [queryClient]);

  const applyFilters = useCallback((next: LeadViewFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const bulk = useMutation({
    mutationFn: bulkUpdateCrmLeads,
    onSuccess: (result) => {
      refreshLeadLists();
      const { updated, skipped } = result;
      toast({
        title: `${updated} lead${updated === 1 ? "" : "s"} updated`,
        description:
          skipped > 0
            ? `${skipped} skipped — they belong to someone else.`
            : undefined,
      });
    },
    onError: (error) =>
      toast({
        title: "Bulk update failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const handleBulkAssign = useCallback(
    (ids: string[], assignedToId: string | null, done: () => void) => {
      bulk.mutate({ action: "assign", ids, assignedToId }, { onSuccess: done });
    },
    [bulk],
  );

  const handleBulkStage = useCallback(
    (ids: string[], stage: CrmLeadStage, done: () => void) => {
      // Losing deals always asks why — see LostReasonDialog.
      if (stage === "LOST") {
        setPendingLostBulk({ ids, done });
        return;
      }
      bulk.mutate({ action: "stage", ids, stage }, { onSuccess: done });
    },
    [bulk],
  );

  const handleBulkArchive = useCallback(
    (ids: string[], archived: boolean, done: () => void) => {
      bulk.mutate({ action: "archive", ids, archived }, { onSuccess: done });
    },
    [bulk],
  );

  const leads = leadsQuery.data?.data ?? [];
  const total = leadsQuery.data?.pagination?.total ?? leads.length;

  const newLeadAction = useMemo(
    () => (
      <Button onClick={() => setCreateOpen(true)}>
        <Plus className="h-4 w-4" />
        New lead
      </Button>
    ),
    [],
  );

  return (
    // A column that fills the scroll area, so the board underneath can be told
    // to take whatever height is left rather than sizing to its tallest column.
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4">
      <PageChrome title="Leads" icon={Funnel}>
        {newLeadAction}
      </PageChrome>

      {/* The same toolbar grammar as every other record page: what you are
          looking at, how it is narrowed, then the display controls on the
          right. The view carries its own layout, so there is no separate
          Table/Board switch to contradict it. Stage sits with the filters
          because on a board it decides which columns exist. */}
      <ViewToolbar
        // The same first control, in the same place, as every other CRM list.
        // It used to sit on the right of the row beside the column picker, so
        // leads was the one page in the module where "which arrangement am I
        // looking at" was answered at the far end of the toolbar.
        layout={
          <LayoutSwitch
            value={viewType}
            onChange={setViewType}
            options={["BOARD", "TABLE"]}
          />
        }
        start={
          <>
            <ViewPicker
              views={views}
              activeKey={activeViewKey}
              filters={filters}
              sort={sort}
              onSelect={(view) => {
                setActiveViewKey(view.key);
                setViewType(view.layout);
                setFilters(view.filters);
                setSearch(view.filters.q ?? "");
                setSort(view.sort ?? DEFAULT_LEAD_SORT);
                setPage(1);
              }}
              onSaved={() =>
                queryClient.invalidateQueries({ queryKey: ["crm", "saved-views"] })
              }
            />

            <LeadsFilters
              filters={filters}
              onChange={applyFilters}
              owners={owners}
              sources={sources}
            />

            <LeadStageFilter filters={filters} onChange={applyFilters} />

            {/* The same pipeline menu deals has. Leads are the intake
                pipeline; the menu is how you cross to the deal ones. */}
            <PipelineSwitcher active="leads" onPick={onPickPipeline} />

            {/* A board is already ordered by stage, so sorting it means nothing. */}
            {viewType === "TABLE" ? (
              <LeadsSortButton
                sort={sort}
                onChange={(next) => {
                  setSort(next);
                  setPage(1);
                }}
              />
            ) : null}
          </>
        }
        search={
          <ListSearch
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search leads by title, number or contact"
            noun="leads"
          />
        }
        // Only on the table. The board runs off its own per-stage queries and
        // this one is disabled there, so a count taken from it would read
        // "0 of 0" over a full board.
        count={viewType === "TABLE" ? `${leads.length} of ${total}` : undefined}
        filterCount={filterCount}
        end={
          <ColumnPicker
            columns={viewType === "TABLE" ? LEAD_TABLE_COLUMNS : LEAD_CARD_FIELDS}
            state={viewType === "TABLE" ? tableColumns : boardFields}
            label={viewType === "TABLE" ? "Columns" : "Fields"}
          />
        }
      />

      {leadsQuery.error && viewType === "TABLE" ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load leads</AlertTitle>
          <AlertDescription>{getApiErrorMessage(leadsQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      {viewType === "TABLE" ? (
        <LeadsTable
          leads={leads}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          isLoading={leadsQuery.isLoading}
          owners={owners}
          onPageChange={setPage}
          onBulkAssign={handleBulkAssign}
          onBulkStage={handleBulkStage}
          onBulkArchive={handleBulkArchive}
          showingArchived={Boolean(activeFilters.archived)}
          hiddenColumns={tableColumns.hidden}
          // Selection is held by the workspace, not the table: a bulk assign
          // refetches the list, and a table that owned its own ticked rows
          // would come back with them cleared halfway through the job.
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : (
        <BoardFieldsProvider hidden={boardFields.hidden}>
          <LeadsBoard filters={activeFilters} className="min-h-0 flex-1" />
        </BoardFieldsProvider>
      )}

      <LeadFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        owners={owners}
        onSaved={refreshLeadLists}
      />

      <LostReasonDialog
        open={Boolean(pendingLostBulk)}
        count={pendingLostBulk?.ids.length}
        isPending={bulk.isPending}
        onCancel={() => setPendingLostBulk(null)}
        onConfirm={(reason) => {
          if (!pendingLostBulk) return;
          const { ids, done } = pendingLostBulk;
          bulk.mutate(
            { action: "stage", ids, stage: "LOST", lostReason: reason },
            {
              onSuccess: () => {
                done();
                setPendingLostBulk(null);
              },
            },
          );
        }}
      />
    </div>
  );
}
