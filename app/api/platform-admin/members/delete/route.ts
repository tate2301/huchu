import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { deleteMember, membersByIds } from "@/lib/admin/member-actions";

/** Members › Delete. Only members no record points at; the rest are named, with their access to remove instead. */
export const POST = bulkRoute("member.manage", (operator, { ids, reason }) =>
  eachOf(ids, membersByIds, (member) => deleteMember(operator, member.workspace, member.id, reason ?? ""), "member"),
);
