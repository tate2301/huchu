import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { reportLayoutSchema, type ReportLayout } from "@/lib/reports/layout";
import type { ReportView } from "@/lib/reports/types";
import { reportViewSchema } from "@/lib/reports/view";

/**
 * How a workspace has set up its reports. Server-only.
 *
 * A report nobody has touched has no row and behaves as its definition says.
 * What is stored is checked as it is read: a layout saved by an older release,
 * or edited by hand, that no longer parses is treated as not saved at all, so
 * a bad row costs a workspace its customisation, never its report.
 */

export type ReportSettingRecord = {
  id: string;
  reportKey: string;
  enabled: boolean;
  layout: ReportLayout | null;
  view: ReportView | null;
  updatedAt: Date | null;
};

function fromRow(row: {
  id: string;
  reportKey: string;
  enabled: boolean;
  layout: Prisma.JsonValue | null;
  view: Prisma.JsonValue | null;
  updatedAt: Date;
}): ReportSettingRecord {
  const layout = row.layout === null ? null : reportLayoutSchema.safeParse(row.layout);
  const view = row.view === null ? null : reportViewSchema.safeParse(row.view);
  return {
    id: row.id,
    reportKey: row.reportKey,
    enabled: row.enabled,
    layout: layout?.success ? layout.data : null,
    view: view?.success ? view.data : null,
    updatedAt: row.updatedAt,
  };
}

const SELECT = { id: true, reportKey: true, enabled: true, layout: true, view: true, updatedAt: true } as const;

export async function readReportSettings(companyId: string): Promise<Map<string, ReportSettingRecord>> {
  const rows = await prisma.reportSetting.findMany({ where: { companyId }, select: SELECT });
  return new Map(rows.map((row) => [row.reportKey, fromRow(row)]));
}

export async function readReportSetting(companyId: string, reportKey: string): Promise<ReportSettingRecord | null> {
  const row = await prisma.reportSetting.findUnique({
    where: { companyId_reportKey: { companyId, reportKey } },
    select: SELECT,
  });
  return row ? fromRow(row) : null;
}

/** The keys this workspace has switched off. */
export async function disabledReportKeys(companyId: string): Promise<Set<string>> {
  const rows = await prisma.reportSetting.findMany({
    where: { companyId, enabled: false },
    select: { reportKey: true },
  });
  return new Set(rows.map((row) => row.reportKey));
}

export type ReportSettingPatch = {
  enabled?: boolean;
  /** Null goes back to the report's own layout. */
  layout?: ReportLayout | null;
  /** Null goes back to the report's own view. */
  view?: ReportView | null;
};

export async function saveReportSetting(
  companyId: string,
  reportKey: string,
  patch: ReportSettingPatch,
  userId: string,
): Promise<ReportSettingRecord> {
  // SQL NULL, not the JSON value null: "not saved" rather than "saved as nothing".
  const json = (value: ReportLayout | ReportView | null) =>
    value === null ? Prisma.DbNull : (value as unknown as Prisma.InputJsonValue);
  const data = {
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.layout !== undefined ? { layout: json(patch.layout) } : {}),
    ...(patch.view !== undefined ? { view: json(patch.view) } : {}),
    updatedById: userId,
  };
  const row = await prisma.reportSetting.upsert({
    where: { companyId_reportKey: { companyId, reportKey } },
    create: { companyId, reportKey, ...data },
    update: data,
    select: SELECT,
  });
  return fromRow(row);
}
