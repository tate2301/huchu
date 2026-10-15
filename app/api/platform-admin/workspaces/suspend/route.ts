import { bulkRoute, eachOf, workspacesByIds } from "@/lib/admin/bulk";
import { suspendWorkspace } from "@/lib/admin/workspace-settings";

/** Workspaces › Suspend. Each workspace on its own; refusals are named, the rest go through. */
export const POST = bulkRoute("workspace.suspend", (operator, { ids, reason }) =>
  eachOf(ids, workspacesByIds, (workspace) => suspendWorkspace(operator, workspace, reason ?? ""), "workspace"),
);
