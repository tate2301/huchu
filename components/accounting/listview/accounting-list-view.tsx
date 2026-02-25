"use client";

import { useMemo, useState } from "react";
import { ListView } from "@rtcamp/frappe-ui-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adaptColumnsForListView,
  renderColumnCell,
  type ListViewColumnDefinition,
} from "@/lib/accounting/listview-adapter";
import { buildGroupedRows } from "@/lib/accounting/listview-grouping";

type GroupBySelector<TData> =
  | keyof TData
  | ((row: TData) => string | null | undefined);

type AccountingListViewProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  searchPlaceholder?: string;
  searchSubmitLabel?: string;
  pagination?: { enabled?: boolean };
  emptyState?: string;
  toolbar?: React.ReactNode;
  rowKey?: keyof TData | ((row: TData, index: number) => string);
  groupBy?: GroupBySelector<TData>;
  groupOrder?: string[];
  className?: string;
  selectable?: boolean;
};

type InternalRow<TData> = {
  __list_row_key: string;
  __row_index: number;
  __original: TData;
} & Record<string, unknown>;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function toSearchText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).toLowerCase();
  }
  if (value instanceof Date) return value.toISOString().toLowerCase();
  if (Array.isArray(value)) return value.map((item) => toSearchText(item)).join(" ");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => toSearchText(item))
      .join(" ");
  }
  return "";
}

function resolveDefaultGroup<TData>(row: TData): string | null {
  const candidate = row as Record<string, unknown>;

  if (typeof candidate.group === "string" && candidate.group) return candidate.group;
  if (typeof candidate.status === "string" && candidate.status) return candidate.status;
  if (typeof candidate.type === "string" && candidate.type) return candidate.type;
  if (typeof candidate.direction === "string" && candidate.direction) return candidate.direction;
  if (typeof candidate.sourceType === "string" && candidate.sourceType) return candidate.sourceType;
  if (typeof candidate.method === "string" && candidate.method) return candidate.method;
  if (typeof candidate.baseCurrency === "string" && candidate.baseCurrency) return candidate.baseCurrency;
  if (typeof candidate.category === "string" && candidate.category) return candidate.category;
  if (typeof candidate.isActive === "boolean") return candidate.isActive ? "Active" : "Inactive";

  return null;
}

function resolveGroupByValue<TData>(
  row: TData,
  selector?: GroupBySelector<TData>,
): string | null {
  if (!selector) {
    return resolveDefaultGroup(row);
  }
  if (typeof selector === "function") {
    const result = selector(row);
    return result ?? null;
  }
  const value = (row as Record<string, unknown>)[selector as string];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function getRowKey<TData>(
  row: TData,
  index: number,
  rowKey?: keyof TData | ((row: TData, index: number) => string),
): string {
  if (typeof rowKey === "function") {
    return rowKey(row, index);
  }
  if (rowKey) {
    const value = (row as Record<string, unknown>)[rowKey as string];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  const withId = row as Record<string, unknown>;
  if (typeof withId.id === "string" || typeof withId.id === "number") {
    return String(withId.id);
  }
  return `row_${index}`;
}

export function AccountingListView<TData>({
  data,
  columns,
  searchPlaceholder = "Search records",
  searchSubmitLabel = "Search",
  pagination,
  emptyState = "No records found.",
  toolbar,
  rowKey,
  groupBy,
  groupOrder,
  className,
  selectable = true,
}: AccountingListViewProps<TData>) {
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const listColumns = useMemo<ListViewColumnDefinition<TData>[]>(() => {
    return adaptColumnsForListView(columns);
  }, [columns]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return data;
    return data.filter((row) => toSearchText(row).includes(query));
  }, [data, searchQuery]);

  const paginationEnabled = pagination?.enabled ?? true;
  const totalPages = paginationEnabled ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    if (!paginationEnabled) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [paginationEnabled, filtered, currentPage, pageSize]);

  const internalRows = useMemo<InternalRow<TData>[]>(() => {
    return pagedRows.map((row, index) => ({
      ...(row as Record<string, unknown>),
      __list_row_key: getRowKey(row, index, rowKey),
      __row_index: index,
      __original: row,
    }));
  }, [pagedRows, rowKey]);

  const groupedRows = useMemo(() => {
    const withGroup = buildGroupedRows(
      internalRows,
      (row) => resolveGroupByValue(row.__original, groupBy),
      { groupOrder, fallbackGroup: "Other" },
    );
    const hasMultipleGroups = withGroup.length > 1;
    if (!hasMultipleGroups && !groupBy) return null;
    return withGroup;
  }, [internalRows, groupBy, groupOrder]);

  const listRows = groupedRows ?? internalRows;

  return (
    <div className={className ?? "space-y-0"}>
      <div className="flex flex-wrap items-center gap-2 bg-[var(--datatable-toolbar-bg)] px-[var(--content-gutter-x)] py-1.5 table-edge-to-edge">
        <form
          className="flex items-center gap-2 p-0"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearchQuery(searchDraft);
          }}
        >
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-[220px]"
          />
          <Button type="submit" size="sm" className="h-8 px-4">
            {searchSubmitLabel}
          </Button>
        </form>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        {paginationEnabled ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rows</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-[88px]">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">
              {filtered.length === 0 ? "0 of 0" : `${currentPage} of ${totalPages}`}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>

      <ListView
        columns={listColumns.map((column) => ({
          key: column.key,
          label: column.label,
          width: column.width,
          align: column.align,
        }))}
        rows={listRows}
        rowKey="__list_row_key"
        options={{
          emptyState: {
            title: emptyState,
            description: "",
          },
          options: {
            selectable,
            showTooltip: false,
            rowHeight: 42,
          },
          slots: {
            cell: ({ row, column }) => {
              const source = (row as InternalRow<TData>).__original;
              const rowIndex = (row as InternalRow<TData>).__row_index;
              const found = listColumns.find((candidate) => candidate.key === column.key);
              if (!found) return "";
              return renderColumnCell(found, source, rowIndex);
            },
            "group-header": ({ group }) => (
              <div className="flex w-full items-center justify-between pr-2">
                <span className="text-sm font-medium">{group.group}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {Array.isArray(group.rows) ? group.rows.length : 0}
                </span>
              </div>
            ),
          },
        }}
      />
    </div>
  );
}
