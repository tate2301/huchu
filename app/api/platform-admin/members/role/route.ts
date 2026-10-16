import { UserRole } from "@prisma/client";
import { z } from "zod";

import { BULK_CAP, bulkRoute, eachOf } from "@/lib/admin/bulk";
import { changeMemberRole, membersByIds } from "@/lib/admin/member-actions";

const body = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(BULK_CAP),
  role: z.enum(UserRole),
});

/** Members › Change role. Each member in their own workspace, where the role must be one it has; refusals are named. */
export const POST = bulkRoute(
  "member.manage",
  (operator, { ids, role }) => eachOf(ids, membersByIds, (member) => changeMemberRole(operator, member.workspace, member.id, role), "member"),
  body,
);
