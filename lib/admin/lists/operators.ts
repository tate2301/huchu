import { listOperators } from "@/lib/operators/manage";
import type { ListGrant, ListSpec, ReportRow } from "@/lib/reports/types";
import { dayKey } from "@/lib/workspace/format";

import type { AdminListSource } from "./engine";

/**
 * Operators: the portal's own people, kept by its owners. A new one is invited
 * by email, and the link is shown once to send another way; a forgotten
 * password is a new invite, a lost phone an authenticator reset.
 */

const MANAGE: ListGrant[] = [["admin", "operator.manage"]];

const CURRENT = [{ column: "state", op: "isNot" as const, value: ["Removed"] }];

export const OPERATORS_LIST: ListSpec = {
  noun: "operators",
  read: MANAGE,
  refusal: "Only owners keep the portal's operators.",
  search: { placeholder: "Name or email", keys: ["name", "email"] },
  tabs: [
    { key: "current", label: "Current", where: CURRENT },
    { key: "removed", label: "Removed", where: [{ column: "state", op: "is", value: ["Removed"] }], empty: "Nobody has been removed." },
  ],
  filters: [
    {
      key: "role",
      label: "Role",
      type: "choice",
      any: "Any role",
      column: "role",
      primary: true,
      options: [
        { value: "Owner", label: "Owner" },
        { value: "Support", label: "Support" },
        { value: "Billing", label: "Billing" },
      ],
    },
  ],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "last", label: "Signed in lately", rules: [{ column: "lastSignIn", dir: "desc" }, { column: "name", dir: "asc" }] },
    { key: "newest", label: "Newest first", rules: [{ column: "created", dir: "desc" }] },
  ],
  groups: ["role", "state"],
  columns: [
    { key: "name", label: "Operator", kind: "text", cell: "text", strong: true, sortable: true, width: "minmax(160px,1fr)", align: "start", priority: 1 },
    { key: "email", label: "Email", kind: "email", cell: "muted", width: "minmax(180px,1.2fr)", align: "start", priority: 2 },
    { key: "role", label: "Role", kind: "text", cell: "text", width: "100px", align: "start", priority: 1 },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      tones: { Active: "ok", Invited: "info", "Needs a second factor": "warn", Locked: "warn", Removed: "neutral" },
      width: "170px",
      align: "start",
      priority: 1,
      summary: { tones: ["warn"], label: "to look at" },
    },
    { key: "authenticator", label: "Authenticator since", kind: "date", cell: "date", dayFormat: "medium", width: "150px", align: "start", priority: 3 },
    { key: "lastSignIn", label: "Last sign-in", kind: "date", cell: "date", dayFormat: "relative", sortable: true, width: "120px", align: "start", priority: 2 },
    { key: "created", label: "Invited", kind: "date", cell: "date", dayFormat: "medium", sortable: true, width: "120px", align: "start", priority: 3, hidden: true },
  ],
  rowHref: "",
  rowMenu: [
    { key: "role", label: "Change role…", requires: MANAGE, when: CURRENT, do: { sheet: "operator-role" } },
    { key: "invite", label: "Send a new invite…", requires: MANAGE, when: CURRENT, do: { sheet: "operator-new-invite" } },
    {
      key: "reset",
      label: "Reset their authenticator…",
      requires: MANAGE,
      when: CURRENT,
      do: { run: "operators-reset-authenticator", endpoint: "/api/platform-admin/operators/reset-authenticator" },
    },
    {
      key: "remove",
      label: "Remove…",
      tone: "bad",
      separated: true,
      requires: MANAGE,
      when: CURRENT,
      do: { run: "operators-remove", endpoint: "/api/platform-admin/operators/remove" },
    },
  ],
  bulk: [
    { key: "role", label: "Change role", requires: MANAGE, when: CURRENT, do: { sheet: "operator-role" } },
    { key: "export" },
    {
      key: "remove",
      label: "Remove",
      tone: "bad",
      more: true,
      requires: MANAGE,
      when: CURRENT,
      do: { run: "operators-remove", endpoint: "/api/platform-admin/operators/remove" },
    },
  ],
  primary: { label: "Invite an operator", icon: "plus", requires: MANAGE, sheet: "operator-invite" },
  card: { title: "name", badge: "state", figure: "role", meta: "{email}", metaMono: [] },
  empty: {
    icon: "Badge",
    title: "No operators yet",
    line: "An operator is someone at Corelith who works this portal: support, billing, or an owner.",
    primary: { label: "Invite an operator", sheet: "operator-invite", requires: MANAGE },
  },
};

export const operatorsSource: AdminListSource = {
  key: "admin-operators",
  title: "Operators",
  list: OPERATORS_LIST,
  async load() {
    const operators = await listOperators();
    return operators.map(
      (operator): ReportRow => ({
        id: operator.id,
        name: operator.name,
        email: operator.email,
        role: operator.roleLabel,
        roleKey: operator.role,
        state: operator.state,
        authenticator: operator.totpConfirmedAt ? dayKey(operator.totpConfirmedAt) : null,
        lastSignIn: operator.lastSignInAt ? dayKey(operator.lastSignInAt) : null,
        created: dayKey(operator.createdAt),
      }),
    );
  },
};
