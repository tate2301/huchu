import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { membersByIds, removeMemberAccess } from "@/lib/admin/member-actions";

/** Members and People › Remove access. Each member on their own; refusals are named, the rest go through. */
export const POST = bulkRoute("member.manage", (operator, { ids, reason }) =>
  eachOf(ids, membersByIds, (member) => removeMemberAccess(operator, member.workspace, member.id, reason ?? ""), "member"),
);
