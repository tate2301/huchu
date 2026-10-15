import { readEventType } from "@/lib/admin/activity";
import { AUDIT_TABS, auditEventTypes, auditTopics, readAuditLog, type AuditQuery } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";
import { periodInstants } from "@/lib/reports/list-query";
import type { ListFilter, ListGrant, ListOption, ListSpec, ReportRow } from "@/lib/reports/types";
import { DEFAULT_TIME_ZONE, dayKey, formatTime } from "@/lib/workspace/format";

import type { AdminListSource } from "./engine";

/**
 * The audit log as a list, for every workspace or one: when, who, what, why.
 * The tabs are the questions people ask of it; the period, the event and the
 * operator narrow what is read from the database as well as what is shown, so
 * a long log is searched where it is kept, not cut short first.
 */

const READ: ListGrant[] = [["admin", "workspace.export"], ["admin", "billing.manage"], ["admin", "member.signInAs"]];

/** Rows that are no workspace's: the portal's own chain. */
const PORTAL = "portal";

const BY_TONES = { "Corelith staff": "info", Member: "neutral", Corelith: "hollow" } as const;

function auditList(everyWorkspace: boolean): ListSpec {
  const filters: ListFilter[] = [
    // Everyone's log is read a month at a time unless asked; one workspace's, all of it.
    { key: "when", label: "When", type: "period", any: "Any time", column: "when", primary: true, default: everyWorkspace ? "30d" : "any" },
    { key: "event", label: "Event", type: "choice", any: "Any event", column: "eventType", primary: true, optionsFromLoader: true },
    // No column: the loader reads only that operator's lines.
    { key: "operator", label: "Operator", type: "choice", any: "Anyone", optionsFromLoader: true },
    ...(everyWorkspace
      ? [{ key: "workspace", label: "Workspace", type: "choice" as const, any: "Every workspace", column: "workspaceSlug", optionsFromLoader: true }]
      : [{ key: "w", type: "parent" as const, column: "w" }]),
  ];
  return {
    noun: "audit lines",
    read: READ,
    search: { placeholder: "Who, what, why or workspace", keys: ["who", "did", "reason", "workspace", "eventType"] },
    tabs: [
      { key: "everything", label: "Everything", where: [] },
      ...(Object.keys(AUDIT_TABS) as Array<keyof typeof AUDIT_TABS>).map((key) => ({
        key,
        label: AUDIT_TABS[key].label,
        where: [{ column: "topics", op: "contains" as const, value: key }],
      })),
    ],
    filters,
    sorts: [
      { key: "newest", label: "Newest first", rules: [{ column: "when", dir: "desc" }] },
      { key: "oldest", label: "Oldest first", rules: [{ column: "when", dir: "asc" }] },
    ],
    groups: everyWorkspace ? ["by", "workspace"] : ["by"],
    columns: [
      { key: "when", label: "When", kind: "date", cell: "date", timeKey: "time", dayFormat: "relative", sortable: true, width: "150px", align: "start", priority: 1 },
      { key: "who", label: "Who", kind: "text", cell: "text", strong: true, width: "minmax(140px,1fr)", align: "start", priority: 1 },
      { key: "by", label: "As", kind: "status", cell: "dot", tones: BY_TONES, width: "130px", align: "start", priority: 3 },
      { key: "did", label: "What", kind: "text", cell: "text", width: "minmax(220px,2fr)", align: "start", priority: 1 },
      { key: "reason", label: "Why", kind: "text", cell: "muted", width: "minmax(160px,1.2fr)", align: "start", priority: 2 },
      ...(everyWorkspace
        ? [
            {
              key: "workspace",
              label: "Workspace",
              kind: "text" as const,
              cell: "link" as const,
              href: "/admin/w/{workspaceSlug}/audit",
              width: "minmax(140px,1fr)",
              align: "start" as const,
              priority: 2 as const,
            },
          ]
        : []),
      { key: "eventType", label: "Event", kind: "code", cell: "mono", width: "200px", align: "start", priority: 3, hidden: true },
      { key: "chain", label: "Chain", kind: "code", cell: "mono", width: "100px", align: "start", priority: 3, hidden: true },
    ],
    rowHref: "",
    rowMenu: everyWorkspace
      ? [{ key: "workspace", label: "Open its audit log", requires: READ, when: [{ column: "workspaceSlug", op: "notEmpty" }], do: { href: "/admin/w/{workspaceSlug}/audit" } }]
      : [],
    bulk: [{ key: "export" }],
    card: { title: "did", badge: "by", figure: "time", meta: everyWorkspace ? "{who} · {workspace}" : "{who}", meta2: "{reason}", metaMono: [] },
    empty: {
      icon: "Scroll",
      title: "Nothing recorded here yet",
      line: everyWorkspace ? "Everything done in a workspace or in this portal is recorded here, newest first." : "What its members and Corelith staff do here is recorded, newest first.",
    },
  };
}

async function options(everyWorkspace: boolean): Promise<Record<string, ListOption[]>> {
  const [types, operators, companies] = await Promise.all([
    auditEventTypes(),
    prisma.operator.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    everyWorkspace ? prisma.company.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }) : [],
  ]);
  return {
    event: types.map((type) => ({ value: type, label: readEventType(type) })),
    operator: operators.map((operator) => ({ value: operator.id, label: operator.name })),
    ...(everyWorkspace
      ? {
          workspace: [
            { value: PORTAL, label: "This portal", where: [{ column: "workspaceSlug", op: "empty" as const }] },
            ...companies.map((company) => ({ value: company.slug, label: company.name })),
          ],
        }
      : {}),
  };
}

/** The filters the database can answer, as a query: the rest are applied to what it returns. */
async function queryOf(filters: Record<string, string>, everyWorkspace: boolean): Promise<AuditQuery | null> {
  const query: AuditQuery = {};
  const place = everyWorkspace ? filters.workspace : filters.w;
  if (place && place !== "any") {
    if (place === PORTAL && everyWorkspace) query.companyId = null;
    else {
      const company = await prisma.company.findUnique({ where: { slug: place }, select: { id: true } });
      if (!company) return null;
      query.companyId = company.id;
    }
  } else if (!everyWorkspace) {
    return null;
  }
  if (filters.when && filters.when !== "any") query.createdAt = periodInstants(filters.when, new Date(), DEFAULT_TIME_ZONE);
  if (filters.event && filters.event !== "any") query.eventType = filters.event;
  if (filters.operator && filters.operator !== "any") query.operatorId = filters.operator;
  return query;
}

function source(key: string, everyWorkspace: boolean): AdminListSource {
  return {
    key,
    title: "Audit log",
    list: auditList(everyWorkspace),
    options: () => options(everyWorkspace),
    async load(filters) {
      const query = await queryOf(filters, everyWorkspace);
      if (!query) return [];
      const items = await readAuditLog(query);
      return items.map(
        (item): ReportRow => ({
          id: item.id,
          name: `${item.actor.name} ${item.did}`,
          when: dayKey(item.at),
          time: formatTime(item.at),
          who: item.actor.name,
          by: item.actor.kind === "operator" ? "Corelith staff" : item.actor.kind === "member" ? "Member" : "Corelith",
          did: item.did,
          reason: item.reason,
          eventType: item.eventType,
          workspace: item.workspace?.name ?? "This portal",
          workspaceSlug: item.workspace?.slug ?? null,
          w: item.workspace?.slug ?? null,
          topics: auditTopics(item),
          chain: item.hash.slice(0, 8),
        }),
      );
    },
  };
}

/** Every workspace's lines and the portal's own. */
export const auditSource = source("admin-audit", true);

/** One workspace's chain, by its `w` parent filter. */
export const workspaceAuditSource = source("admin-workspace-audit", false);
