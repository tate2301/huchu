import type { LibraryKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The library from a workspace's side: the published items of a kind that
 * reach it — everyone's, its verticals', and those published to it by name.
 * Each kind's "From Corelith" reader merges these with the ones in code.
 */

export type ReachedItem = { id: string; key: string; title: string; summary: string | null; payload: Prisma.JsonValue; publishedAt: Date | null };

export async function libraryFor(companyId: string, kind: LibraryKind): Promise<ReachedItem[]> {
  const held = await prisma.companyVertical.findMany({ where: { companyId }, select: { vertical: true } });
  return prisma.libraryItem.findMany({
    where: {
      kind,
      status: "PUBLISHED",
      OR: [
        { audience: "EVERYONE" },
        ...(held.length ? [{ audience: "VERTICALS" as const, verticals: { hasSome: held.map((row) => row.vertical) } }] : []),
        { audience: "WORKSPACES", workspaces: { some: { companyId } } },
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { title: "asc" }],
    select: { id: true, key: true, title: true, summary: true, payload: true, publishedAt: true },
  });
}

/** One published item by its address, if it reaches this workspace. */
export async function libraryItemFor(companyId: string, kind: LibraryKind, key: string): Promise<ReachedItem | null> {
  const items = await libraryFor(companyId, kind);
  return items.find((item) => item.key === key) ?? null;
}
