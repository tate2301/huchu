import type { ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Setup › Bin (80-admin 5.10, W-63): everything the shop moved to the bin in
 * the last 30 days, of every kind, soonest gone first. Restore puts one back
 * at once; the owner deletes for good. One row per record, its id
 * `<kind>:<id>`, so the endpoints know which table each is in.
 *
 * Rows are few (only 30 days of removals), so the engine narrows, sorts and
 * groups them in memory.
 */

const VIEW: ListSpec["read"] = [["retail.bin", "view"]];
const RESTORE: ListSpec["read"] = [["retail.bin", "update"]];
const DELETE: ListSpec["read"] = [["retail.bin", "delete"]];

const bin: ListSpec = {
  noun: "items",
  sub: "Kept for 30 days, then gone for good",
  read: VIEW,
  // `reference` is a row key, not a column: the product's code, the promotion's code.
  search: { placeholder: "Name or reference", keys: ["what", "reference"] },
  filters: [
    // The kinds in the bin now, by their labels (the loader's options).
    { key: "kind", label: "Kind", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "kind" },
  ],
  sorts: [
    {
      key: "gone-soonest",
      label: "Gone soonest",
      rules: [
        { column: "goneAt", dir: "asc" },
        { column: "what", dir: "asc" },
      ],
    },
    { key: "binned-newest", label: "Binned, newest", rules: [{ column: "binnedAt", dir: "desc" }] },
    { key: "name", label: "Name A–Z", rules: [{ column: "what", dir: "asc" }] },
  ],
  groups: ["kindLabel"],
  columns: [
    { key: "what", label: "What", kind: "text", cell: "text", width: "minmax(190px,1.4fr)", align: "start", priority: 1 },
    { key: "kindLabel", label: "Kind", kind: "text", cell: "muted", width: "130px", align: "start", priority: 1 },
    { key: "binnedBy", label: "Binned by", kind: "text", cell: "muted", width: "150px", align: "start", priority: 2 },
    { key: "binnedAt", label: "Binned", kind: "date", cell: "date", dayFormat: "relative", width: "130px", align: "start", priority: 1 },
    {
      key: "goneAt",
      label: "Gone for good",
      kind: "date",
      cell: "date",
      dayFormat: "medium",
      // The last three days read in --warn.
      toneKey: "goneTone",
      width: "130px",
      align: "start",
      priority: 1,
    },
    { key: "restore", label: "", kind: "text", cell: "action", action: "restore", width: "120px", align: "start", priority: 1 },
  ],
  // A bin row opens nothing on a click: "Open it" in its menu does, for kinds with a record.
  rowHref: "",
  rowMenu: [
    {
      key: "restore",
      label: "Restore",
      requires: RESTORE,
      do: { run: "restorebin", endpoint: "/api/v2/retail/bin/restore-many" },
    },
    {
      key: "open",
      label: "Open it",
      requires: VIEW,
      when: [{ column: "openable", op: "notEmpty" }],
      // Each kind with a record page adds its template; the first whose key the row carries wins.
      do: { href: ["/retail/products/{productId}", "/retail/products/price-lists/{priceListId}"] },
    },
    {
      key: "delete",
      label: "Delete for good",
      tone: "bad",
      separated: true,
      requires: DELETE,
      do: { run: "deleteforgood", endpoint: "/api/v2/retail/bin/delete" },
    },
  ],
  bulk: [
    { key: "restore", label: "Restore", requires: RESTORE, do: { run: "restorebin", endpoint: "/api/v2/retail/bin/restore-many" } },
    {
      key: "delete",
      label: "Delete for good",
      tone: "bad",
      requires: DELETE,
      do: { run: "deleteforgood", endpoint: "/api/v2/retail/bin/delete" },
    },
  ],
  // The day it goes for good at the right of the name; Kind · Binned by under it.
  card: { title: "what", figure: "goneAt", meta: ["{kindLabel} · {binnedBy}", "{kindLabel}"], action: "restore" },
  empty: {
    icon: "Trash",
    title: "The bin is empty",
    line: "Anything moved to the bin waits here for 30 days.",
  },
};

const binSource: ReportDefinition = {
  key: "retail-bin",
  title: "Bin",
  area: "Setup",
  href: "/retail/manage/bin",
  profiles: ["RETAIL"],
  params: [],
  columns: bin.columns,
  defaults: { sort: bin.sorts[0]!.rules.slice(0, 1) },
  list: bin,
};

export const BIN_REPORTS: ReportDefinition[] = [binSource];
