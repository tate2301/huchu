import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canChangeTemplate, canSeeTemplate, canShareWith } from "@/lib/reports/template-access";
import {
  customDocumentSchema,
  type CustomReport,
  type CustomReportInput,
  type CustomReportSummary,
} from "@/lib/reports/custom/document";

/**
 * Custom reports, stored. Server-only.
 *
 * A report says who sees it the way a report template does — just its maker,
 * the managers, or everyone — and the same rules decide who may open, change
 * and share it (`lib/reports/template-access.ts`): one idea of "shared"
 * across reports and their templates. The document is checked as
 * it is read, so a row an older release wrote that no longer parses opens as
 * an empty page rather than failing — the report's title and the person's
 * access to it are never lost to a bad block.
 */

export type Reader = { companyId: string; userId: string; role: string };

/** A report shared wider than its maker may share. */
export class ShareRefused extends Error {
  constructor() {
    super("Only managers share reports with others");
    this.name = "ShareRefused";
  }
}

const SELECT = {
  id: true,
  title: true,
  description: true,
  document: true,
  audience: true,
  createdById: true,
  updatedAt: true,
} as const;

type Row = Prisma.CustomReportGetPayload<{ select: typeof SELECT }>;

/** Whose it might be: theirs, or shared at all. Who "Managers" means is checked as rows are read. */
function candidates(reader: Reader): Prisma.CustomReportWhereInput {
  return { companyId: reader.companyId, OR: [{ createdById: reader.userId }, { audience: { in: ["MANAGERS", "EVERYONE"] } }] };
}

const personOf = (reader: Reader) => ({ id: reader.userId, role: reader.role });

function canSee(row: Pick<Row, "audience" | "createdById">, reader: Reader): boolean {
  return canSeeTemplate(row, personOf(reader));
}

function canEdit(row: Pick<Row, "audience" | "createdById">, reader: Reader): boolean {
  return canChangeTemplate(row, personOf(reader));
}

/** Whether this person may let `audience` see a report. A custom report is no shop's own, so each business's managers share. */
export function canShareReport(reader: Reader, audience: CustomReportInput["audience"]): boolean {
  return canShareWith(audience, reader.role, { retail: false });
}

function toReport(row: Row, reader: Reader): CustomReport {
  const document = customDocumentSchema.safeParse(row.document);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    audience: row.audience,
    document: document.success ? document.data : { period: { from: "-90d", to: "today" }, blocks: [] },
    mine: row.createdById === reader.userId,
    editable: canEdit(row, reader),
    canShare: canShareReport(reader, "EVERYONE"),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCustomReports(reader: Reader): Promise<CustomReportSummary[]> {
  const rows = await prisma.customReport.findMany({
    where: candidates(reader),
    select: SELECT,
    orderBy: [{ title: "asc" }],
  });
  const visible = rows.filter((row) => canSee(row, reader));
  // Who made each, by name, for the catalogue's "Made by".
  const makers = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(visible.map((row) => row.createdById))] }, companyId: reader.companyId },
        select: { id: true, name: true },
      })
    ).map((user) => [user.id, user.name]),
  );
  return visible
    .map((row) => ({
      madeBy: makers.get(row.createdById) ?? null,
      id: row.id,
      title: row.title,
      description: row.description,
      audience: row.audience,
      mine: row.createdById === reader.userId,
      editable: canEdit(row, reader),
      updatedAt: row.updatedAt.toISOString(),
      areaSources: sourcesOf(row.document),
    }));
}

/** Null when there is no such report, or this person may not open it — the same answer for both. */
export async function readCustomReport(reader: Reader, id: string): Promise<CustomReport | null> {
  const row = await prisma.customReport.findFirst({ where: { id, ...candidates(reader) }, select: SELECT });
  return row && canSee(row, reader) ? toReport(row, reader) : null;
}

/** The tables a stored document's queries name, for where the report lists: the area of the first. */
function sourcesOf(stored: unknown): string[] {
  const document = customDocumentSchema.safeParse(stored);
  if (!document.success) return [];
  const names = new Set<string>();
  for (const block of document.data.blocks) {
    if (block.type !== "query") continue;
    for (const match of block.query.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)) names.add(match[1]!.toLowerCase());
  }
  return [...names];
}

/** Refused only when it is shared wider than this person may share. */
export async function createCustomReport(reader: Reader, input: CustomReportInput): Promise<CustomReport> {
  if (!canShareReport(reader, input.audience)) throw new ShareRefused();
  const row = await prisma.customReport.create({
    data: {
      companyId: reader.companyId,
      title: input.title,
      description: input.description ?? null,
      audience: input.audience,
      document: input.document as unknown as Prisma.InputJsonValue,
      createdById: reader.userId,
      updatedById: reader.userId,
    },
    select: SELECT,
  });
  return toReport(row, reader);
}

export type SaveOutcome = { report: CustomReport } | { error: "missing" | "forbidden" };

export async function updateCustomReport(reader: Reader, id: string, input: Partial<CustomReportInput>): Promise<SaveOutcome> {
  const existing = await prisma.customReport.findFirst({ where: { id, ...candidates(reader) }, select: SELECT });
  if (!existing || !canSee(existing, reader)) return { error: "missing" };
  if (!canEdit(existing, reader)) return { error: "forbidden" };
  // Sharing wider is a manager's call, as it is for a template.
  if (input.audience !== undefined && input.audience !== existing.audience && !canShareReport(reader, input.audience)) {
    return { error: "forbidden" };
  }
  const row = await prisma.customReport.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.audience !== undefined ? { audience: input.audience } : {}),
      ...(input.document !== undefined ? { document: input.document as unknown as Prisma.InputJsonValue } : {}),
      updatedById: reader.userId,
    },
    select: SELECT,
  });
  return { report: toReport(row, reader) };
}

export async function deleteCustomReport(reader: Reader, id: string): Promise<"deleted" | "missing" | "forbidden"> {
  const existing = await prisma.customReport.findFirst({ where: { id, ...candidates(reader) }, select: SELECT });
  if (!existing || !canSee(existing, reader)) return "missing";
  if (!canEdit(existing, reader)) return "forbidden";
  await prisma.customReport.delete({ where: { id } });
  return "deleted";
}
