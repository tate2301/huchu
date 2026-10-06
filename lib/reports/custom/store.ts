import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import {
  customDocumentSchema,
  type CustomReport,
  type CustomReportInput,
  type CustomReportSummary,
} from "@/lib/reports/custom/document";

/**
 * Custom reports, stored. Server-only.
 *
 * A report is its maker's until they share it; a shared one is everybody's to
 * open, and its maker's or a manager's to change. The document is checked as
 * it is read, so a row an older release wrote that no longer parses opens as
 * an empty page rather than failing — the report's title and the person's
 * access to it are never lost to a bad block.
 */

export type Reader = { companyId: string; userId: string; role: string };

const SELECT = {
  id: true,
  title: true,
  description: true,
  document: true,
  shared: true,
  createdById: true,
  updatedAt: true,
} as const;

type Row = Prisma.CustomReportGetPayload<{ select: typeof SELECT }>;

function visibleTo(reader: Reader): Prisma.CustomReportWhereInput {
  return { companyId: reader.companyId, OR: [{ shared: true }, { createdById: reader.userId }] };
}

function canEdit(row: Pick<Row, "shared" | "createdById">, reader: Reader): boolean {
  return row.createdById === reader.userId || (row.shared && isOrgAdminRole(reader.role));
}

function toReport(row: Row, reader: Reader): CustomReport {
  const document = customDocumentSchema.safeParse(row.document);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    shared: row.shared,
    document: document.success ? document.data : { period: { from: "-90d", to: "today" }, blocks: [] },
    mine: row.createdById === reader.userId,
    editable: canEdit(row, reader),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCustomReports(reader: Reader): Promise<CustomReportSummary[]> {
  const rows = await prisma.customReport.findMany({
    where: visibleTo(reader),
    select: SELECT,
    orderBy: [{ title: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    shared: row.shared,
    mine: row.createdById === reader.userId,
    editable: canEdit(row, reader),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Null when there is no such report, or this person may not open it — the same answer for both. */
export async function readCustomReport(reader: Reader, id: string): Promise<CustomReport | null> {
  const row = await prisma.customReport.findFirst({ where: { id, ...visibleTo(reader) }, select: SELECT });
  return row ? toReport(row, reader) : null;
}

export async function createCustomReport(reader: Reader, input: CustomReportInput): Promise<CustomReport> {
  const row = await prisma.customReport.create({
    data: {
      companyId: reader.companyId,
      title: input.title,
      description: input.description ?? null,
      shared: input.shared,
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
  const existing = await prisma.customReport.findFirst({ where: { id, ...visibleTo(reader) }, select: SELECT });
  if (!existing) return { error: "missing" };
  if (!canEdit(existing, reader)) return { error: "forbidden" };
  // Only its maker decides who else sees it.
  if (input.shared !== undefined && input.shared !== existing.shared && existing.createdById !== reader.userId) {
    return { error: "forbidden" };
  }
  const row = await prisma.customReport.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.shared !== undefined ? { shared: input.shared } : {}),
      ...(input.document !== undefined ? { document: input.document as unknown as Prisma.InputJsonValue } : {}),
      updatedById: reader.userId,
    },
    select: SELECT,
  });
  return { report: toReport(row, reader) };
}

export async function deleteCustomReport(reader: Reader, id: string): Promise<"deleted" | "missing" | "forbidden"> {
  const existing = await prisma.customReport.findFirst({ where: { id, ...visibleTo(reader) }, select: SELECT });
  if (!existing) return "missing";
  if (!canEdit(existing, reader)) return "forbidden";
  await prisma.customReport.delete({ where: { id } });
  return "deleted";
}
