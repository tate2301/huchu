import { prisma } from "../prisma";
import type { SearchIndexEntry } from "../types";

export async function searchGlobal(query: string, limit = 20): Promise<SearchIndexEntry[]> {
  const q = query.trim().toLowerCase();
  const modules: SearchIndexEntry[] = [
    {
      id: "mod:orgs",
      kind: "module",
      label: "Organizations",
      detail: "Provisioning and tenant controls",
      moduleId: "orgs",
      keywords: ["org", "tenant", "provision"],
    },
    {
      id: "mod:subscriptions",
      kind: "module",
      label: "Subscriptions",
      detail: "Billing and contract controls",
      moduleId: "subscriptions",
      keywords: ["subscription", "billing", "contract"],
    },
    {
      id: "mod:features",
      kind: "module",
      label: "Features",
      detail: "Feature flag management",
      moduleId: "features",
      keywords: ["feature", "flag"],
    },
    {
      id: "mod:admins",
      kind: "module",
      label: "Admins",
      detail: "Admin lifecycle controls",
      moduleId: "admins",
      keywords: ["admin", "user"],
    },
    {
      id: "mod:support",
      kind: "module",
      label: "Support",
      detail: "Support access and sessions",
      moduleId: "support",
      keywords: ["support", "impersonate", "shadow"],
    },
    {
      id: "mod:runbooks",
      kind: "module",
      label: "Runbooks",
      detail: "Automation and scheduling",
      moduleId: "runbooks",
      keywords: ["runbook", "automation", "schedule"],
    },
    {
      id: "mod:health",
      kind: "module",
      label: "Health",
      detail: "SLO metrics and incidents",
      moduleId: "health",
      keywords: ["health", "incident", "slo"],
    },
    {
      id: "mod:contracts",
      kind: "module",
      label: "Contracts",
      detail: "Warning and suspension enforcement",
      moduleId: "contracts",
      keywords: ["contract", "warning", "suspend"],
    },
    {
      id: "mod:audit",
      kind: "module",
      label: "Audit",
      detail: "Immutable event ledger",
      moduleId: "audit",
      keywords: ["audit", "compliance", "export"],
    },
  ];

  const [orgs, admins, incidents, runbooks] = await Promise.all([
    prisma.company.findMany({
      where: q
        ? {
            OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }],
          }
        : undefined,
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
      take: limit,
    }),
    prisma.user.findMany({
      where: q
        ? {
            OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }],
          }
        : undefined,
      select: { id: true, email: true, name: true, companyId: true, company: { select: { name: true, slug: true } } },
      orderBy: { email: "asc" },
      take: limit,
    }),
    prisma.healthIncident.findMany({
      where: q
        ? {
            OR: [{ message: { contains: q, mode: "insensitive" } }, { metricKey: { contains: q, mode: "insensitive" } }],
          }
        : undefined,
      include: { company: { select: { name: true, slug: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
    }),
    prisma.runbookDefinition.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: [{ name: "asc" }],
      take: limit,
    }),
  ]);

  const dynamic: SearchIndexEntry[] = [
    ...orgs.map((row) => ({
      id: `org:${row.id}`,
      kind: "organization" as const,
      label: row.name,
      detail: `Organization (${row.slug})`,
      moduleId: "orgs",
      companyId: row.id,
      companySlug: row.slug,
      companyName: row.name,
      keywords: [row.name, row.slug, row.id],
    })),
    ...admins.map((row) => ({
      id: `admin:${row.id}`,
      kind: "admin" as const,
      label: row.email,
      detail: `Admin ${row.name}`,
      moduleId: "admins",
      companyId: row.companyId,
      companySlug: row.company?.slug,
      companyName: row.company?.name,
      keywords: [row.email, row.name, row.id],
    })),
    ...incidents.map((row) => ({
      id: `incident:${row.id}`,
      kind: "incident" as const,
      label: row.metricKey,
      detail: row.message,
      moduleId: "health",
      companyId: row.companyId,
      companySlug: row.company.slug,
      companyName: row.company.name,
      keywords: [row.metricKey, row.message, row.id],
    })),
    ...runbooks.map((row) => ({
      id: `runbook:${row.id}`,
      kind: "runbook" as const,
      label: row.name,
      detail: `${row.actionType} (${row.enabled ? "enabled" : "disabled"})`,
      moduleId: "runbooks",
      companyId: row.companyId ?? undefined,
      keywords: [row.name, row.actionType, row.id],
    })),
  ];

  const all = [...modules, ...dynamic];
  if (!q) return all.slice(0, limit);
  return all
    .filter((entry) => {
      const haystack = `${entry.label} ${entry.detail} ${entry.keywords.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, limit);
}
