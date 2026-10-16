import { bulkRoute, eachOf, workspacesByIds } from "@/lib/admin/bulk";
import { reinstateWorkspace } from "@/lib/admin/workspace-settings";

/** Workspaces › Reinstate. Each workspace on its own; refusals are named, the rest go through. */
export const POST = bulkRoute("workspace.suspend", (operator, { ids, reason }) =>
  eachOf(ids, workspacesByIds, (workspace) => reinstateWorkspace(operator, workspace, reason ?? ""), "workspace"),
);
