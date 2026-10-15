import { z } from "zod";

import { BULK_CAP, bulkRoute, eachOf, workspacesByIds } from "@/lib/admin/bulk";
import { extendTrial } from "@/lib/admin/billing";

const body = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_CAP),
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
});

/** Workspaces › Extend trials: each trial runs on by the same number of days from where it ends. */
export const POST = bulkRoute(
  "billing.manage",
  (operator, { ids, days }) => eachOf(ids, workspacesByIds, (workspace) => extendTrial(operator, workspace, days), "workspace"),
  body,
);
