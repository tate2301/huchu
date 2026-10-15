import { z } from "zod";

import { BULK_CAP, bulkRoute, eachOf } from "@/lib/admin/bulk";
import { libraryItemsByIds } from "@/lib/library/bulk";
import { publishLibraryItem } from "@/lib/library/store";

const body = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_CAP),
  reach: z.discriminatedUnion("audience", [
    z.object({ audience: z.literal("EVERYONE") }),
    z.object({ audience: z.literal("VERTICALS"), verticals: z.array(z.enum(["GOLD", "SCHOOLS", "RETAIL", "CRM", "WORKSHOP", "PAYROLL", "GENERAL"])).min(1) }),
    z.object({ audience: z.literal("WORKSPACES"), companyIds: z.array(z.string().min(1).max(64)).min(1).max(BULK_CAP) }),
  ]),
});

/** Library › Publish: each item to the same audience, read live by the workspaces it reaches. */
export const POST = bulkRoute(
  "library.manage",
  (operator, { ids, reach }) => eachOf(ids, libraryItemsByIds, (item) => publishLibraryItem(operator, item.id, reach), "library item"),
  body,
);
