import { siteRules, workspaceSites } from "@/lib/admin/sites";
import { prisma } from "@/lib/prisma";
import type { ListGrant, ListSpec, ReportRow } from "@/lib/reports/types";
import { dayKey } from "@/lib/workspace/format";

import type { AdminListSource } from "./engine";

/**
 * A workspace's Sites: its shops, mines, campuses, open and closed. Added,
 * changed, closed and reopened here on the workspace's own rules
 * (`lib/admin/sites.ts`); everything else about a site is done inside.
 */

const READ: ListGrant[] = [["admin", "workspace.export"], ["admin", "billing.manage"], ["admin", "member.signInAs"]];
const EDIT: ListGrant[] = [["admin", "workspace.edit"]];

const OPEN = [{ column: "status", op: "is" as const, value: ["OPEN"] }];
const CLOSED = [{ column: "status", op: "is" as const, value: ["CLOSED"] }];

export const SITES_LIST: ListSpec = {
  noun: "sites",
  read: READ,
  search: { placeholder: "Name, code or location", keys: ["name", "code", "location"] },
  tabs: [
    { key: "open", label: "Open", where: OPEN, empty: "No open site. Add one, or reopen one from Closed." },
    { key: "closed", label: "Closed", where: CLOSED, empty: "No site has been closed." },
    { key: "all", label: "All", where: [] },
  ],
  filters: [{ key: "w", type: "parent", column: "w" }],
  sorts: [
    { key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] },
    { key: "code", label: "Code", rules: [{ column: "code", dir: "asc" }] },
    { key: "newest", label: "Newest first", rules: [{ column: "created", dir: "desc" }, { column: "name", dir: "asc" }] },
  ],
  groups: ["state"],
  columns: [
    { key: "name", label: "Site", kind: "text", cell: "text", strong: true, sortable: true, width: "minmax(180px,1.4fr)", align: "start", priority: 1 },
    { key: "code", label: "Code", kind: "code", cell: "mono", sortable: true, width: "110px", align: "start", priority: 1 },
    { key: "location", label: "Location", kind: "text", cell: "muted", width: "minmax(160px,1.2fr)", align: "start", priority: 2 },
    { key: "unit", label: "Measured in", kind: "text", cell: "text", width: "120px", align: "start", priority: 3, hidden: true },
    { key: "tills", label: "Tills", kind: "number", cell: "num", width: "72px", align: "end", priority: 3, hidden: true },
    {
      key: "state",
      label: "State",
      kind: "status",
      cell: "state",
      tones: { Default: "info", Open: "ok", Closed: "neutral" },
      width: "110px",
      align: "start",
      priority: 1,
    },
    { key: "created", label: "Added", kind: "date", cell: "date", dayFormat: "medium", sortable: true, width: "120px", align: "start", priority: 2 },
  ],
  rowHref: "",
  rowMenu: [
    {
      key: "edit",
      label: "Edit…",
      requires: EDIT,
      when: [{ column: "editable", op: "is", value: ["yes"] }],
      do: { sheet: "site-edit" },
    },
    {
      key: "close",
      label: "Close site…",
      tone: "bad",
      separated: true,
      requires: EDIT,
      when: OPEN,
      do: { run: "sites-close", endpoint: "/api/platform-admin/sites/close" },
    },
    {
      key: "reopen",
      label: "Reopen…",
      requires: EDIT,
      when: CLOSED,
      do: { run: "sites-reopen", endpoint: "/api/platform-admin/sites/reopen" },
    },
  ],
  bulk: [
    { key: "reopen", label: "Reopen", requires: EDIT, when: CLOSED, do: { run: "sites-reopen", endpoint: "/api/platform-admin/sites/reopen" } },
    { key: "export" },
    {
      key: "close",
      label: "Close",
      tone: "bad",
      more: true,
      requires: EDIT,
      when: OPEN,
      do: { run: "sites-close", endpoint: "/api/platform-admin/sites/close" },
    },
  ],
  primary: { label: "Add site", icon: "plus", requires: EDIT, sheet: "site-add" },
  card: { title: "name", badge: "state", figure: "code", meta: ["{location}", "No location given"], metaMono: [] },
  empty: {
    icon: "MapPin",
    title: "No sites yet",
    line: "A site is a shop, a mine or a campus: where the workspace's work happens.",
    primary: { label: "Add site", sheet: "site-add", requires: EDIT },
  },
};

export const sitesSource: AdminListSource = {
  key: "admin-sites",
  title: "Sites",
  list: SITES_LIST,
  async load(filters) {
    const slug = filters.w;
    if (!slug) return [];
    const workspace = await prisma.company.findUnique({ where: { slug }, select: { id: true, slug: true, workspaceProfile: true } });
    if (!workspace) return [];
    const rules = siteRules(workspace.workspaceProfile);
    const sites = await workspaceSites(workspace);
    return sites.map(
      (site): ReportRow => ({
        id: site.id,
        w: workspace.slug,
        name: site.name,
        code: site.code,
        location: site.location,
        unit: site.unit,
        tills: rules.retail ? site.tills : null,
        state: !site.isActive ? "Closed" : site.isDefault ? "Default" : "Open",
        status: site.isActive ? "OPEN" : "CLOSED",
        // A shop keeps a closed site's details as they were.
        editable: site.isActive || !rules.retail ? "yes" : "no",
        created: dayKey(site.createdAt),
      }),
    );
  },
};
