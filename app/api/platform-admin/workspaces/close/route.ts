import { bulkRoute, eachOf, workspacesByIds } from "@/lib/admin/bulk";
import { closeWorkspace } from "@/lib/admin/workspace-settings";

/** Workspaces › Close. Each workspace on its own; refusals are named, the rest go through. */
export const POST = bulkRoute("workspace.close", (operator, { ids, reason }) =>
  eachOf(ids, workspacesByIds, (workspace) => closeWorkspace(operator, workspace, reason ?? ""), "workspace"),
);
