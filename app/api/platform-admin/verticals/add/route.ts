import { z } from "zod";

import { BULK_CAP, bulkRoute, eachOf } from "@/lib/admin/bulk";
import { addVertical, isVertical } from "@/lib/admin/verticals";
import { prisma } from "@/lib/prisma";

const body = z.object({
  /** Workspaces by id, or by address from inside one workspace. */
  ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_CAP),
  vertical: z.string().refine(isVertical),
});

/** Workspaces › Add a vertical: each workspace gets it and its features, and is repriced. */
export const POST = bulkRoute(
  "workspace.edit",
  (operator, { ids, vertical }) =>
    eachOf(
      ids,
      async (keys) => {
        const rows = await prisma.company.findMany({ where: { OR: [{ id: { in: keys } }, { slug: { in: keys } }] }, select: { id: true, name: true, slug: true } });
        // Answered under the id asked for, so a refusal names the right one.
        return keys.flatMap((key) => rows.filter((row) => row.id === key || row.slug === key).map((row) => ({ ...row, id: key, companyId: row.id })));
      },
      (workspace) => addVertical(operator, { id: workspace.companyId, name: workspace.name }, vertical as Parameters<typeof addVertical>[2]),
      "workspace",
    ),
  body,
);
