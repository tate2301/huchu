"use client";

import * as React from "react";

// DataTable can export what it shows, but rendering a PDF or CSV belongs to the
// Documents module, which sits above this package. So the table asks its host
// for an exporter through context and hides the export menu when none is
// mounted. A host that composes Documents provides one at its root.

export type TableExportFormat = "pdf" | "csv";

export type TableExportStatus =
  | "requesting"
  | "queued"
  | "processing"
  | "ready"
  | "downloading"
  | "done";

export type TableExportRequest = {
  sourceKey: string;
  format: TableExportFormat;
  filters?: Record<string, string>;
  templateId?: string;
  templateVersionId?: string;
  mode?: "SYNC" | "ASYNC";
  idempotencyKey?: string;
  payload: {
    title?: string;
    subtitle?: string;
    fileName?: string;
    meta?: unknown;
    list: {
      columns: { key: string; label: string }[];
      rows: unknown[];
    };
  };
};

export type TableExporter = (
  request: TableExportRequest,
  options: { onStatus?: (status: TableExportStatus, detail?: string) => void },
) => Promise<void>;

const TableExportContext = React.createContext<TableExporter | null>(null);

export function TableExportProvider({
  exporter,
  children,
}: {
  exporter: TableExporter;
  children: React.ReactNode;
}) {
  return (
    <TableExportContext.Provider value={exporter}>{children}</TableExportContext.Provider>
  );
}

export function useTableExporter(): TableExporter | null {
  return React.useContext(TableExportContext);
}

/** The default source key of a table: derived from the page it is on. */
export function inferTableSourceKey(pathname: string | null | undefined) {
  const safe = (pathname ?? "/")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "");
  return `ui.table.${safe || "root"}`;
}
