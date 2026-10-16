import { bulkRoute, eachOf, workspacesByIds } from "@/lib/admin/bulk";
import { deleteWorkspaceForGood } from "@/lib/admin/workspace-settings";

/** Workspaces › Delete for good. Each workspace on its own; refusals are named, the rest go through. */
export const POST = bulkRoute("workspace.close", (operator, { ids, reason }) =>
  eachOf(ids, workspacesByIds, (workspace) => deleteWorkspaceForGood(operator, workspace, reason ?? ""), "workspace"),
);
