import { prisma } from "@/lib/prisma";
import { ensureSiteVisitQuestionSets } from "@/lib/crm/site-visits/question-sets";
import { listCustomReports } from "@/lib/reports/custom/store";

import { blockItem, enquiryItem, layoutItem, reportItem, sortBuildItems, visitItem, type BuildItem } from "./items";
import { buildProvisions, layoutProvisioned, layoutUser, type BuildProvisions } from "./provision";

/**
 * Build's rows, read for one person in one workspace. Server-only. Each kind is
 * read only where the workspace is provisioned for it, so a school without the
 * CRM lists no site-visit forms and a shop without payroll no payslip.
 */

export type BuildViewer = { companyId: string; userId: string; role: string; enabledFeatures: string[] | undefined };

export async function readBuildItems(viewer: BuildViewer): Promise<{ items: BuildItem[]; provisions: BuildProvisions }> {
  const provisions = buildProvisions(viewer.enabledFeatures);
  const { companyId } = viewer;

  const [visits, enquiries, blocks, layouts, reports] = await Promise.all([
    provisions.visitForms
      ? (async () => {
          // Seeded on first read, as the visit page and the forms' own API do.
          await prisma.$transaction((tx) => ensureSiteVisitQuestionSets(tx, companyId));
          return prisma.crmQuestionSet.findMany({
            where: { companyId, archivedAt: null },
            select: { id: true, name: true, kind: true, isActive: true, updatedAt: true },
          });
        })()
      : [],
    provisions.enquiryForms
      ? prisma.crmIntakeForm.findMany({ where: { companyId }, select: { id: true, name: true, isActive: true, updatedAt: true } })
      : [],
    provisions.blocks
      ? prisma.crmTemplate.findMany({
          where: { companyId },
          select: { id: true, name: true, kind: true, isShared: true, isActive: true, updatedAt: true },
        })
      : [],
    provisions.layouts
      ? prisma.documentTemplate.findMany({
          where: { companyId, scope: "COMPANY" },
          select: {
            id: true,
            name: true,
            sourceKey: true,
            documentType: true,
            isDefault: true,
            isActive: true,
            updatedAt: true,
            versions: { select: { version: true, isPublished: true } },
          },
        })
      : [],
    listCustomReports({ companyId, userId: viewer.userId, role: viewer.role }),
  ]);

  const items: BuildItem[] = [
    ...visits.map(visitItem),
    ...enquiries.map(enquiryItem),
    ...blocks.map(blockItem),
    ...layouts
      .filter((row) => layoutProvisioned(row.sourceKey, viewer.enabledFeatures))
      .map((row) => layoutItem(row, layoutUser(row.sourceKey))),
    ...reports.map((report) => reportItem({ id: report.id, title: report.title, audience: report.audience, updatedAt: report.updatedAt })),
  ];
  return { items: sortBuildItems(items), provisions };
}

/** What an id in a Build address is, in this workspace: which table holds it. */
export type BuildRecord =
  | { source: "visit"; id: string }
  | { source: "enquiry"; id: string }
  | { source: "block"; id: string; kind: string }
  | { source: "layout"; id: string; sourceKey: string }
  | { source: "catalog"; id: string; sourceKey: string }
  | { source: "report"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null when nothing in this workspace has that id. */
export async function findBuildRecord(companyId: string, id: string): Promise<BuildRecord | null> {
  if (!UUID.test(id)) {
    const { DEFAULT_TEMPLATE_CATALOG } = await import("@/lib/documents/default-template-catalog");
    const entry = DEFAULT_TEMPLATE_CATALOG.find((candidate) => candidate.key === id);
    return entry ? { source: "catalog", id: entry.key, sourceKey: entry.sourceKey } : null;
  }
  const [visit, enquiry, block, layout, report] = await Promise.all([
    prisma.crmQuestionSet.findFirst({ where: { id, companyId, archivedAt: null }, select: { id: true } }),
    prisma.crmIntakeForm.findFirst({ where: { id, companyId }, select: { id: true } }),
    prisma.crmTemplate.findFirst({ where: { id, companyId }, select: { id: true, kind: true } }),
    prisma.documentTemplate.findFirst({
      where: { id, OR: [{ companyId }, { scope: "SYSTEM", companyId: null }] },
      select: { id: true, sourceKey: true },
    }),
    prisma.customReport.findFirst({ where: { id, companyId }, select: { id: true } }),
  ]);
  if (visit) return { source: "visit", id };
  if (enquiry) return { source: "enquiry", id };
  if (block) return { source: "block", id, kind: block.kind };
  if (layout) return { source: "layout", id, sourceKey: layout.sourceKey };
  if (report) return { source: "report", id };
  return null;
}

/** Whether the workspace is provisioned for what the record is. */
export function recordProvisioned(record: BuildRecord, enabledFeatures: string[] | undefined): boolean {
  const provisions = buildProvisions(enabledFeatures);
  switch (record.source) {
    case "visit":
      return provisions.visitForms;
    case "enquiry":
      return provisions.enquiryForms;
    case "block":
      return provisions.blocks;
    case "layout":
    case "catalog":
      return layoutProvisioned(record.sourceKey, enabledFeatures);
    case "report":
      return provisions.reports;
  }
}
