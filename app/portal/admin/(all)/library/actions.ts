"use server";

import type { LibraryKind } from "@prisma/client";

import { asResult } from "@/lib/admin/workspace-context";
import { AdminRefusal } from "@/lib/admin/refusal";
import { createLibraryItem, publishLibraryItem, updateLibraryItem, type LibraryReach } from "@/lib/library/store";
import { OperatorRefusal, requireOperatorFor } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

/** Workspaces whose name or address holds what was typed, for choosing who an item reaches. */
export async function findLibraryWorkspaces(q: string) {
  await requireOperatorFor("library.manage");
  const term = q.trim();
  return prisma.company.findMany({
    where: term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { slug: { contains: term.toLowerCase() } }] } : {},
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

/** The workspaces an item already reaches by name, to show them ticked. */
export async function libraryItemWorkspaces(id: string) {
  await requireOperatorFor("library.manage");
  const rows = await prisma.libraryItemWorkspace.findMany({
    where: { itemId: id },
    select: { company: { select: { id: true, name: true, slug: true } } },
  });
  return rows.map((row) => row.company);
}

export type SaveResult = { ok: true; id: string; key: string } | { ok: false; error: string };

/** Saves a new draft, or the changes to one; the builder's payload is checked against its kind. */
export async function saveLibraryItem(input: {
  id?: string;
  kind: LibraryKind;
  title: string;
  summary?: string | null;
  key?: string;
  payload: unknown;
}): Promise<SaveResult> {
  try {
    const operator = await requireOperatorFor("library.manage");
    const item = input.id
      ? await updateLibraryItem(operator, input.id, { title: input.title, summary: input.summary, key: input.key, payload: input.payload })
      : await createLibraryItem(operator, { kind: input.kind, title: input.title, summary: input.summary, key: input.key, payload: input.payload });
    return { ok: true, id: item.id, key: item.key };
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { ok: false, error: error.message };
    throw error;
  }
}

export async function publishOne(id: string, reach: LibraryReach) {
  return asResult(async () => {
    const operator = await requireOperatorFor("library.manage");
    await publishLibraryItem(operator, id, reach);
    return "Published. Workspaces it reaches see it now.";
  });
}
