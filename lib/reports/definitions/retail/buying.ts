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
      key: "order",
      label: "New order",
      requires: [["retail.purchasing", "create"]],
      when: [{ column: "state", op: "is", value: ["buying"] }],
      do: { href: "/retail/buying/suppliers?sheet=order-new&supplierId={id}" },
    },
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
    {
      key: "order",
      label: "New order for each",
      requires: [["retail.purchasing", "create"]],
      when: [{ column: "state", op: "is", value: ["buying"] }],
      do: { sheet: "order-new", with: { supplierIds: "{ids}" } },
    },
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
    { key: "name", label: "Name", kind: "text", cell: "text", strong: true, width: "minmax(160px,1fr)", align: "start", priority: 1 },
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
  // A phone card opens the contact's sheet only for who may change it: `editId` is set for them alone.
  rowHref: "/retail/buying/suppliers/{supplierId}?sheet=contact-new&supplierId={supplierId}&id={editId}",
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

/* ── Orders (5.3, `retail-orders`) ─────────────────────────────────────── */

const ORDER_VIEW: ListGrant[] = [["retail.purchasing", "view"]];
const ORDER_CREATE: ListGrant[] = [["retail.purchasing", "create"]];
const ORDER_UPDATE: ListGrant[] = [["retail.purchasing", "update"]];
const ORDER_DELETE: ListGrant[] = [["retail.purchasing", "delete"]];
const ORDER_RECEIVE: ListGrant[] = [["retail.purchasing", "receive"]];
const IS = (values: string[]) => [{ column: "status", op: "is" as const, value: values }];
const OPEN_FOR_DELIVERY = IS(["DRAFT", "SENT", "PARTIAL"]);

/**
 * Buying › Orders (40-buying 5.3): what the shop has ordered and what is still
 * to come. Opens on Open (sent or part delivered); Drafts, Received (received,
 * closed short or cancelled) and All beside it. Value and Still to come carry
 * VAT. The supplier record's Orders tab is this list under its `supplierId`.
 */
const orders: ListSpec = {
  noun: "orders",
  read: ORDER_VIEW,
  search: { placeholder: "Order number or supplier", keys: ["poNo", "supplier"] },
  tabs: [
    { key: "open", label: "Open", where: IS(["SENT", "PARTIAL"]) },
    { key: "drafts", label: "Drafts", where: IS(["DRAFT"]) },
    { key: "received", label: "Received", where: IS(["RECEIVED", "CLOSED", "CANCELLED"]) },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    { key: "supplier", label: "Supplier", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "supplierId" },
    { key: "site", label: "Site", type: "choice", any: "Any", primary: true, optionsFromLoader: true, column: "siteId", hideBelow: 2 },
    // Late (W-34): sent or part delivered, something still to come, and past the day first expected. The loader asks it.
    {
      key: "late",
      label: "Late",
      type: "choice",
      any: "Any",
      options: [
        { value: "late", label: "Late" },
        { value: "not-late", label: "Not late" },
      ],
    },
    { key: "raised", label: "Raised", type: "period", any: "Any time", column: "raised" },
    { key: "supplierId", type: "parent", column: "supplierId" },
  ],
  sorts: [
    {
      key: "expected",
      label: "Expected, soonest",
      rules: [
        { column: "expected", dir: "asc" },
        { column: "poNo", dir: "asc" },
      ],
    },
    {
      key: "raised",
      label: "Raised, newest",
      rules: [
        { column: "raisedAt", dir: "desc" },
        { column: "poNo", dir: "desc" },
      ],
    },
    {
      key: "still",
      label: "Most still to come",
      rules: [
        { column: "stillToCome", dir: "desc" },
        { column: "poNo", dir: "asc" },
      ],
    },
    { key: "number", label: "Order number", rules: [{ column: "poNo", dir: "asc" }] },
  ],
  groups: ["state", "supplier", "site"],
  columns: [
    { key: "poNo", label: "Order", kind: "code", cell: "ref", href: "/retail/buying/orders/{id}", width: "110px", align: "start", priority: 1 },
    { key: "supplier", label: "Supplier", kind: "text", cell: "text", width: "minmax(160px,1.3fr)", align: "start", priority: 1 },
    { key: "state", label: "State", kind: "status", cell: "state", toneKey: "tone", width: "130px", align: "start", priority: 1 },
    { key: "raised", label: "Raised", kind: "date", cell: "date", width: "120px", align: "start", priority: 3 },
    { key: "expected", label: "Expected", kind: "date", cell: "date", width: "140px", align: "start", priority: 2 },
    {
      key: "delivered",
      label: "Delivered",
      kind: "text",
      cell: "bar",
      bar: { pctKey: "deliveredPct", warnBelow: 100 },
      width: "150px",
      align: "start",
      priority: 2,
    },
    { key: "value", label: "Value", kind: "money", currency: "USD", cell: "money", total: "sum", width: "110px", align: "end", priority: 1 },
    {
      key: "stillToCome",
      label: "Still to come",
      kind: "money",
      currency: "USD",
      cell: "owed",
      pillKey: "stillPill",
      total: "sum",
      width: "120px",
      align: "end",
      priority: 1,
    },
    // Not drawn: the order state's code (tabs, menus), sorting keys, the site, the record tab's "300 of 780" and the phone card.
    { key: "status", label: "Status", kind: "status", cell: "text", hidden: true, width: "90px", align: "start", priority: 3 },
    { key: "site", label: "Site", kind: "text", cell: "muted", hidden: true, requires: "multi-site", width: "140px", align: "start", priority: 3 },
    { key: "raisedAt", label: "Raised at", kind: "date", cell: "when", hidden: true, sortable: true, width: "140px", align: "start", priority: 3 },
    { key: "deliveredWords", label: "Delivered", kind: "text", cell: "mono", hidden: true, width: "140px", align: "end", priority: 3 },
    { key: "title", label: "Order and supplier", kind: "text", cell: "text", hidden: true, width: "minmax(200px,1fr)", align: "start", priority: 3 },
  ],
  rowHref: "/retail/buying/orders/{id}",
  rowMenu: [
    { key: "open", label: "Open", requires: ORDER_VIEW, do: { href: "/retail/buying/orders/{id}" } },
    {
      key: "send",
      label: "Send to {supplierShort}",
      requires: ORDER_CREATE,
      when: IS(["DRAFT"]),
      do: { run: "sendorder", endpoint: "/api/v2/retail/buying/orders/{id}/send" },
    },
    {
      key: "receive",
      label: "Receive a delivery",
      requires: ORDER_RECEIVE,
      when: OPEN_FOR_DELIVERY,
      do: { href: "/retail/buying/deliveries?orderId={id}" },
    },
    {
      key: "chase",
      label: "Send a reminder",
      requires: ORDER_UPDATE,
      when: IS(["SENT", "PARTIAL"]),
      do: { href: "/retail/buying/orders?sheet=order-chase&id={id}" },
    },
    {
      key: "edit",
      label: "Edit lines",
      requires: ORDER_UPDATE,
      when: OPEN_FOR_DELIVERY,
      do: { href: "/retail/buying/orders?sheet=order-edit&id={id}" },
    },
    { key: "duplicate", label: "Duplicate order", requires: ORDER_CREATE, do: { run: "duplicateorder", endpoint: "/api/v2/retail/buying/orders/{id}/duplicate" } },
    {
      key: "close",
      label: "Close with what came",
      requires: ORDER_UPDATE,
      when: [{ column: "closable", op: "is", value: ["yes"] }],
      do: { run: "closeshort", endpoint: "/api/v2/retail/buying/orders/{id}/close" },
    },
    {
      key: "remove",
      label: "Remove the order",
      tone: "bad",
      separated: true,
      requires: ORDER_DELETE,
      when: IS(["DRAFT"]),
      do: { run: "removeorder", endpoint: "/api/v2/retail/bin" },
    },
  ],
  bulk: [
    {
      key: "send",
      label: "Send to suppliers",
      requires: ORDER_CREATE,
      when: IS(["DRAFT"]),
      do: { run: "sendorders", endpoint: "/api/v2/retail/buying/orders/bulk/send" },
    },
    { key: "cancel", label: "Cancel", tone: "bad", requires: ORDER_UPDATE, do: { run: "cancelorders", endpoint: "/api/v2/retail/buying/orders/bulk/cancel" } },
    { key: "export" },
  ],
  primary: { label: "New order", icon: "plus", requires: ORDER_CREATE, sheet: "order-new" },
  card: { title: "title", badge: "state", figure: "stillToCome", meta: "{cardMeta}" },
  empty: {
    icon: "TrayArrowDown",
    title: "No orders yet",
    line: "Orders you raise, from low stock or by hand, show here.",
    primary: { label: "New order", sheet: "order-new", requires: ORDER_CREATE },
  },
};

const ordersSource: ReportDefinition = {
  key: "retail-orders",
  title: "Orders",
  area: "Buying",
  href: "/retail/buying/orders",
  profiles: ["RETAIL"],
  params: [],
  columns: orders.columns,
  defaults: { sort: orders.sorts[0]!.rules.slice(0, 1) },
  list: orders,
};

/**
 * An order's Lines tab (5.4, `retail-order-lines`): ordered, delivered and
 * still to come a line, at cost ex VAT. Without an order it has no rows.
 */
const orderLines: ListSpec = {
  noun: "lines",
  read: ORDER_VIEW,
  search: { placeholder: "Product", keys: ["product"] },
  filters: [{ key: "orderId", type: "parent", column: "orderId" }],
  sorts: [{ key: "ordered", label: "As ordered", rules: [{ column: "order", dir: "asc" }] }],
  columns: [
    { key: "product", label: "Product", kind: "text", cell: "text", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "ordered", label: "Ordered", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    { key: "delivered", label: "Delivered", kind: "number", cell: "num", total: "sum", width: "90px", align: "end", priority: 1 },
    {
      key: "stillToCome",
      label: "Still to come",
      kind: "number",
      cell: "num",
      pillKey: "stillTone",
      unitKey: "stillUnit",
      total: "sum",
      width: "110px",
      align: "end",
      priority: 1,
    },
    { key: "cost", label: "Cost", kind: "money", currency: "USD", cell: "money", toneKey: "costTone", width: "90px", align: "end", priority: 3 },
    { key: "value", label: "Value", kind: "money", currency: "USD", cell: "money", total: "sum", width: "110px", align: "end", priority: 1 },
    { key: "order", label: "Order", kind: "number", cell: "num", hidden: true, width: "60px", align: "end", priority: 3 },
  ],
  rowHref: "/retail/products/{productId}",
  card: { title: "product", figure: "stillToCome", meta: "{delivered} of {ordered} delivered" },
  empty: { icon: "TrayArrowDown", title: "Nothing on this order", line: "Edit the lines to add what to order." },
};

const orderLinesSource: ReportDefinition = {
  key: "retail-order-lines",
  title: "Lines on an order",
  area: "Buying",
  href: "/retail/buying/orders",
  profiles: ["RETAIL"],
  params: [],
  columns: orderLines.columns,
  defaults: { sort: orderLines.sorts[0]!.rules },
  list: orderLines,
};

/**
 * An order's Messages tab (5.4, `retail-order-messages`): the order sent,
 * the changes and reminders, and the supplier's replies, newest first. A
 * message that failed can be sent again.
 */
const orderMessages: ListSpec = {
  noun: "messages",
  read: ORDER_VIEW,
  search: { placeholder: "Message", keys: ["message", "who"] },
  filters: [{ key: "orderId", type: "parent", column: "orderId" }],
  sorts: [{ key: "newest", label: "Newest first", rules: [{ column: "when", dir: "desc" }] }],
  columns: [
    { key: "when", label: "When", kind: "date", cell: "when", width: "150px", align: "start", priority: 1 },
    { key: "who", label: "Who", kind: "text", cell: "text", width: "180px", align: "start", priority: 1 },
    { key: "how", label: "How", kind: "text", cell: "muted", width: "100px", align: "start", priority: 2 },
    { key: "message", label: "Message", kind: "text", cell: "text", titleKey: "message", width: "minmax(0,1fr)", align: "start", priority: 1 },
    { key: "state", label: "State", kind: "status", cell: "state", toneKey: "tone", width: "200px", align: "start", priority: 1 },
    { key: "status", label: "Status", kind: "status", cell: "text", hidden: true, width: "90px", align: "start", priority: 3 },
  ],
  rowHref: "/retail/buying/orders/{orderId}",
  rowMenu: [
    {
      key: "again",
      label: "Send again",
      requires: ORDER_UPDATE,
      when: [{ column: "status", op: "is", value: ["FAILED"] }],
      do: { run: "sendagain", endpoint: "/api/v2/retail/buying/orders/{orderId}/messages/{id}" },
    },
  ],
  card: { title: "who", badge: "state", figure: "how", meta: "{message}" },
  empty: { icon: "ChatCircle", title: "No messages yet", line: "The order, its changes and the supplier's replies show here once it is sent." },
};

const orderMessagesSource: ReportDefinition = {
  key: "retail-order-messages",
  title: "Messages about an order",
  area: "Buying",
  href: "/retail/buying/orders",
  profiles: ["RETAIL"],
  params: [],
  columns: orderMessages.columns,
  defaults: { sort: orderMessages.sorts[0]!.rules },
  list: orderMessages,
};

export const BUYING_REPORTS: ReportDefinition[] = [suppliersSource, contactsSource, ordersSource, orderLinesSource, orderMessagesSource];
