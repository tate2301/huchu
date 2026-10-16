import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { membersByIds, signMemberOutEverywhere } from "@/lib/admin/member-actions";

/** Members and People › Sign out everywhere. Each member on their own; refusals are named, the rest go through. */
export const POST = bulkRoute("member.manage", (operator, { ids }) =>
  eachOf(ids, membersByIds, (member) => signMemberOutEverywhere(operator, member.workspace, member.id), "member"),
);
