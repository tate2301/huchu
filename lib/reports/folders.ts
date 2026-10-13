import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import type { Reader } from "@/lib/reports/custom/store";

/**
 * Report folders: Reports' panel files the workspace's reports in them
 * (ReportsAll). Server-only.
 *
 * A folder is one company's, named once in it. Anyone in the workspace can
 * make one; whoever made it and the managers rename and delete it. Deleting a
 * folder never deletes a report: its reports go back to no folder (the
 * foreign key sets `folderId` to null). Every folder id that comes from a
 * browser is checked against the reader's company before it is written.
 */

/** What a folder is called: once in its company. */
export const folderNameSchema = z.object({ name: z.string().trim().min(1, "Name the folder").max(80) });

export type ReportFolderRecord = {
  id: string;
  name: string;
  /** This person may rename and delete it. */
  canChange: boolean;
};

export type FolderOutcome<T> = { ok: T } | { error: "missing" | "forbidden" | "taken" };

const canChange = (folder: { createdById: string }, reader: Reader) =>
  folder.createdById === reader.userId || isOrgAdminRole(reader.role);

/** Whether a folder id is one of this company's: the check behind every move into a folder. */
export async function folderInCompany(companyId: string, folderId: string): Promise<boolean> {
  const found = await prisma.reportFolder.findFirst({ where: { id: folderId, companyId }, select: { id: true } });
  return Boolean(found);
}

/**
 * The company's folders, in their order then by name. How many reports each
 * holds is counted from the reports listed for this person, so a count never
 * includes a report they cannot open.
 */
export async function listReportFolders(reader: Reader): Promise<ReportFolderRecord[]> {
  const rows = await prisma.reportFolder.findMany({
    where: { companyId: reader.companyId },
    select: { id: true, name: true, createdById: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => ({ id: row.id, name: row.name, canChange: canChange(row, reader) }));
}

const isTaken = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function createReportFolder(reader: Reader, name: string): Promise<FolderOutcome<ReportFolderRecord>> {
  try {
    const last = await prisma.reportFolder.aggregate({ where: { companyId: reader.companyId }, _max: { sortOrder: true } });
    const row = await prisma.reportFolder.create({
      data: { companyId: reader.companyId, name, createdById: reader.userId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true, name: true, createdById: true },
    });
    return { ok: { id: row.id, name: row.name, canChange: true } };
  } catch (error) {
    if (isTaken(error)) return { error: "taken" };
    throw error;
  }
}

export async function renameReportFolder(reader: Reader, id: string, name: string): Promise<FolderOutcome<{ id: string; name: string }>> {
  const folder = await prisma.reportFolder.findFirst({ where: { id, companyId: reader.companyId }, select: { id: true, createdById: true } });
  if (!folder) return { error: "missing" };
  if (!canChange(folder, reader)) return { error: "forbidden" };
  try {
    const row = await prisma.reportFolder.update({ where: { id }, data: { name }, select: { id: true, name: true } });
    return { ok: row };
  } catch (error) {
    if (isTaken(error)) return { error: "taken" };
    throw error;
  }
}

/** Its reports go back to no folder; none of them is deleted. */
export async function deleteReportFolder(reader: Reader, id: string): Promise<FolderOutcome<{ id: string }>> {
  const folder = await prisma.reportFolder.findFirst({ where: { id, companyId: reader.companyId }, select: { id: true, createdById: true } });
  if (!folder) return { error: "missing" };
  if (!canChange(folder, reader)) return { error: "forbidden" };
  await prisma.$transaction([
    prisma.customReport.updateMany({ where: { folderId: id, companyId: reader.companyId }, data: { folderId: null } }),
    prisma.reportFolder.delete({ where: { id } }),
  ]);
  return { ok: { id } };
}
