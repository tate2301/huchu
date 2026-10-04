import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { canReadReport } from "@/lib/reports/access";
import { getReportDefinition } from "@/lib/reports/registry";
import { reportMeta } from "@/lib/reports/catalog";
import { disabledReportKeys, readReportSetting } from "@/lib/reports/settings";
import {
  canChangeTemplate,
  canSeeTemplate,
  canShareWith,
  paramsToKeep,
  TEMPLATE_AUDIENCES,
  type ReportTemplateRecord,
} from "@/lib/reports/template-access";
import type { ReportDefinition } from "@/lib/reports/types";
import { defaultView, fitView, reportViewSchema } from "@/lib/reports/view";

/**
 * Report templates, as a workspace keeps them. Server-only.
 *
 * Every read goes through the same three checks: the person may see the
 * template, may read the report it is built on, and the workspace has not
 * switched that report off. A template that fails any of them is not there,
 * the same answer as one that does not exist. A stored view that no longer
 * parses is not listed either: a bad row costs the template, never the report.
 */

export const templateParamsSchema = z.record(z.string().max(64), z.string().max(200));

const fields = {
  name: z.string().trim().min(1, "Give it a name").max(120),
  description: z.string().trim().max(240).nullable().optional(),
  audience: z.enum(TEMPLATE_AUDIENCES).default("JUST_ME"),
};

/**
 * A new template: saved from a report on screen (its view, and the params it
 * was showing), or started from nothing (no view, so the report's own).
 */
export const templateInputSchema = z.object({
  reportKey: z.string().min(1).max(64),
  ...fields,
  view: reportViewSchema.optional(),
  /** The params on screen; which of them are kept is `paramsToKeep`'s answer. */
  params: templateParamsSchema.default({}),
  keepDates: z.boolean().default(false),
});

export const templatePatchSchema = z
  .object({ ...fields, audience: fields.audience.unwrap(), view: reportViewSchema })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to change" });

const SELECT = {
  id: true,
  reportKey: true,
  name: true,
  description: true,
  view: true,
  params: true,
  audience: true,
  createdById: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
} as const;

type Row = Prisma.ReportTemplateGetPayload<{ select: typeof SELECT }>;

function person(session: AuthenticatedSession) {
  return { id: session.user.id, role: session.user.role };
}

function readable(session: AuthenticatedSession, key: string): ReportDefinition | null {
  const definition = getReportDefinition(key);
  if (!definition) return null;
  const access = { role: session.user.role, enabledFeatures: session.user.enabledFeatures };
  return canReadReport(definition, access) ? definition : null;
}

function toRecord(row: Row, definition: ReportDefinition, session: AuthenticatedSession): ReportTemplateRecord | null {
  const view = reportViewSchema.safeParse(row.view);
  const params = templateParamsSchema.safeParse(row.params);
  if (!view.success || !params.success) return null;
  return {
    id: row.id,
    reportKey: row.reportKey,
    reportTitle: definition.title,
    area: definition.area,
    name: row.name,
    description: row.description,
    view: view.data,
    params: params.data,
    audience: row.audience,
    madeBy: row.createdBy.name,
    mine: row.createdById === session.user.id,
    canChange: canChangeTemplate(row, person(session)),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every template this person may open, newest change first. */
export async function listTemplates(session: AuthenticatedSession): Promise<ReportTemplateRecord[]> {
  const companyId = session.user.companyId;
  const [rows, disabled] = await Promise.all([
    prisma.reportTemplate.findMany({
      where: {
        companyId,
        OR: [{ createdById: session.user.id }, { audience: { in: ["MANAGERS", "EVERYONE"] } }],
      },
      select: SELECT,
      orderBy: { updatedAt: "desc" },
    }),
    disabledReportKeys(companyId),
  ]);
  const records: ReportTemplateRecord[] = [];
  for (const row of rows) {
    if (disabled.has(row.reportKey) || !canSeeTemplate(row, person(session))) continue;
    const definition = readable(session, row.reportKey);
    const record = definition ? toRecord(row, definition, session) : null;
    if (record) records.push(record);
  }
  return records;
}

/** One template, or null when this person may not open it. */
export async function readTemplate(session: AuthenticatedSession, id: string): Promise<ReportTemplateRecord | null> {
  const row = await prisma.reportTemplate.findFirst({ where: { id, companyId: session.user.companyId }, select: SELECT });
  if (!row || !canSeeTemplate(row, person(session))) return null;
  const definition = readable(session, row.reportKey);
  if (!definition || (await disabledReportKeys(session.user.companyId)).has(row.reportKey)) return null;
  return toRecord(row, definition, session);
}

export type TemplateChange =
  | { ok: true; template: ReportTemplateRecord }
  | { ok: false; status: 403 | 404 };

export async function createTemplate(
  session: AuthenticatedSession,
  input: z.infer<typeof templateInputSchema>,
): Promise<TemplateChange> {
  const definition = readable(session, input.reportKey);
  if (!definition) return { ok: false, status: 404 };
  if (!canShareWith(input.audience, session.user.role)) return { ok: false, status: 403 };
  // Started from nothing, it opens the way everyone opens the report today.
  const view = input.view
    ? fitView(input.view, definition.columns)
    : defaultView(reportMeta(definition, session.user.role, definition.params, await readReportSetting(session.user.companyId, definition.key)));
  const row = await prisma.reportTemplate.create({
    data: {
      companyId: session.user.companyId,
      reportKey: input.reportKey,
      name: input.name,
      description: input.description || null,
      view: view as unknown as Prisma.InputJsonValue,
      params: paramsToKeep(definition.params, input.params, input.keepDates),
      audience: input.audience,
      createdById: session.user.id,
    },
    select: SELECT,
  });
  const template = toRecord(row, definition, session);
  return template ? { ok: true, template } : { ok: false, status: 404 };
}

/** Fields left out stay as they are. */
export async function updateTemplate(
  session: AuthenticatedSession,
  id: string,
  patch: z.infer<typeof templatePatchSchema>,
): Promise<TemplateChange> {
  const current = await readTemplate(session, id);
  if (!current) return { ok: false, status: 404 };
  if (!current.canChange) return { ok: false, status: 403 };
  if (patch.audience !== undefined && !canShareWith(patch.audience, session.user.role)) return { ok: false, status: 403 };
  const row = await prisma.reportTemplate.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description || null } : {}),
      ...(patch.view !== undefined
        ? { view: fitView(patch.view, getReportDefinition(current.reportKey)!.columns) as unknown as Prisma.InputJsonValue }
        : {}),
      ...(patch.audience !== undefined ? { audience: patch.audience } : {}),
    },
    select: SELECT,
  });
  const definition = readable(session, row.reportKey)!;
  const template = toRecord(row, definition, session);
  return template ? { ok: true, template } : { ok: false, status: 404 };
}

export async function deleteTemplate(session: AuthenticatedSession, id: string): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  const current = await readTemplate(session, id);
  if (!current) return { ok: false, status: 404 };
  if (!current.canChange) return { ok: false, status: 403 };
  await prisma.reportTemplate.delete({ where: { id } });
  return { ok: true };
}
