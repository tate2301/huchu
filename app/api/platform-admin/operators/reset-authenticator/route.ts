import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { resetAuthenticator } from "@/lib/operators/manage";

import { operatorsByIds } from "../_find";

/** Operators › Reset their authenticator. Never the owner's own; the rest go through. */
export const POST = bulkRoute("operator.manage", (owner, { ids }) =>
  eachOf(ids, operatorsByIds, (operator) => resetAuthenticator(owner, operator.id), "operator"),
);
