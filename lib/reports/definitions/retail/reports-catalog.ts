import { REPORT_AREAS } from "@/lib/reports/areas";
import type { ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Reports › Every template and the area pages (70-insights-reports 5.10,
 * 5.11; INS-07): every template the person may open, built in or saved by the
 * team, one row each. In memory: a workspace keeps a handful of templates.
 *
 * `?area=stock` is the parent filter that makes an area page; the page itself
 * says which area it is, so the Area column is not drawn there, nor while the
 * list is grouped by area (one heading per area, in the panel's order).
 */

const READ: ListSpec["read"] = [["retail.reports", "view"]];

const catalogue: ListSpec = {
  noun: "templates",
  read: READ,
  refusal: "Your role cannot view reports",
  search: { placeholder: "Template, or what it shows", keys: ["name", "summary"] },
  tabs: [
    { key: "all", label: "All", where: [] },
    { key: "built-in", label: "Built in", where: [{ column: "origin", op: "is", value: ["BUILT_IN"] }] },
    { key: "team", label: "Made by your team", where: [{ column: "origin", op: "is", value: ["SAVED"] }] },
    {
      key: "mine",
      label: "Just yours",
      where: [{ column: "whose", op: "is", value: ["MINE"] }],
      empty: "Nothing of yours yet. Open any report, change what it shows, then choose Save as a template.",
    },
  ],
  filters: [
    { key: "area", type: "parent", column: "areaSlug" },
    // Inside Filters on Every template; on the row on an area page (the page's `rowFilters`).
    { key: "madeBy", label: "Made by", type: "choice", any: "Anyone", optionsFromLoader: true, column: "madeByKey" },
    {
      key: "seenBy",
      label: "Seen by",
      type: "choice",
      any: "Anyone",
      primary: true,
      options: [
        { value: "everyone", label: "Everyone", where: [{ column: "seenByKey", op: "is", value: ["EVERYONE"] }] },
        { value: "managers", label: "Managers", where: [{ column: "seenByKey", op: "is", value: ["MANAGERS"] }] },
        { value: "just-you", label: "Just you", where: [{ column: "seenByKey", op: "is", value: ["JUST_ME"] }] },
      ],
    },
  ],
  sorts: [
    {
      key: "area",
      label: "Area, then name",
      rules: [
        { column: "areaOrder", dir: "asc" },
        { column: "name", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    {
      key: "last-opened",
      label: "Last opened",
      rules: [
        { column: "lastOpenedAt", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["area", "seenBy"],
  defaultGroup: "area",
  columns: [
    { key: "name", label: "Template", kind: "text", cell: "link", width: "minmax(190px,1.1fr)", align: "start", priority: 1 },
    { key: "summary", label: "What it shows", kind: "text", cell: "text", width: "minmax(280px,2fr)", align: "start", priority: 2 },
    {
      key: "area",
      label: "Area",
      kind: "text",
      cell: "muted",
      width: "110px",
      align: "start",
      priority: 3,
      groupOrder: REPORT_AREAS.map((area) => area.label),
      impliedBy: { group: true, parent: "area" },
    },
    // "Built in" in faint ink; a person's name; "You".
    { key: "madeBy", label: "Made by", kind: "text", cell: "text", toneKey: "madeByTone", width: "150px", align: "start", priority: 2 },
    {
      key: "seenBy",
      label: "Seen by",
      kind: "status",
      cell: "state",
      tones: { Everyone: "hollow", Managers: "hollow", "Just you": "neutral" },
      width: "130px",
      align: "start",
      priority: 1,
    },
    // "Today, 08:12", "Yesterday, 17:40", "28 September 2026"; never opened "—". Sorted by "Last opened".
    { key: "lastOpened", label: "Last opened", kind: "text", cell: "text", width: "150px", align: "start", priority: 2 },
  ],
  rowHref: "/retail/reports/{id}",
  rowMenu: [{ key: "open", label: "Open", requires: READ, do: { href: "/retail/reports/{id}" } }],
  bulk: [{ key: "export" }],
  card: { title: "name", badge: "seenBy", figure: "lastOpened", meta: "{area} · {madeBy}" },
  empty: {
    icon: "FileText",
    title: "No templates here",
    line: "Templates on the reports your role reads are listed here. Open one to run it.",
  },
};

const catalogueSource: ReportDefinition = {
  key: "retail-report-templates",
  title: "Every template",
  area: "Reports",
  href: "/retail/reports",
  profiles: ["RETAIL"],
  params: [],
  columns: catalogue.columns,
  defaults: {
    sort: [
      { column: "area", dir: "asc" },
      { column: "name", dir: "asc" },
    ],
  },
  list: catalogue,
};

export const REPORT_CATALOG_REPORTS: ReportDefinition[] = [catalogueSource];
