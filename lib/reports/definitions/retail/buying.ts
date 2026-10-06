import type { ListGrant, ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Buying › Suppliers (40-buying 5.1, `retail-suppliers`): the suppliers the
 * shop buys from, what it owes each and how they deliver. Opens on the ones
 * still bought from (Filters › Show); stopped ones carry " · stopped". Owed
 * and Spend stay for every role that reads it: buying roles may see cost.
 * The supplier record's Contacts tab is `retail-supplier-contacts`.
 */

const VIEW: ListGrant[] = [["retail.suppliers", "view"]];
const CREATE: ListGrant[] = [["retail.suppliers", "create"]];
const UPDATE: ListGrant[] = [["retail.suppliers", "update"]];
const STOP: ListGrant[] = [["retail.suppliers", "delete"]];

const suppliers: ListSpec = {
  noun: "suppliers",
  read: VIEW,
  // Names, codes, the rep and every contact's name, phones and WhatsApp numbers (`search` is a row field).
  search: { placeholder: "Name, contact or phone", keys: ["search"] },
  filters: [
    { key: "category", label: "Category", type: "choice", any: "Any", primary: true, optionsFromLoader: true },
    {
      key: "owed",
      label: "Owed",
      type: "choice",
      any: "Any",
      primary: true,
      options: [
        { value: "owed", label: "Owed something", where: [{ column: "owed", op: "gt", value: "0" }] },
        { value: "overdue", label: "Overdue", where: [{ column: "overdue", op: "gt", value: "0" }] },
        { value: "nothing", label: "Owes nothing", where: [{ column: "owed", op: "lt", value: "0.005" }] },
      ],
    },
    {
      key: "show",
      label: "Show",
      type: "choice",
      any: "Both",
      default: "buying",
      options: [
        { value: "buying", label: "Buying from", where: [{ column: "state", op: "is", value: ["buying"] }] },
        { value: "stopped", label: "Stopped", where: [{ column: "state", op: "is", value: ["stopped"] }] },
      ],
    },
  ],
  sorts: [
    {
      key: "spent",
      label: "Most spent",
      rules: [
        { column: "spend12", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "owed",
      label: "Most owed",
      rules: [
        { column: "owed", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    {
      key: "delivered",
      label: "Last delivery, newest",
      rules: [
        { column: "lastDelivery", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["terms", "category"],
  columns: [
    {
      key: "name",
      label: "Supplier",
      kind: "text",
      cell: "link",
      suffixKey: "stopped",
      width: "minmax(170px,1.3fr)",
      align: "start",
      priority: 1,
    },
    { key: "rep", label: "Contact", kind: "text", cell: "text", width: "130px", align: "start", priority: 3 },
    { key: "phone", label: "Phone", kind: "phone", cell: "mono", width: "150px", align: "start", priority: 2 },
    { key: "terms", label: "Terms", kind: "text", cell: "muted", width: "90px", align: "start", priority: 3 },
    { key: "openOrders", label: "Open", kind: "number", cell: "num", total: "sum", width: "70px", align: "end", priority: 1 },
    { key: "owed", label: "Owed", kind: "money", currency: "USD", cell: "owed", total: "sum", width: "110px", align: "end", priority: 1 },
    { key: "lastDelivery", label: "Last delivery", kind: "date", cell: "date", width: "130px", align: "start", priority: 3 },
    {
      key: "fillRate",
      label: "Fill rate",
      kind: "text",
      cell: "bar",
      bar: { pctKey: "fillPct", warnBelow: 80 },
      width: "130px",
      align: "start",
      priority: 2,
    },
    {
      key: "spend12",
      label: "Spend, 12 months",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      width: "120px",
      align: "end",
      priority: 1,
    },
    // Not drawn: the Category group, and the phone card's badge and meta.
    { key: "category", label: "Category", kind: "text", cell: "text", hidden: true, width: "140px", align: "start", priority: 3 },
    { key: "lateBadge", label: "Late", kind: "status", cell: "state", toneKey: "lateTone", hidden: true, width: "90px", align: "start", priority: 3 },
  ],
  rowHref: "/retail/buying/suppliers/{id}",
  rowMenu: [
    { key: "open", label: "Open", requires: VIEW, do: { href: "/retail/buying/suppliers/{id}" } },
    { key: "message", label: "Message on WhatsApp", requires: UPDATE, do: { href: "/retail/buying/suppliers?sheet=supplier-message&ids={id}" } },
    {
      key: "stop",
      label: "Stop buying from them",
      tone: "bad",
      separated: true,
      requires: STOP,
      when: [{ column: "state", op: "is", value: ["buying"] }],
      do: { run: "stopbuying", endpoint: "/api/v2/retail/buying/suppliers/{id}/stop" },
    },
  ],
  bulk: [
    { key: "message", label: "Message on WhatsApp", requires: UPDATE, do: { sheet: "supplier-message" } },
    { key: "export" },
  ],
  primary: { label: "New supplier", icon: "plus", requires: CREATE, sheet: "supplier-new" },
  card: { title: "name", badge: "lateBadge", figure: "owed", meta: "{cardMeta}" },
  empty: {
    title: "Who do you buy from?",
    line: "Add a supplier once, and ordering becomes a tap from anything running low.",
    steps: [
      ["Add them with a name and a WhatsApp number.", "Terms and bank details can wait."],
      ["Link the products you buy from them.", "Or let it happen on their first delivery."],
      ["Order from low stock.", "Tender suggests the lines; you send them on WhatsApp."],
    ],
    primary: { label: "Add your first supplier", sheet: "supplier-new", requires: CREATE },
    secondary: { label: "Import a spreadsheet", href: "/retail/buying/suppliers?sheet=supplier-import", requires: CREATE },
  },
  catalog: false,
};

const suppliersSource: ReportDefinition = {
  key: "retail-suppliers",
  title: "Suppliers",
  area: "Buying",
  href: "/retail/buying/suppliers",
  profiles: ["RETAIL"],
  params: [],
  columns: suppliers.columns,
  defaults: { sort: suppliers.sorts[0]!.rules.slice(0, 1) },
  list: suppliers,
};

/**
 * A supplier's Contacts tab (5.2, `retail-supplier-contacts`): its people,
 * the rep first, and what each is sent. Without a supplier it has no rows.
 */
const contacts: ListSpec = {
  noun: "contacts",
  read: VIEW,
  search: { placeholder: "Name or phone", keys: ["name", "phone", "email"] },
  filters: [{ key: "supplier", type: "parent", column: "supplierId" }],
  sorts: [{ key: "rep", label: "Rep first", rules: [{ column: "order", dir: "asc" }] }],
  columns: [
    { key: "name", label: "Name", kind: "text", cell: "link", width: "minmax(160px,1fr)", align: "start", priority: 1 },
    { key: "role", label: "Role", kind: "text", cell: "muted", width: "130px", align: "start", priority: 2 },
    { key: "phone", label: "Phone", kind: "phone", cell: "mono", width: "150px", align: "start", priority: 1 },
    { key: "email", label: "Email", kind: "email", cell: "text", width: "190px", align: "start", priority: 3 },
    {
      key: "sends",
      label: "Sends them",
      kind: "status",
      cell: "state",
      tones: { Orders: "info", Statements: "neutral", Nothing: "hollow" },
      width: "120px",
      align: "start",
      priority: 1,
    },
    { key: "order", label: "Order", kind: "number", cell: "num", hidden: true, width: "60px", align: "end", priority: 3 },
  ],
  rowHref: "/retail/buying/suppliers/{supplierId}?sheet=contact-new&supplierId={supplierId}&id={id}",
  rowMenu: [
    {
      key: "edit",
      label: "Edit",
      requires: UPDATE,
      do: { href: "/retail/buying/suppliers/{supplierId}?sheet=contact-new&supplierId={supplierId}&id={id}" },
    },
    {
      key: "rep",
      label: "Make them the rep",
      requires: UPDATE,
      when: [{ column: "isRep", op: "is", value: ["no"] }],
      do: { run: "makerep", endpoint: "/api/v2/retail/buying/suppliers/{supplierId}" },
    },
    {
      key: "remove",
      label: "Remove",
      tone: "bad",
      separated: true,
      requires: UPDATE,
      do: { run: "removecontact", endpoint: "/api/v2/retail/buying/suppliers/{supplierId}/contacts/{id}" },
    },
  ],
  card: { title: "name", badge: "sends", figure: "phone", meta: "{role}" },
  empty: { icon: "Users", title: "Nobody at this supplier yet", line: "Add a contact to say who gets orders and who gets statements." },
  catalog: false,
};

const contactsSource: ReportDefinition = {
  key: "retail-supplier-contacts",
  title: "Contacts at a supplier",
  area: "Buying",
  href: "/retail/buying/suppliers",
  profiles: ["RETAIL"],
  params: [],
  columns: contacts.columns,
  defaults: { sort: contacts.sorts[0]!.rules },
  list: contacts,
};

export const BUYING_REPORTS: ReportDefinition[] = [suppliersSource, contactsSource];
