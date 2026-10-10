import type { ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Setup › Tills and devices (10-setup 5.5; W-04, W-76): every working till
 * of the shop, what runs it, when it last sold, who is on it now and its
 * state. A row opens the till's sheet; there is no till record. The list
 * refetches every 30 seconds, because states change on their own.
 */

const tills: ListSpec = {
  noun: "tills",
  read: [["retail.tills", "view"]],
  search: { placeholder: "Till or device", keys: ["name", "device"] },
  filters: [
    { key: "site", label: "Site", type: "choice", any: "All sites", primary: true, optionsFromLoader: true, column: "siteId", hideBelow: 2 },
    {
      key: "state",
      label: "State",
      type: "choice",
      any: "Any",
      primary: true,
      options: [
        { value: "selling", label: "Selling", where: [{ column: "stateKey", op: "is", value: ["SELLING"] }] },
        { value: "closed", label: "Closed", where: [{ column: "stateKey", op: "is", value: ["CLOSED"] }] },
        { value: "offline", label: "Offline", where: [{ column: "stateKey", op: "is", value: ["OFFLINE"] }] },
        { value: "not-paired", label: "Not paired", where: [{ column: "stateKey", op: "is", value: ["NOT_PAIRED"] }] },
      ],
    },
    // Inside Filters: what runs each till.
    {
      key: "device",
      label: "Device",
      type: "choice",
      any: "Any",
      options: [
        { value: "counter-mini", label: "CounterMini", where: [{ column: "deviceKey", op: "is", value: ["COUNTER_MINI"] }] },
        { value: "kora", label: "Kora", where: [{ column: "deviceKey", op: "is", value: ["KORA"] }] },
        { value: "browser", label: "Browser", where: [{ column: "deviceKey", op: "is", value: ["BROWSER"] }] },
        { value: "none", label: "No device yet", where: [{ column: "deviceKey", op: "is", value: ["NONE"] }] },
      ],
    },
  ],
  sorts: [
    {
      key: "site",
      label: "Site, then name",
      // The default site first, then the others by name.
      rules: [
        { column: "siteOrder", dir: "asc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "last-sale",
      label: "Last sale, newest first",
      rules: [
        { column: "lastSaleAt", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["site", "state"],
  columns: [
    { key: "name", label: "Till", kind: "text", cell: "link", width: "minmax(160px,1.2fr)", align: "start", priority: 1 },
    { key: "site", label: "Site", kind: "text", cell: "text", width: "160px", align: "start", priority: 2 },
    { key: "device", label: "Device", kind: "text", cell: "muted", width: "150px", align: "start", priority: 2 },
    // "Today, 11:42"; blank before a till's first sale.
    { key: "lastSale", label: "Last sale", kind: "text", cell: "mono", empty: "blank", width: "150px", align: "start", priority: 3 },
    { key: "onItNow", label: "On it now", kind: "text", cell: "text", width: "150px", align: "start", priority: 1 },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      toneKey: "stateTone",
      tones: { Selling: "ok", Closed: "hollow", Offline: "warn", "Not paired": "neutral" },
      width: "150px",
      align: "start",
      priority: 1,
    },
  ],
  rowHref: "/retail/manage/tills?sheet=till&id={id}",
  rowMenu: [
    { key: "open", label: "Open", requires: [["retail.tills", "view"]], do: { sheet: "till" } },
    {
      key: "replace",
      label: "Pair another device",
      requires: [["retail.tills", "update"]],
      when: [{ column: "stateKey", op: "isNot", value: ["NOT_PAIRED"] }],
      do: { sheet: "till-replace" },
    },
    {
      key: "unpair",
      label: "Unpair",
      tone: "bad",
      requires: [["retail.tills", "update"]],
      when: [{ column: "stateKey", op: "isNot", value: ["NOT_PAIRED"] }],
      // The TillEdit confirm; with a shift open it says why and offers only "Keep it".
      do: { run: "unpairtill", endpoint: "/api/v2/retail/tills/{id}/unpair" },
    },
    {
      key: "pair",
      label: "Pair a device",
      requires: [["retail.tills", "update"]],
      when: [{ column: "stateKey", op: "is", value: ["NOT_PAIRED"] }],
      do: { sheet: "till" },
    },
  ],
  bulk: [
    // The floor area closes each open shift with its own count.
    { key: "close-shifts", label: "Close shifts", requires: [["retail.cash-control", "view"]], do: { href: "/retail/shifts?state=open" } },
    { key: "message", label: "Send a message", requires: [["retail.tills", "update"]], do: { sheet: "till-message" } },
    { key: "export" },
  ],
  primary: { label: "Pair a till", icon: "plus", requires: [["retail.tills", "create"]], sheet: "till-new" },
  card: { title: "name", badge: "state", figure: "", meta: "{site} · {device}", meta2: "{lastSaleCard} · {onItNow}" },
  empty: {
    icon: "DeviceMobile",
    title: "No tills yet",
    line: "A till is where money is taken. Pair a CounterMini, a Kora handheld or a browser to it with a six-digit code.",
    primary: { label: "Pair a till", sheet: "till-new", requires: [["retail.tills", "create"]] },
  },
  refreshSeconds: 30,
};

const tillsSource: ReportDefinition = {
  key: "retail-tills",
  title: "Tills and devices",
  area: "Setup",
  href: "/retail/manage/tills",
  profiles: ["RETAIL"],
  params: [],
  columns: tills.columns,
  // The report view sorts by columns only; the list's own "Site, then name" puts the default site first.
  defaults: {
    sort: [
      { column: "site", dir: "asc" },
      { column: "name", dir: "asc" },
    ],
  },
  list: tills,
};

export const TILL_REPORTS: ReportDefinition[] = [tillsSource];
