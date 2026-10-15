import { z } from "zod";

import { BULK_CAP, bulkRoute, eachOf } from "@/lib/admin/bulk";
import { changeOperatorRole } from "@/lib/operators/manage";

import { operatorsByIds } from "../_find";

const body = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_CAP),
  role: z.enum(["OWNER", "SUPPORT", "BILLING"]),
});

/** Operators › Change role. Never the owner's own, never the last owner; the rest go through. */
export const POST = bulkRoute(
  "operator.manage",
  (owner, { ids, role }) => eachOf(ids, operatorsByIds, (operator) => changeOperatorRole(owner, operator.id, role), "operator"),
  body,
);
