import { AdminRefusal } from "@/lib/admin/refusal";
import { operatorActor } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { createPlatformServices } from "@/scripts/platform/services";

/**
 * Deleting a workspace's data and keeping the workspace: the reset engine in
 * `scripts/platform/services.ts`, asked from the Settings page.
 *
 * The engine finds every table that holds the workspace's rows, groups them
 * by module (Retail, Gold, Schools…) and by foundation (people, sites,
 * documents), and deletes the groups chosen in one transaction. The company,
 * its owners (SUPERADMIN), its subscription and features, and the audit log
 * stay. It refuses while someone from support is signed in, or with no owner
 * left to sign in afterwards, and asks for `RESET <address>` typed exactly.
 * Its own audit line names the operator.
 */

type Workspace = { id: string; slug: string };

export type ResetGroup = {
  id: string;
  label: string;
  description: string;
  kind: "module" | "foundation";
  rows: number;
  tables: number;
  disabled: boolean;
};

export type ResetPreview = {
  groups: ResetGroup[];
  /** Every table with rows to go, largest first, and the group it goes with. */
  tables: Array<{ table: string; group: string; rows: number }>;
  confirmation: string;
  openSessions: number;
  owners: number;
  keeps: string[];
};

export async function previewWorkspaceReset(workspace: Workspace): Promise<ResetPreview> {
  const result = await createPlatformServices().org.previewResetWorkspace({ companyId: workspace.id, scope: "GROUPS", groupIds: [] });
  if (!result.ok) throw new AdminRefusal(result.message);
  const preview = result.resource;
  return {
    groups: preview.availableGroups.map((group) => ({
      id: group.id,
      label: group.label,
      description: group.description,
      kind: group.kind,
      rows: group.rowCount,
      tables: group.tableCount,
      disabled: group.disabled,
    })),
    tables: preview.tablesToDelete.map((table) => ({ table: table.table, group: table.groupId, rows: table.rowCount })),
    confirmation: preview.confirmationToken,
    openSessions: preview.openSignInAsSessionCount,
    owners: preview.activePreservedAdminCount,
    keeps: preview.preservedScopes,
  };
}

export async function resetWorkspaceData(
  operator: SignedInOperator,
  workspace: Workspace,
  input: { groupIds: string[]; typed: string; reason: string },
) {
  const why = input.reason.trim();
  if (why.length < 3) throw new AdminRefusal("Say why, so the owner can see it in their audit log.");
  if (input.groupIds.length === 0) throw new AdminRefusal("Choose what to delete.");
  const result = await createPlatformServices().org.resetWorkspace({
    companyId: workspace.id,
    actor: operatorActor(operator.id),
    scope: "GROUPS",
    groupIds: input.groupIds,
    confirmationToken: input.typed,
    reason: why,
  });
  if (!result.ok) throw new AdminRefusal(result.message);
  return {
    rows: result.resource.totalRowsDeleted,
    tables: result.resource.deletedTables.length,
    groups: result.resource.selectedGroupLabels,
  };
}
