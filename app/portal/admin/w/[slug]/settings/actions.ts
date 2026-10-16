"use server";

import { AdminRefusal } from "@/lib/admin/refusal";
import {
  changeWorkspaceAddress,
  closeWorkspace,
  deleteWorkspaceForGood,
  endSignInAsInWorkspace,
  reinstateWorkspace,
  renameWorkspace,
  reopenWorkspace,
  signEveryoneOut,
  suspendWorkspace,
} from "@/lib/admin/workspace-settings";
import { asResult, workspaceWrite } from "@/lib/admin/workspace-context";
import { previewWorkspaceReset, resetWorkspaceData, type ResetPreview } from "@/lib/admin/workspace-reset";
import { OperatorRefusal } from "@/lib/operators/guards";

/** A workspace's settings, bound to the page's workspace. */

export async function rename(slug: string, name: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.edit");
    await renameWorkspace(operator, workspace, name);
    return "Renamed.";
  });
}

export async function changeAddress(slug: string, address: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.edit");
    const changed = await changeWorkspaceAddress(operator, workspace, address);
    return changed ? `The address is ${address.trim().toLowerCase()} now.` : "The address is as it was.";
  });
}

export async function signOutEveryone(slug: string, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.signEveryoneOut");
    const count = await signEveryoneOut(operator, workspace, reason);
    return `${count} ${count === 1 ? "member is" : "members are"} signed out everywhere.`;
  });
}

export async function endSession(slug: string, sessionId: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "member.signInAs");
    await endSignInAsInWorkspace(operator, workspace, sessionId);
    return "Session ended.";
  });
}

export async function suspend(slug: string, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.suspend");
    await suspendWorkspace(operator, workspace, reason);
    return `${workspace.name} is suspended. Everyone is signed out.`;
  });
}

export async function reinstate(slug: string, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.suspend");
    await reinstateWorkspace(operator, workspace, reason);
    return `${workspace.name} is open again.`;
  });
}

export async function close(slug: string, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.close");
    await closeWorkspace(operator, workspace, reason);
    return `${workspace.name} is closed. Everyone is signed out.`;
  });
}

export async function reopen(slug: string, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.close");
    await reopenWorkspace(operator, workspace, reason);
    return `${workspace.name} is open again.`;
  });
}

export async function deleteForGood(slug: string, typedAddress: string, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.close");
    if (typedAddress.trim().toLowerCase() !== workspace.slug) {
      throw new AdminRefusal(`Type ${workspace.slug} exactly to delete ${workspace.name} for good.`);
    }
    await deleteWorkspaceForGood(operator, workspace, reason);
    return `${workspace.name} is deleted for good.`;
  });
}

export type ResetPreviewResult = { ok: true; preview: ResetPreview } | { ok: false; error: string };

/** What deleting the workspace's data would delete, by group and table. Owners only. */
export async function previewReset(slug: string): Promise<ResetPreviewResult> {
  try {
    const { workspace } = await workspaceWrite(slug, "workspace.close");
    return { ok: true, preview: await previewWorkspaceReset(workspace) };
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { ok: false, error: error.message };
    throw error;
  }
}

export async function resetData(slug: string, input: { groupIds: string[]; typed: string; reason: string }) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.close");
    const done = await resetWorkspaceData(operator, workspace, input);
    return `${done.rows.toLocaleString("en-GB")} ${done.rows === 1 ? "row" : "rows"} deleted from ${done.groups.join(", ")}.`;
  });
}
