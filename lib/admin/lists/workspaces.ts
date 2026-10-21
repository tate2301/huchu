import type { WorkspaceProduct } from "@prisma/client";

import { listWorkspaces } from "@/lib/admin/workspaces";
import { VERTICAL_ORDER, VERTICALS } from "@/lib/platform/verticals";
import type { ListGrant, ListSpec, ReportRow } from "@/lib/reports/types";
import { dayKey } from "@/lib/workspace/format";

import type { AdminListSource } from "./engine";

/**
 * Workspaces: every tenant, by standing, with what an operator acts on from
 * outside — suspend, reinstate, extend a trial, sign everyone out, close,
 * reopen, delete for good. Anything inside a workspace is done from inside it.
 */

const READ: ListGrant[] = [["admin", "workspace.export"], ["admin", "billing.manage"], ["admin", "member.signInAs"]];
const SUSPEND: ListGrant[] = [["admin", "workspace.suspend"]];
const CLOSE: ListGrant[] = [["admin", "workspace.close"]];
const SIGN_OUT: ListGrant[] = [["admin", "workspace.signEveryoneOut"]];
const BILLING: ListGrant[] = [["admin", "billing.manage"]];

const STANDING_TONES = {
  "Setting up": "info",
  Trial: "info",
  Active: "ok",
  "Past due": "warn",
  "Read-only": "bad",
  Suspended: "bad",
  Closed: "neutral",
} as const;

const tab = (key: string, label: string, standing: string) => ({
  key,
  label,
  where: [{ column: "standing", op: "is" as const, value: [standing] }],
});

export const WORKSPACES_LIST: ListSpec = {
  noun: "workspaces",
  read: READ,
  search: { placeholder: "Name, address, owner or member", keys: ["name", "slug", "owner", "ownerEmail"] },
  tabs: [
    { key: "all", label: "All", where: [{ column: "standing", op: "isNot", value: ["Closed"] }] },
    tab("trial", "Trial", "Trial"),
    tab("past-due", "Past due", "Past due"),
    tab("read-only", "Read-only", "Read-only"),
    tab("setting-up", "Setting up", "Setting up"),
    tab("suspended", "Suspended", "Suspended"),
    tab("closed", "Closed", "Closed"),
  ],
  filters: [
    {
      key: "product",
      label: "Product",
      type: "choice",
      any: "Any product",
      column: "product",
      primary: true,
      options: [
        { value: "Corelith", label: "Corelith" },
        { value: "Flare", label: "Flare" },
      ],
    },
    {
      key: "vertical",
      label: "Vertical",
      type: "choice",
      any: "Any vertical",
      primary: true,
      options: VERTICAL_ORDER.map((id) => ({
        value: id.toLowerCase(),
        label: VERTICALS[id].label,
        where: [{ column: "verticals", op: "contains" as const, value: id }],
      })),
    },
  ],
  sorts: [
    { key: "active", label: "Last used first", rules: [{ column: "lastSignIn", dir: "desc" }, { column: "name", dir: "asc" }] },
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "price", label: "Paying most first", rules: [{ column: "monthly", dir: "desc" }, { column: "name", dir: "asc" }] },
    { key: "members", label: "Most members first", rules: [{ column: "members", dir: "desc" }, { column: "name", dir: "asc" }] },
    { key: "newest", label: "Newest first", rules: [{ column: "created", dir: "desc" }] },
  ],
  groups: ["standing", "product"],
  columns: [
    { key: "name", label: "Workspace", kind: "text", cell: "link", sortable: true, width: "minmax(200px,1.4fr)", align: "start", priority: 1 },
    { key: "slug", label: "Address", kind: "code", cell: "mono", width: "150px", align: "start", priority: 3 },
    { key: "product", label: "Product", kind: "text", cell: "muted", width: "90px", align: "start", priority: 2 },
    { key: "verticalsText", label: "Verticals", kind: "text", cell: "text", width: "minmax(140px,1fr)", align: "start", priority: 2 },
    {
      key: "monthly",
      label: "A month",
      kind: "money",
      currency: "USD",
      cell: "money",
      total: "sum",
      sortable: true,
      width: "100px",
      align: "end",
      priority: 1,
    },
    { key: "members", label: "Members", kind: "number", cell: "num", total: "sum", sortable: true, width: "88px", align: "end", priority: 2 },
    {
      key: "standing",
      label: "Standing",
      kind: "status",
      cell: "state",
      tones: STANDING_TONES,
      width: "120px",
      align: "start",
      priority: 1,
      summary: { tones: ["warn", "bad"], label: "to act on" },
    },
    { key: "until", label: "Until", kind: "text", cell: "muted", width: "140px", align: "start", priority: 2 },
    { key: "owner", label: "Owner", kind: "text", cell: "text", width: "minmax(130px,1fr)", align: "start", priority: 3 },
    { key: "lastSignIn", label: "Last used", kind: "date", cell: "date", dayFormat: "relative", sortable: true, width: "110px", align: "start", priority: 2 },
    { key: "created", label: "Set up", kind: "date", cell: "date", dayFormat: "medium", sortable: true, width: "110px", align: "start", priority: 3, hidden: true },
  ],
  rowHref: "/admin/w/{slug}",
  rowMenu: [
    { key: "open", label: "Open", requires: READ, do: { href: "/admin/w/{slug}" } },
    { key: "members", label: "Members", requires: READ, do: { href: "/admin/w/{slug}/members" } },
    {
      key: "extend",
      label: "Extend the trial…",
      requires: BILLING,
      when: [{ column: "standing", op: "is", value: ["Trial", "Read-only"] }],
      do: { sheet: "extend-trial" },
    },
    {
      key: "suspend",
      label: "Suspend…",
      requires: SUSPEND,
      separated: true,
      when: [{ column: "status", op: "is", value: ["ACTIVE"] }],
      do: { run: "workspaces-suspend", endpoint: "/api/platform-admin/workspaces/suspend" },
    },
    {
      key: "reinstate",
      label: "Reinstate…",
      requires: SUSPEND,
      when: [{ column: "status", op: "is", value: ["SUSPENDED"] }],
      do: { run: "workspaces-reinstate", endpoint: "/api/platform-admin/workspaces/reinstate" },
    },
    {
      key: "close",
      label: "Close…",
      tone: "bad",
      requires: CLOSE,
      when: [{ column: "status", op: "isNot", value: ["DISABLED"] }],
      do: { run: "workspaces-close", endpoint: "/api/platform-admin/workspaces/close" },
    },
    {
      key: "reopen",
      label: "Reopen…",
      requires: CLOSE,
      when: [{ column: "status", op: "is", value: ["DISABLED"] }],
      do: { run: "workspaces-reopen", endpoint: "/api/platform-admin/workspaces/reopen" },
    },
    {
      key: "delete",
      label: "Delete for good…",
      tone: "bad",
      separated: true,
      requires: CLOSE,
      when: [{ column: "status", op: "is", value: ["DISABLED"] }],
      do: { run: "workspaces-delete", endpoint: "/api/platform-admin/workspaces/delete" },
    },
  ],
  bulk: [
    {
      key: "extend",
      label: "Extend trials",
      requires: BILLING,
      when: [{ column: "standing", op: "is", value: ["Trial", "Read-only"] }],
      do: { sheet: "extend-trial" },
    },
    {
      key: "sign-out",
      label: "Sign everyone out",
      requires: SIGN_OUT,
      when: [{ column: "status", op: "isNot", value: ["DISABLED"] }],
      do: { run: "workspaces-sign-out", endpoint: "/api/platform-admin/workspaces/sign-out" },
    },
    {
      key: "suspend",
      label: "Suspend",
      requires: SUSPEND,
      when: [{ column: "status", op: "is", value: ["ACTIVE"] }],
      do: { run: "workspaces-suspend", endpoint: "/api/platform-admin/workspaces/suspend" },
    },
    {
      key: "reinstate",
      label: "Reinstate",
      requires: SUSPEND,
      when: [{ column: "status", op: "is", value: ["SUSPENDED"] }],
      do: { run: "workspaces-reinstate", endpoint: "/api/platform-admin/workspaces/reinstate" },
    },
    {
      key: "add-vertical",
      label: "Add a vertical",
      requires: [["admin", "workspace.edit"]],
      when: [{ column: "status", op: "isNot", value: ["DISABLED"] }],
      do: { sheet: "add-vertical" },
    },
    {
      key: "remove-vertical",
      label: "Remove a vertical",
      more: true,
      requires: [["admin", "workspace.edit"]],
      when: [{ column: "status", op: "isNot", value: ["DISABLED"] }],
      do: { sheet: "remove-vertical" },
    },
    { key: "export" },
    {
      key: "close",
      label: "Close",
      tone: "bad",
      more: true,
      requires: CLOSE,
      when: [{ column: "status", op: "isNot", value: ["DISABLED"] }],
      do: { run: "workspaces-close", endpoint: "/api/platform-admin/workspaces/close" },
    },
    {
      key: "reopen",
      label: "Reopen",
      requires: CLOSE,
      tabs: ["closed"],
      do: { run: "workspaces-reopen", endpoint: "/api/platform-admin/workspaces/reopen" },
    },
    {
      key: "delete",
      label: "Delete for good",
      tone: "bad",
      requires: CLOSE,
      tabs: ["closed"],
      do: { run: "workspaces-delete", endpoint: "/api/platform-admin/workspaces/delete" },
    },
  ],
  primary: { label: "Set up workspace", icon: "plus", requires: [["admin", "workspace.setUp"]], href: "/admin/workspaces/new" },
  card: { title: "name", badge: "standing", figure: "monthly", meta: "{slug} · {members} members", metaMono: ["slug"] },
  empty: {
    icon: "Buildings",
    title: "No workspaces yet",
    line: "A workspace is set up here, or by its owner signing up.",
    primary: { label: "Set up workspace", href: "/admin/workspaces/new", requires: [["admin", "workspace.setUp"]] },
  },
};

const PRODUCT_WORD: Record<WorkspaceProduct, string> = { CORELITH: "Corelith", FLARE: "Flare", TENDER: "Tender", PABASA: "Pabasa" };

function untilWords(standing: string, until: Date | null, days: number | null): string | null {
  if (!until || days === null) return null;
  const date = until.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Harare" });
  if (standing === "Trial") return days <= 0 ? "ends today" : `${days} day${days === 1 ? "" : "s"} left`;
  if (standing === "Active") return `paid to ${date}`;
  if (standing === "Past due") return `read-only from ${date}`;
  if (standing === "Read-only") return `since ${date}`;
  return null;
}

export const workspacesSource: AdminListSource = {
  key: "admin-workspaces",
  title: "Workspaces",
  list: WORKSPACES_LIST,
  async load() {
    const { rows } = await listWorkspaces({});
    return rows.map(
      (row): ReportRow => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        product: PRODUCT_WORD[row.product],
        verticalsText: row.verticals.map((vertical) => vertical.label).join(", ") || null,
        verticals: row.verticals.map((vertical) => vertical.id).join(" "),
        // A closed workspace pays nothing, so it adds nothing to the total.
        monthly: row.status === "DISABLED" ? null : row.monthly,
        members: row.members,
        standing: row.standing.standing,
        status: row.status,
        until: untilWords(row.standing.standing, row.standing.until, row.standing.days),
        owner: row.owner?.name ?? null,
        ownerEmail: row.owner?.email ?? null,
        lastSignIn: row.lastSignInAt ? dayKey(row.lastSignInAt) : null,
        created: dayKey(row.createdAt),
      }),
    );
  },
};
