import { bulkRoute, eachOf, workspacesByIds } from "@/lib/admin/bulk";
import { reopenWorkspace } from "@/lib/admin/workspace-settings";

/** Workspaces › Reopen. Each workspace on its own; refusals are named, the rest go through. */
export const POST = bulkRoute("workspace.close", (operator, { ids, reason }) =>
  eachOf(ids, workspacesByIds, (workspace) => reopenWorkspace(operator, workspace, reason ?? ""), "workspace"),
);
