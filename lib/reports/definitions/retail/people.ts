import type { ListSpec, ReportDefinition } from "@/lib/reports/types";

/**
 * Setup › Staff and PINs (80-admin 5.1, board PeopleList; W-57): everyone
 * who works in the shop, their role, sites, phone, till PIN, when they were
 * last in and their state. A row opens the person sheet; "Who can do what" is
 * the header's sub link. Rows are few, so the engine narrows, sorts and
 * groups them in memory.
 */

const VIEW: ListSpec["read"] = [["retail.people", "view"]];
const UPDATE: ListSpec["read"] = [["retail.people", "update"]];
const DELETE: ListSpec["read"] = [["retail.people", "delete"]];

const ROLE_OPTIONS = [
  ["owner", "Owner", "OWNER"],
  ["manager", "Manager", "MANAGER"],
  ["cashier", "Cashier", "CASHIER"],
  ["stock-clerk", "Stock clerk", "STOCK_CLERK"],
  ["bookkeeper", "Bookkeeper", "BOOKKEEPER"],
] as const;

const people: ListSpec = {
  noun: "people",
  read: VIEW,
  // The phone as shown, its digits and its local forms ("0283", "+263 77 551", "077 551"); the email too.
  search: { placeholder: "Name or phone", keys: ["name", "phoneSearch", "email"] },
  tabs: [
    { key: "active", label: "Active", where: [{ column: "stateKey", op: "is", value: ["ACTIVE", "PIN_LOCKED"] }] },
    { key: "invited", label: "Invited", where: [{ column: "stateKey", op: "is", value: ["INVITED", "INVITE_EXPIRED"] }] },
    { key: "no-access", label: "No access", where: [{ column: "stateKey", op: "is", value: ["NO_ACCESS"] }] },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    {
      key: "role",
      label: "Role",
      type: "choice",
      any: "Any",
      primary: true,
      options: ROLE_OPTIONS.map(([value, label, key]) => ({
        value,
        label,
        where: [{ column: "roleKey", op: "is" as const, value: [key] }],
      })),
    },
    // A person matches a site when they work at every site or at that one (the loader's options say how).
    { key: "site", label: "Site", type: "choice", any: "All sites", primary: true, optionsFromLoader: true },
  ],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "name-desc", label: "Name Z–A", rules: [{ column: "name", dir: "desc" }] },
    {
      key: "last-in",
      label: "Last in, newest",
      rules: [
        { column: "lastSeenAt", dir: "desc" },
        { column: "name", dir: "asc" },
      ],
    },
    {
      key: "role",
      label: "Role",
      rules: [
        { column: "roleOrder", dir: "asc" },
        { column: "name", dir: "asc" },
      ],
    },
  ],
  groups: ["role", "state"],
  columns: [
    { key: "name", label: "Name", kind: "text", cell: "link", width: "minmax(170px,1.2fr)", align: "start", priority: 1 },
    { key: "role", label: "Role", kind: "text", cell: "text", width: "130px", align: "start", priority: 1 },
    { key: "sites", label: "Sites", kind: "text", cell: "muted", width: "160px", align: "start", priority: 2 },
    { key: "phone", label: "Phone", kind: "text", cell: "mono", width: "150px", align: "start", priority: 2 },
    // "Set", "Locked", "Sent"; no PIN is the faint dash.
    { key: "pin", label: "Till PIN", kind: "text", cell: "text", width: "110px", align: "start", priority: 3 },
    { key: "lastIn", label: "Last in", kind: "text", cell: "text", width: "140px", align: "start", priority: 2 },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      toneKey: "stateTone",
      tones: { Active: "ok", "PIN locked": "warn", Invited: "info", "Invite expired": "warn", "No access": "neutral" },
      width: "120px",
      align: "start",
      priority: 1,
    },
  ],
  rowHref: "/retail/manage/people?sheet=person&id={id}",
  rowMenu: [
    { key: "change", label: "Change", requires: UPDATE, when: [{ column: "canEdit", op: "notEmpty" }], do: { sheet: "person" } },
    {
      key: "new-pin",
      label: "Send a new PIN",
      requires: UPDATE,
      when: [
        { column: "canEdit", op: "notEmpty" },
        { column: "pinKey", op: "isNot", value: ["NONE"] },
      ],
      do: { href: "/retail/manage/people?sheet=person&id={id}&pin=1" },
    },
    {
      key: "give-pin",
      label: "Give them a till PIN",
      requires: UPDATE,
      when: [
        { column: "canEdit", op: "notEmpty" },
        { column: "pinKey", op: "is", value: ["NONE"] },
      ],
      do: { href: "/retail/manage/people?sheet=person&id={id}&pin=1" },
    },
    {
      key: "invite-again",
      label: "Send the invite again",
      requires: UPDATE,
      when: [{ column: "canInviteAgain", op: "notEmpty" }],
      do: { run: "inviteagain", endpoint: "/api/v2/retail/people/{id}/invite-again" },
    },
    {
      key: "remove",
      label: "Remove access",
      tone: "bad",
      separated: true,
      requires: DELETE,
      when: [{ column: "canRemove", op: "notEmpty" }],
      do: { run: "removeaccess", endpoint: "/api/v2/retail/people/{id}/remove-access" },
    },
    {
      key: "give-back",
      label: "Give access back",
      requires: DELETE,
      separated: true,
      when: [{ column: "stateKey", op: "is", value: ["NO_ACCESS"] }],
      do: { sheet: "person" },
    },
  ],
  bulk: [
    { key: "pins", label: "Reset PINs", requires: UPDATE, do: { run: "resetpins", endpoint: "/api/v2/retail/people/pins" } },
    { key: "message", label: "Send a message", requires: UPDATE, do: { sheet: "people-message" } },
    {
      key: "remove",
      label: "Remove access",
      tone: "bad",
      requires: DELETE,
      do: { run: "removeaccessmany", endpoint: "/api/v2/retail/people/remove-access" },
    },
    { key: "export" },
  ],
  primary: { label: "Invite someone", icon: "plus", requires: [["retail.people", "create"]], sheet: "person-new" },
  subLink: { label: "Who can do what", sheet: "roles" },
  // Name with the state at the right; Role · Sites under it; the phone and Last in.
  card: { title: "name", badge: "state", figure: "", meta: "{role} · {sites}", meta2: "{phone} · {lastIn}" },
  empty: {
    icon: "Users",
    title: "Nobody here yet",
    line: "Invite the people who work in the shop. Each gets a WhatsApp link and, if they use a till, a PIN.",
    primary: { label: "Invite someone", sheet: "person-new", requires: [["retail.people", "create"]] },
  },
};

const peopleSource: ReportDefinition = {
  key: "retail-people",
  title: "Staff and PINs",
  area: "Setup",
  href: "/retail/manage/people",
  profiles: ["RETAIL"],
  params: [],
  columns: people.columns,
  defaults: { sort: [{ column: "name", dir: "asc" }] },
  list: people,
};

export const PEOPLE_REPORTS: ReportDefinition[] = [peopleSource];
