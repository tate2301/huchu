import { prisma } from "@/lib/prisma";

/** The library items a bulk action names, as the writes take them. */
export async function libraryItemsByIds(ids: string[]) {
  const items = await prisma.libraryItem.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, status: true } });
  return items.map((item) => ({ ...item, name: item.title }));
}
