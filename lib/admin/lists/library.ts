import { VERTICALS } from "@/lib/platform/verticals";
import { KIND_SLUG, LIBRARY_KIND_ORDER, LIBRARY_KINDS } from "@/lib/library/kinds";
import { prisma } from "@/lib/prisma";
import type { ListGrant, ListSpec, ReportRow } from "@/lib/reports/types";
import { dayKey } from "@/lib/workspace/format";

import type { AdminListSource } from "./engine";

/**
 * Corelith's library: everything made here once and published to workspaces —
 * reports, Explore questions, insights, forms, templates, printed layouts.
 */

const READ: ListGrant[] = [["admin", "library.manage"], ["admin", "workspace.export"]];
const MANAGE: ListGrant[] = [["admin", "library.manage"]];

const STATUS_WORD = { DRAFT: "Draft", PUBLISHED: "Published", RETIRED: "Retired" } as const;

export const LIBRARY_LIST: ListSpec = {
  noun: "items",
  read: READ,
  search: { placeholder: "Title, address or summary", keys: ["title", "key", "summary"] },
  tabs: [
    { key: "all", label: "In use", where: [{ column: "status", op: "isNot", value: ["Retired"] }] },
    { key: "drafts", label: "Drafts", where: [{ column: "status", op: "is", value: ["Draft"] }] },
    { key: "published", label: "Published", where: [{ column: "status", op: "is", value: ["Published"] }] },
    { key: "retired", label: "Retired", where: [{ column: "status", op: "is", value: ["Retired"] }] },
  ],
  filters: [
    {
      key: "kind",
      label: "Kind",
      type: "choice",
      any: "Any kind",
      column: "kind",
      primary: true,
      options: LIBRARY_KIND_ORDER.map((kind) => ({ value: LIBRARY_KINDS[kind].label, label: LIBRARY_KINDS[kind].plural })),
    },
  ],
  sorts: [
    { key: "changed", label: "Changed most recently", rules: [{ column: "changed", dir: "desc" }, { column: "title", dir: "asc" }] },
    { key: "title", label: "Title A–Z", rules: [{ column: "title", dir: "asc" }] },
    { key: "published", label: "Published most recently", rules: [{ column: "published", dir: "desc" }] },
  ],
  groups: ["kind", "status"],
  columns: [
    { key: "title", label: "Item", kind: "text", cell: "link", sortable: true, width: "minmax(220px,1.6fr)", align: "start", priority: 1, suffixKey: "summaryShort" },
    { key: "kind", label: "Kind", kind: "text", cell: "muted", width: "140px", align: "start", priority: 1 },
    {
      key: "status",
      label: "Standing",
      kind: "status",
      cell: "state",
      tones: { Draft: "hollow", Published: "ok", Retired: "neutral" },
      width: "110px",
      align: "start",
      priority: 1,
    },
    { key: "reach", label: "Reaches", kind: "text", cell: "text", width: "minmax(140px,1fr)", align: "start", priority: 2 },
    { key: "key", label: "Address", kind: "code", cell: "mono", width: "170px", align: "start", priority: 3 },
    { key: "maker", label: "Made by", kind: "text", cell: "muted", width: "130px", align: "start", priority: 3 },
    { key: "changed", label: "Changed", kind: "date", cell: "date", dayFormat: "relative", sortable: true, width: "110px", align: "start", priority: 2 },
    { key: "published", label: "Published", kind: "date", cell: "date", dayFormat: "medium", sortable: true, width: "120px", align: "start", priority: 3, hidden: true },
  ],
  rowHref: "/admin/library/{kindSlug}/{id}",
  rowMenu: [
    { key: "open", label: "Open", requires: READ, do: { href: "/admin/library/{kindSlug}/{id}" } },
    {
      key: "publish",
      label: "Publish…",
      requires: MANAGE,
      when: [{ column: "status", op: "isNot", value: ["Retired"] }],
      do: { sheet: "library-publish" },
    },
    { key: "duplicate", label: "Make a copy", requires: MANAGE, do: { run: "library-duplicate", endpoint: "/api/platform-admin/library/duplicate" } },
    {
      key: "unpublish",
      label: "Back to draft",
      requires: MANAGE,
      when: [{ column: "status", op: "is", value: ["Published", "Retired"] }],
      do: { run: "library-unpublish", endpoint: "/api/platform-admin/library/unpublish" },
    },
    {
      key: "retire",
      label: "Retire…",
      requires: MANAGE,
      separated: true,
      when: [{ column: "status", op: "isNot", value: ["Retired"] }],
      do: { run: "library-retire", endpoint: "/api/platform-admin/library/retire" },
    },
    {
      key: "delete",
      label: "Delete…",
      tone: "bad",
      requires: MANAGE,
      when: [{ column: "status", op: "is", value: ["Draft", "Retired"] }],
      do: { run: "library-delete", endpoint: "/api/platform-admin/library/delete" },
    },
  ],
  bulk: [
    {
      key: "publish",
      label: "Publish",
      requires: MANAGE,
      when: [{ column: "status", op: "isNot", value: ["Retired"] }],
      do: { sheet: "library-publish" },
    },
    { key: "duplicate", label: "Make copies", requires: MANAGE, more: true, do: { run: "library-duplicate", endpoint: "/api/platform-admin/library/duplicate" } },
    {
      key: "unpublish",
      label: "Back to draft",
      requires: MANAGE,
      when: [{ column: "status", op: "is", value: ["Published", "Retired"] }],
      do: { run: "library-unpublish", endpoint: "/api/platform-admin/library/unpublish" },
    },
    {
      key: "retire",
      label: "Retire",
      requires: MANAGE,
      when: [{ column: "status", op: "isNot", value: ["Retired"] }],
      do: { run: "library-retire", endpoint: "/api/platform-admin/library/retire" },
    },
    { key: "export" },
    {
      key: "delete",
      label: "Delete",
      tone: "bad",
      more: true,
      requires: MANAGE,
      when: [{ column: "status", op: "is", value: ["Draft", "Retired"] }],
      do: { run: "library-delete", endpoint: "/api/platform-admin/library/delete" },
    },
  ],
  card: { title: "title", badge: "status", figure: "kind", meta: "{reach}" },
  empty: {
    icon: "Stack",
    title: "Nothing in the library yet",
    line: "Make a report, a question, a form or a template once, and publish it to every workspace or the ones you choose.",
  },
};

function reachWords(item: { status: string; audience: string; verticals: string[]; _count: { workspaces: number } }) {
  if (item.status !== "PUBLISHED") return null;
  if (item.audience === "EVERYONE") return "Every workspace";
  if (item.audience === "VERTICALS") return item.verticals.map((id) => VERTICALS[id as keyof typeof VERTICALS]?.label ?? id).join(", ");
  const n = item._count.workspaces;
  return `${n} ${n === 1 ? "workspace" : "workspaces"}`;
}

export const librarySource: AdminListSource = {
  key: "admin-library",
  title: "Library",
  list: LIBRARY_LIST,
  async load() {
    const items = await prisma.libraryItem.findMany({
      select: {
        id: true,
        kind: true,
        key: true,
        title: true,
        summary: true,
        status: true,
        audience: true,
        verticals: true,
        publishedAt: true,
        updatedAt: true,
        createdBy: { select: { name: true } },
        _count: { select: { workspaces: true } },
      },
    });
    return items.map(
      (item): ReportRow => ({
        id: item.id,
        name: item.title,
        title: item.title,
        summary: item.summary,
        summaryShort: item.summary ? ` · ${item.summary.slice(0, 80)}` : null,
        kind: LIBRARY_KINDS[item.kind].label,
        kindSlug: KIND_SLUG[item.kind],
        status: STATUS_WORD[item.status],
        reach: reachWords(item),
        key: item.key,
        maker: item.createdBy.name,
        changed: dayKey(item.updatedAt),
        published: item.publishedAt ? dayKey(item.publishedAt) : null,
      }),
    );
  },
};
