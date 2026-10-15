import { bulkRoute, eachOf, workspacesByIds } from "@/lib/admin/bulk";
import { signEveryoneOut } from "@/lib/admin/workspace-settings";

/** Workspaces › Sign everyone out. Each workspace on its own; refusals are named, the rest go through. */
export const POST = bulkRoute("workspace.signEveryoneOut", (operator, { ids, reason }) =>
  eachOf(ids, workspacesByIds, (workspace) => signEveryoneOut(operator, workspace, reason ?? ""), "workspace"),
);
