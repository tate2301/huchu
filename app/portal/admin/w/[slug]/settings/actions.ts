"use server";

import {
  closeWorkspace,
  endSignInAsInWorkspace,
  reinstateWorkspace,
  renameWorkspace,
  signEveryoneOut,
  suspendWorkspace,
} from "@/lib/admin/workspace-settings";
import { asResult, workspaceWrite } from "@/lib/admin/workspace-context";

/** A workspace's settings, bound to the page's workspace. */

export async function rename(slug: string, name: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.edit");
    await renameWorkspace(operator, workspace, name);
    return "Renamed.";
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

export async function close(slug: string, typedAddress: string, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "workspace.close");
    await closeWorkspace(operator, workspace, typedAddress, reason);
    return `${workspace.name} is closed.`;
  });
}
