import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { removeOperator } from "@/lib/operators/manage";

import { operatorsByIds } from "../_find";

/** Operators › Remove. Never the owner's own, never the last owner; the rest go through. */
export const POST = bulkRoute("operator.manage", (owner, { ids, reason }) =>
  eachOf(ids, operatorsByIds, (operator) => removeOperator(owner, operator.id, new Date(), reason), "operator"),
);
