"use client";

import type { TableExporter } from "@corelithzw/ui/lib/table-export";
import { runDocumentExport } from "./export-client";

/** What every DataTable in this host exports through: the Documents render pipeline. */
export const documentsTableExporter: TableExporter = async (request, options) => {
  await runDocumentExport(request as Parameters<typeof runDocumentExport>[0], options);
};
