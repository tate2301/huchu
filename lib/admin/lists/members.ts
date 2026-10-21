import { readMembers, roleLabel, type MemberRow, type MemberWorkspace } from "@/lib/admin/members";
import { getProduct } from "@/lib/platform/products";
import { prisma } from "@/lib/prisma";
import type { Condition, ListAction, ListColumn, ListGrant, ListSpec, ReportRow } from "@/lib/reports/types";
import { dayKey } from "@/lib/workspace/format";

import type { AdminListSource } from "./engine";

/**
 * A workspace's members, inside that workspace (`?w=` is its slug, passed by
 * the page as the list's parent): who has access and in what state, and what
 * an operator does to them from outside the product — sign in as, edit,
 * change a role, sign out, remove access, give it back, delete.
 */

export const MEMBERS_READ: ListGrant[] = [["admin", "member.manage"], ["admin", "member.signInAs"]];
export const MEMBERS_MANAGE: ListGrant[] = [["admin", "member.manage"]];
const SIGN_IN_AS: ListGrant[] = [["admin", "member.signInAs"]];

export const MEMBER_TONES = {
  Active: "ok",
  Invited: "info",
  "Never signed in": "neutral",
  "Till PIN locked": "warn",
  "Access removed": "hollow",
} as const;

export const WITH_ACCESS: Condition[] = [{ column: "state", op: "isNot", value: ["Access removed"] }];
export const WITHOUT_ACCESS: Condition[] = [{ column: "state", op: "is", value: ["Access removed"] }];

const tab = (key: string, label: string, state: keyof typeof MEMBER_TONES) => ({
  key,
  label,
  where: [{ column: "state", op: "is" as const, value: [state] }],
});

export const MEMBER_TABS: NonNullable<ListSpec["tabs"]> = [
  { key: "all", label: "All with access", where: WITH_ACCESS },
  tab("invited", "Invited", "Invited"),
  tab("never", "Never signed in", "Never signed in"),
  tab("locked", "Till PIN locked", "Till PIN locked"),
  tab("removed", "Access removed", "Access removed"),
];

/** The columns Members and People share, after each list's own first column. */
export const MEMBER_COLUMNS: ListColumn[] = [
  { key: "email", label: "Email", kind: "email", cell: "text", width: "minmax(180px,1.2fr)", align: "start", priority: 1 },
  { key: "phone", label: "Phone", kind: "phone", cell: "mono", width: "140px", align: "start", priority: 3 },
  { key: "roleText", label: "Role", kind: "text", cell: "text", width: "140px", align: "start", priority: 2 },
  {
    key: "state",
    label: "State",
    kind: "status",
    cell: "state",
    tones: MEMBER_TONES,
    width: "136px",
    align: "start",
    priority: 1,
    summary: { tones: ["warn"], label: "PIN locked" },
  },
  { key: "lastSignIn", label: "Last sign-in", kind: "date", cell: "date", dayFormat: "relative", sortable: true, width: "116px", align: "start", priority: 2 },
  { key: "added", label: "Added", kind: "date", cell: "date", dayFormat: "medium", sortable: true, width: "116px", align: "start", priority: 3 },
];

/** Sign out, remove, give back: done the same way from Members and from People. */
export const ACCESS_ROW_ACTIONS: ListAction[] = [
  {
    key: "sign-out",
    label: "Sign out everywhere…",
    requires: MEMBERS_MANAGE,
    when: WITH_ACCESS,
    do: { run: "members-sign-out", endpoint: "/api/platform-admin/members/sign-out" },
  },
  {
    key: "remove",
    label: "Remove access…",
    tone: "bad",
    separated: true,
    requires: MEMBERS_MANAGE,
    when: WITH_ACCESS,
    do: { run: "members-remove", endpoint: "/api/platform-admin/members/remove" },
  },
  {
    key: "give-back",
    label: "Give access back…",
    requires: MEMBERS_MANAGE,
    when: WITHOUT_ACCESS,
    do: { run: "members-give-back", endpoint: "/api/platform-admin/members/give-back" },
  },
];

export const ACCESS_BULK: ListAction[] = [
  {
    key: "sign-out",
    label: "Sign out everywhere",
    requires: MEMBERS_MANAGE,
    when: WITH_ACCESS,
    do: { run: "members-sign-out", endpoint: "/api/platform-admin/members/sign-out" },
  },
  {
    key: "remove",
    label: "Remove access",
    tone: "bad",
    requires: MEMBERS_MANAGE,
    when: WITH_ACCESS,
    do: { run: "members-remove", endpoint: "/api/platform-admin/members/remove" },
  },
  {
    key: "give-back",
    label: "Give access back",
    requires: MEMBERS_MANAGE,
    when: WITHOUT_ACCESS,
    do: { run: "members-give-back", endpoint: "/api/platform-admin/members/give-back" },
  },
];

export const MEMBERS_LIST: ListSpec = {
  noun: "members",
  read: MEMBERS_READ,
  search: { placeholder: "Name, email or phone", keys: ["name", "email", "phone"] },
  tabs: MEMBER_TABS,
  filters: [
    { key: "w", type: "parent", column: "workspaceSlug" },
    { key: "role", label: "Role", type: "choice", any: "Any role", column: "role", optionsFromLoader: true, primary: true },
  ],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "active", label: "Signed in last first", rules: [{ column: "lastSignIn", dir: "desc" }, { column: "name", dir: "asc" }] },
    { key: "newest", label: "Added last first", rules: [{ column: "added", dir: "desc" }, { column: "name", dir: "asc" }] },
  ],
  groups: ["roleText", "state"],
  columns: [
    {
      key: "name",
      label: "Member",
      kind: "text",
      cell: "link",
      suffixKey: "ownerMark",
      sortable: true,
      width: "minmax(180px,1.2fr)",
      align: "start",
      priority: 1,
    },
    ...MEMBER_COLUMNS,
  ],
  // The name opens the member to edit: the portal has no page of its own for one person.
  rowHref: "/admin/w/{workspaceSlug}/members?sheet=edit-member&id={id}",
  rowMenu: [
    {
      key: "sign-in-as",
      label: "Sign in as…",
      requires: SIGN_IN_AS,
      when: [{ column: "state", op: "isNot", value: ["Access removed", "Invited"] }],
      do: { sheet: "sign-in-as" },
    },
    { key: "edit", label: "Edit…", requires: MEMBERS_MANAGE, separated: true, do: { sheet: "edit-member" } },
    { key: "role", label: "Change role…", requires: MEMBERS_MANAGE, when: WITH_ACCESS, do: { sheet: "change-role" } },
    ...ACCESS_ROW_ACTIONS,
    {
      key: "delete",
      label: "Delete…",
      tone: "bad",
      requires: MEMBERS_MANAGE,
      do: { run: "members-delete", endpoint: "/api/platform-admin/members/delete" },
    },
  ],
  bulk: [
    { key: "role", label: "Change role", requires: MEMBERS_MANAGE, when: WITH_ACCESS, do: { sheet: "change-role" } },
    ...ACCESS_BULK,
    { key: "export" },
    {
      key: "delete",
      label: "Delete",
      tone: "bad",
      more: true,
      requires: MEMBERS_MANAGE,
      do: { run: "members-delete", endpoint: "/api/platform-admin/members/delete" },
    },
  ],
  primary: { label: "Add members", icon: "plus", requires: MEMBERS_MANAGE, sheet: "add-members" },
  card: { title: "name", badge: "state", figure: "lastSignIn", meta: ["{roleText} · {email}", "{roleText}"], metaMono: [] },
  empty: {
    icon: "Users",
    title: "Nobody is in this workspace yet",
    line: "Members are added here, or by the owner from inside the workspace.",
    primary: { label: "Add members", sheet: "add-members", requires: MEMBERS_MANAGE },
  },
};

/** A member as a row of Members or People. */
export function memberRow(member: MemberRow & { workspace: MemberWorkspace }): ReportRow {
  return {
    id: member.id,
    name: member.name,
    ownerMark: member.isOwner ? " · owner" : null,
    email: member.email,
    phone: member.phone,
    role: member.role,
    roleText: member.roleLabel,
    state: member.state,
    lastSignIn: member.lastSignInAt ? dayKey(member.lastSignInAt) : null,
    added: dayKey(member.addedAt),
    workspaceSlug: member.workspace.slug,
    workspaceName: member.workspace.name,
    product: getProduct(member.workspace.product).name,
  };
}

/** The roles anyone holds, for the Role filter. */
export async function rolesInUse() {
  const rows = await prisma.user.groupBy({ by: ["role"] });
  return rows
    .map((row) => ({ value: row.role, label: roleLabel(row.role) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const membersSource: AdminListSource = {
  key: "admin-members",
  title: "Members",
  list: MEMBERS_LIST,
  async load(filters) {
    const slug = filters.w;
    if (!slug) return [];
    const workspace = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
    if (!workspace) return [];
    return (await readMembers({ companyId: workspace.id })).map(memberRow);
  },
  async options() {
    return { role: await rolesInUse() };
  },
};
