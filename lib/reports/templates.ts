import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { canReadReport } from "@/lib/reports/access";
import { areaOf, type ReportAreaInfo } from "@/lib/reports/areas";
import { RETAIL_BUILT_INS, type TemplateQuery } from "@/lib/reports/definitions/retail/templates";
import { canReadList, periodRange } from "@/lib/reports/list-query";
import { getReportDefinition } from "@/lib/reports/registry";
import { reportMeta } from "@/lib/reports/catalog";
import { disabledReportKeys, readReportSetting } from "@/lib/reports/settings";
import {
  canChangeTemplate,
  canSaveTemplates,
  canSeeTemplate,
  canShareWith,
  paramsToKeep,
  TEMPLATE_AUDIENCES,
  type ReportTemplateRecord,
  type TemplateAudience,
} from "@/lib/reports/template-access";
import { toTemplateQuery } from "@/lib/reports/template-query";
import { AUDIENCE_SEES_WORDS, reportPeriodWords } from "@/lib/reports/template-words";
import type { ListGrant, ReportDefinition, ReportFace } from "@/lib/reports/types";
import { defaultView, fitView, reportViewSchema } from "@/lib/reports/view";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace/format";

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
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  uses: { select: { opens: true, lastOpenedAt: true } },
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
    area: definition.report?.area ?? definition.area,
    name: row.name,
    description: row.description,
    view: view.data,
    params: params.data,
    audience: row.audience,
    madeBy: row.createdBy.name,
    madeById: row.createdById,
    mine: row.createdById === session.user.id,
    canChange: canChangeTemplate(row, person(session)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    opens: row.uses[0]?.opens ?? 0,
    lastOpenedAt: row.uses[0]?.lastOpenedAt.toISOString() ?? null,
    email: null,
  };
}

/**
 * Every template this person may open in the generic catalogue, newest change
 * first. Templates on a source with a report face are Reports' (retail) and
 * list only at `/retail/reports`.
 */
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
    if (!definition || definition.report) continue;
    const record = toRecord(row, definition, session);
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

/* ──────────────────────────────────────────────────────────────────────────
   Reports (retail): every template a person may open, built in or saved
   ────────────────────────────────────────────────────────────────────────── */

/** Who is looking: the catalogue, the panel's badges and a run all ask the same question. */
export type TemplateViewer = { companyId: string; userId: string; role: string };

/** One template as Reports lists it (70-insights-reports 5.10). */
export type RetailTemplateEntry = {
  /** The built-in's slug, or the saved template's id: `/retail/reports/{ref}`. */
  ref: string;
  /** How its uses are kept: `builtin:<slug>`, or the saved template's id. */
  useRef: string;
  builtIn: boolean;
  name: string;
  description: string | null;
  /** What it shows: the built-in's summary, the template's description, or "On {its source's built-in}". */
  summary: string;
  area: ReportAreaInfo;
  source: string;
  audience: TemplateAudience;
  madeBy: string | null;
  madeById: string | null;
  createdAt: Date | null;
  canChange: boolean;
  opens: number;
  lastOpenedAt: Date | null;
  query: TemplateQuery;
};

/** The template's ref for its `ReportTemplateUse` row. */
export function templateUseRef(ref: string, builtIn: boolean): string {
  return builtIn ? `builtin:${ref}` : ref;
}

/**
 * The source's report face, when this role reads it and the workspace has not
 * switched it off. A template on any other source is not listed: a template
 * never widens what a person may read.
 */
function readableFace(key: string, role: string, disabled: ReadonlySet<string>): (ReportDefinition & { report: ReportFace }) | null {
  const definition = getReportDefinition(key);
  if (!definition?.report || disabled.has(key)) return null;
  return canReadList(definition.report, { can: ([resource, action]: ListGrant) => canRetailRoleDo(role, resource, action) }) ? (definition as ReportDefinition & { report: ReportFace }) : null;
}

/**
 * Every Reports template this person may open: the built-ins whose audience
 * includes them, then the saved templates on report sources that are theirs
 * or shared with them, each only while they read its source. The caller
 * checks `retail.reports:view` (C-35). Built-ins first, in their order; saved
 * ones by name.
 */
export async function retailTemplates(viewer: TemplateViewer): Promise<RetailTemplateEntry[]> {
  const person = { id: viewer.userId, role: viewer.role };
  const [disabled, saved, uses] = await Promise.all([
    disabledReportKeys(viewer.companyId),
    prisma.reportTemplate.findMany({
      where: {
        companyId: viewer.companyId,
        OR: [{ createdById: viewer.userId }, { audience: { in: ["MANAGERS", "EVERYONE"] } }],
      },
      select: SELECT,
      orderBy: { name: "asc" },
    }),
    prisma.reportTemplateUse.findMany({
      where: { companyId: viewer.companyId, templateRef: { startsWith: "builtin:" } },
      select: { templateRef: true, opens: true, lastOpenedAt: true },
    }),
  ]);
  const builtInUse = new Map(uses.map((use) => [use.templateRef, use]));
  const builtInName = new Map<string, string>();
  for (const template of RETAIL_BUILT_INS) if (!builtInName.has(template.source)) builtInName.set(template.source, template.name);

  const entries: RetailTemplateEntry[] = [];
  for (const template of RETAIL_BUILT_INS) {
    const area = areaOf(template.area);
    if (!area || !canSeeTemplate({ audience: template.audience, createdById: null }, person)) continue;
    if (!readableFace(template.source, viewer.role, disabled)) continue;
    const use = builtInUse.get(templateUseRef(template.slug, true));
    entries.push({
      ref: template.slug,
      useRef: templateUseRef(template.slug, true),
      builtIn: true,
      name: template.name,
      description: null,
      summary: template.summary,
      area,
      source: template.source,
      audience: template.audience,
      madeBy: null,
      madeById: null,
      createdAt: null,
      canChange: false,
      opens: use?.opens ?? 0,
      lastOpenedAt: use?.lastOpenedAt ?? null,
      query: template.query,
    });
  }
  for (const row of saved) {
    if (!canSeeTemplate(row, person)) continue;
    const definition = readableFace(row.reportKey, viewer.role, disabled);
    const area = definition ? areaOf(definition.report.area) : null;
    const view = reportViewSchema.safeParse(row.view);
    const params = templateParamsSchema.safeParse(row.params);
    if (!definition || !area || !view.success || !params.success) continue;
    entries.push({
      ref: row.id,
      useRef: row.id,
      builtIn: false,
      name: row.name,
      description: row.description,
      summary: row.description || `On ${builtInName.get(row.reportKey) ?? definition.title}`,
      area,
      source: row.reportKey,
      audience: row.audience,
      madeBy: row.createdBy.name,
      madeById: row.createdById,
      createdAt: row.createdAt,
      canChange: canChangeTemplate(row, person),
      opens: row.uses[0]?.opens ?? 0,
      lastOpenedAt: row.uses[0]?.lastOpenedAt ?? null,
      query: toTemplateQuery(view.data, params.data),
    });
  }
  return entries;
}

/** One Reports template by its ref, or null when it is not this person's to open. */
export async function retailTemplate(viewer: TemplateViewer, ref: string): Promise<RetailTemplateEntry | null> {
  if (!ref || ref.length > 100) return null;
  return (await retailTemplates(viewer)).find((entry) => entry.ref === ref) ?? null;
}

/** What a run page starts from (70-insights-reports 4.4). Sends join with INS-09. */
export type RunContext = {
  ref: string;
  builtIn: boolean;
  name: string;
  description: string | null;
  area: { slug: string; label: string };
  source: string;
  audience: TemplateAudience;
  sub: string;
  canChange: boolean;
  canSave: boolean;
  madeBy: string | null;
  createdAt: string | null;
  opens: number;
  query: TemplateQuery;
  email: ReportTemplateRecord["email"];
  mySend: null;
};

function viewerOf(session: AuthenticatedSession): TemplateViewer {
  return { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
}

/**
 * A built-in's sub: "Built in · 1 to 3 October 2026, every shop" — the period
 * its query starts on, and the shop when its source has a shop filter.
 */
async function builtInSub(entry: RetailTemplateEntry, companyId: string, now: Date): Promise<string> {
  const face = getReportDefinition(entry.source)?.report;
  const parts: string[] = [];
  const period = face?.filters.find((filter) => filter.type === "period");
  if (period && period.type === "period") {
    const value = entry.query.filters[period.key] ?? period.default ?? "any";
    parts.push(reportPeriodWords(periodRange(value, now, DEFAULT_TIME_ZONE)));
  }
  if (face?.filters.some((filter) => filter.key === "site")) {
    const siteId = entry.query.filters.site;
    const site =
      siteId && siteId !== "any"
        ? await prisma.site.findFirst({ where: { id: siteId, companyId }, select: { name: true } })
        : null;
    parts.push(site ? site.name : "every shop");
  }
  return parts.length ? `Built in · ${parts.join(", ")}` : "Built in";
}

/** `GET /api/v2/retail/reports/[ref]`: the template's starting point, or null (404 "Template not found"). */
export async function readRunContext(session: AuthenticatedSession, ref: string, now = new Date()): Promise<RunContext | null> {
  const entry = await retailTemplate(viewerOf(session), ref);
  if (!entry) return null;
  const sub = entry.builtIn
    ? await builtInSub(entry, session.user.companyId, now)
    : `${entry.madeBy}\u2019s template · ${AUDIENCE_SEES_WORDS[entry.audience]}`;
  return {
    ref: entry.ref,
    builtIn: entry.builtIn,
    name: entry.name,
    description: entry.description,
    area: { slug: entry.area.slug, label: entry.area.label },
    source: entry.source,
    audience: entry.audience,
    sub,
    canChange: entry.canChange,
    canSave: canSaveTemplates(session.user.role),
    madeBy: entry.madeBy,
    createdAt: entry.createdAt?.toISOString() ?? null,
    opens: entry.opens,
    query: entry.query,
    email: null,
    mySend: null,
  };
}

/**
 * `POST /api/v2/retail/reports/[ref]/opened`: one more open, now, by this
 * person — per company, not per person. False when the template is not theirs
 * to open (404).
 */
export async function markOpened(session: AuthenticatedSession, ref: string, now = new Date()): Promise<boolean> {
  const entry = await retailTemplate(viewerOf(session), ref);
  if (!entry) return false;
  const companyId = session.user.companyId;
  await prisma.reportTemplateUse.upsert({
    where: { companyId_templateRef: { companyId, templateRef: entry.useRef } },
    create: {
      companyId,
      templateRef: entry.useRef,
      templateId: entry.builtIn ? null : entry.ref,
      opens: 1,
      lastOpenedAt: now,
      lastOpenedById: session.user.id,
    },
    update: { opens: { increment: 1 }, lastOpenedAt: now, lastOpenedById: session.user.id },
  });
  return true;
}
