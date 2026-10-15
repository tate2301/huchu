import { readMembers } from "@/lib/admin/members";
import type { ListSpec } from "@/lib/reports/types";

import type { AdminListSource } from "./engine";
import {
  ACCESS_BULK,
  ACCESS_ROW_ACTIONS,
  MEMBER_COLUMNS,
  MEMBER_TABS,
  MEMBERS_READ,
  memberRow,
  rolesInUse,
} from "./members";

/**
 * People: everyone in every workspace, for finding a person when all you have
 * is what they told you — a name, an email, a phone. Their name opens their
 * workspace's Members, where everything else about them is done; the access
 * actions are here too, for the person found.
 */

export const PEOPLE_LIST: ListSpec = {
  noun: "people",
  read: MEMBERS_READ,
  search: { placeholder: "Name, email or phone", keys: ["name", "email", "phone", "workspaceName"] },
  tabs: MEMBER_TABS,
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
    { key: "role", label: "Role", type: "choice", any: "Any role", column: "role", optionsFromLoader: true },
  ],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "active", label: "Signed in last first", rules: [{ column: "lastSignIn", dir: "desc" }, { column: "name", dir: "asc" }] },
    { key: "newest", label: "Added last first", rules: [{ column: "added", dir: "desc" }, { column: "name", dir: "asc" }] },
  ],
  groups: ["workspaceName", "roleText", "state"],
  columns: [
    {
      key: "name",
      label: "Person",
      kind: "text",
      cell: "link",
      suffixKey: "ownerMark",
      sortable: true,
      width: "minmax(170px,1.1fr)",
      align: "start",
      priority: 1,
    },
    {
      key: "workspaceName",
      label: "Workspace",
      kind: "text",
      cell: "link",
      href: "/admin/w/{workspaceSlug}",
      sortable: true,
      width: "minmax(150px,1fr)",
      align: "start",
      priority: 1,
      impliedBy: { group: true },
    },
    ...MEMBER_COLUMNS,
  ],
  // Their workspace's Members, searched for them.
  rowHref: "/admin/w/{workspaceSlug}/members?q={name}",
  rowMenu: [
    { key: "members", label: "Open in Members", requires: MEMBERS_READ, do: { href: "/admin/w/{workspaceSlug}/members?q={name}" } },
    { key: "workspace", label: "Open the workspace", requires: MEMBERS_READ, do: { href: "/admin/w/{workspaceSlug}" } },
    ...ACCESS_ROW_ACTIONS.map((action, index) => (index === 0 ? { ...action, separated: true } : action)),
  ],
  bulk: [...ACCESS_BULK, { key: "export" }],
  card: { title: "name", badge: "state", figure: "lastSignIn", meta: ["{workspaceName} · {roleText}", "{workspaceName}"], metaMono: [] },
  empty: {
    icon: "Users",
    title: "Nobody has signed up yet",
    line: "Everyone in every workspace is listed here, with the workspace they are in.",
  },
};

export const peopleSource: AdminListSource = {
  key: "admin-people",
  title: "People",
  list: PEOPLE_LIST,
  async load() {
    return (await readMembers({})).map(memberRow);
  },
  async options() {
    return { role: await rolesInUse() };
  },
};
