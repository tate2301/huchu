import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { setFeatureActive } from "@/lib/admin/catalogue";
import { prisma } from "@/lib/prisma";

/** Catalogue › Features › Mark active. Only features made outside the code; owners only. */
export const POST = bulkRoute("operator.manage", (operator, { ids }) =>
  eachOf(
    ids,
    async (keys) => (await prisma.platformFeature.findMany({ where: { key: { in: keys } }, select: { key: true, name: true } })).map((row) => ({ id: row.key, name: row.name })),
    (feature) => setFeatureActive(operator, feature.id, true),
    "feature",
  ),
);
