"use client";

import { useState, type ReactNode } from "react";

import { MasterData, type DataTableColumn } from "@corelithzw/react";
import { ManagementShell } from "@/components/settings/management-shell";
import type { ManagementArea } from "@/lib/settings/management-nav";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { getApiErrorMessage } from "@/lib/api-client";

/**
 * A reference-data set, on the design system's master-data pattern.
 *
 * Every set page — job grades, sections, downtime codes, scrap materials —
 * had grown the same page by hand: a shell, a spreadsheet-shaped table, and a
 * pencil and a bin squeezed into every row. The DS `MasterData` assembly is
 * the pattern those pages were reaching for: the list is for scanning, and
 * one record's actions live in a detail pane that opens when you pick it,
 * instead of forty pencils competing with the data.
 *
 * This wraps `MasterData` in the management chrome and the app's own error
 * handling, so a set page provides only what is genuinely its own: columns,
 * rows, a detail renderer, and its create/edit sheet.
 */
export function MasterDataPage<Row>({
  area = "master-data",
  title,
  description,
  createLabel,
  onCreate,
  columns,
  data,
  rowKey,
  renderDetail,
  isLoading,
  error,
  search,
  filters,
  emptyLabel,
  banner,
  children,
}: {
  /** Which management navigation group the shell highlights. */
  area?: ManagementArea;
  title: string;
  description?: string;
  createLabel?: string;
  onCreate?: () => void;
  columns: DataTableColumn<Row>[];
  data: Row[];
  rowKey: (row: Row) => string;
  /**
   * The detail pane for a selected row. Receives a `close` callback so an
   * action that removes the row (delete) can also drop the pane showing it.
   */
  renderDetail: (row: Row, close: () => void) => ReactNode;
  isLoading?: boolean;
  error?: unknown;
  /** Search slot, shown in the table toolbar. */
  search?: ReactNode;
  /** Filter controls, shown in the table toolbar beside search. */
  filters?: ReactNode;
  emptyLabel?: string;
  /** Rendered above the assembly — saved-record banners and the like. */
  banner?: ReactNode;
  /** Dialogs and sheets — mounted outside the assembly. */
  children?: ReactNode;
}) {
  const [selectedKey, setSelectedKey] = useState<string | number | null>(null);

  const selected = data.find((row) => rowKey(row) === selectedKey) ?? null;

  return (
    // The DS assembly composes its own header (title, lede, create action),
    // so the shell is asked to hold only the navigation chrome.
    <ManagementShell area={area} title={title} hideHeader>
      {banner}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load {title.toLowerCase()}</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <MasterData<Row>
        title={title}
        lede={description}
        createLabel={createLabel}
        onCreate={onCreate}
        columns={columns}
        data={data}
        rowKey={rowKey}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        renderDetail={
          selected
            ? () => renderDetail(selected, () => setSelectedKey(null))
            : undefined
        }
        search={search}
        filters={filters}
        emptyState={
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            {isLoading ? "Loading…" : (emptyLabel ?? "Nothing here yet.")}
          </p>
        }
      />

      {children}
    </ManagementShell>
  );
}

/** One labelled fact in a detail pane. */
export function DetailFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
