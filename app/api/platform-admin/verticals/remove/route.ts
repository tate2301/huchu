import { z } from "zod";

import { BULK_CAP, bulkRoute, eachOf, workspacesByIds } from "@/lib/admin/bulk";
import { isVertical, removeVertical } from "@/lib/admin/verticals";

const body = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_CAP),
  vertical: z.string().refine(isVertical),
  reason: z.string().max(300).optional(),
});

/** Workspaces › Remove a vertical: refused where it is a workspace's only one, or one it does not have. */
export const POST = bulkRoute(
  "workspace.edit",
  (operator, { ids, vertical, reason }) =>
    eachOf(ids, workspacesByIds, (workspace) => removeVertical(operator, workspace, vertical as Parameters<typeof removeVertical>[2], reason), "workspace"),
  body,
);
