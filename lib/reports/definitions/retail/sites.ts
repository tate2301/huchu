import type { ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Setup › Sites (10-setup 5.4; W-03, W-66): the shop's sites, each with the
 * places inside it, the tills that sell there, the price list they sell from
 * and what its stock is worth. A row opens the site's sheet; there is no site
 * record. Stock value is dropped for roles that may not see cost.
 */

const sites: ListSpec = {
  noun: "sites",
  read: [["retail.sites", "view"]],
  search: { placeholder: "Name or code", keys: ["name", "code"] },
  filters: [
    {
      key: "state",
      label: "State",
      type: "choice",
      any: "Any",
      default: "open",
      primary: true,
      options: [
        { value: "open", label: "Open", where: [{ column: "state", op: "isNot", value: ["Closed"] }] },
        { value: "closed", label: "Closed", where: [{ column: "state", op: "is", value: ["Closed"] }] },
      ],
    },
  ],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "name-desc", label: "Name Z–A", rules: [{ column: "name", dir: "desc" }] },
    {
      key: "stock-value",
      label: "Stock value, highest first",
      rules: [
        { column: "stockValue", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["state"],
  columns: [
    {
      key: "name",
      label: "Site",
      kind: "text",
      cell: "link",
      sortable: true,
      width: "minmax(190px,1.4fr)",
      align: "start",
      priority: 1,
    },
    { key: "code", label: "Code", kind: "text", cell: "mono", width: "90px", align: "start", priority: 1 },
    { key: "places", label: "Places inside it", kind: "text", cell: "text", width: "minmax(160px,1.2fr)", align: "start", priority: 2 },
    { key: "tills", label: "Tills", kind: "number", cell: "num", total: "sum", width: "70px", align: "end", priority: 2 },
    { key: "priceList", label: "Price list", kind: "text", cell: "text", width: "140px", align: "start", priority: 3 },
    {
      key: "stockValue",
      label: "Stock value",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      sortable: true,
      width: "130px",
      align: "end",
      priority: 1,
      requires: "view-cost",
    },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      tones: { Default: "info", Open: "hollow", Closed: "neutral" },
      width: "120px",
      align: "start",
      priority: 1,
    },
  ],
  rowHref: "/retail/manage/sites?sheet=site&id={id}",
  rowMenu: [
    { key: "open", label: "Open", requires: [["retail.sites", "view"]], do: { sheet: "site" } },
    {
      key: "default",
      label: "Make default",
      requires: [["retail.sites", "update"]],
      when: [{ column: "state", op: "is", value: ["Open"] }],
      do: { sheet: "site-default" },
    },
    {
      key: "close",
      label: "Close this site",
      tone: "bad",
      requires: [["retail.sites", "delete"]],
      when: [{ column: "state", op: "is", value: ["Open"] }],
      do: { sheet: "site-close" },
    },
  ],
  bulk: [{ key: "export" }],
  primary: { label: "Add a site", icon: "plus", requires: [["retail.sites", "create"]], sheet: "site-new" },
  card: { title: "name", badge: "state", figure: "stockValue", meta: "{code} · {places} · {tillWords}" },
  empty: {
    icon: "Storefront",
    title: "No sites yet",
    line: "A site is one shop: its places, its tills and the price list they sell from.",
    primary: { label: "Add a site", sheet: "site-new", requires: [["retail.sites", "create"]] },
  },
  catalog: false,
};

const sitesSource: ReportDefinition = {
  key: "retail-sites",
  title: "Sites",
  area: "Setup",
  href: "/retail/manage/sites",
  profiles: ["RETAIL"],
  params: [],
  columns: sites.columns,
  defaults: { sort: sites.sorts[0]!.rules },
  list: sites,
};

export const SITE_REPORTS: ReportDefinition[] = [sitesSource];
