import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { giveMemberAccessBack, membersByIds } from "@/lib/admin/member-actions";

/** Members and People › Give access back. Each member on their own; refusals are named, the rest go through. */
export const POST = bulkRoute("member.manage", (operator, { ids }) =>
  eachOf(ids, membersByIds, (member) => giveMemberAccessBack(operator, member.workspace, member.id), "member"),
);
