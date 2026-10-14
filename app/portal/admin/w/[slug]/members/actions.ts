"use server";

import type { UserRole } from "@prisma/client";
import { headers } from "next/headers";

import {
  changeMemberRole,
  giveMemberAccessBack,
  removeMemberAccess,
  signMemberOutEverywhere,
} from "@/lib/admin/member-actions";
import { workspaceUrl } from "@/lib/admin/hosts";
import { roleLabel } from "@/lib/admin/members";
import { AdminRefusal } from "@/lib/admin/refusal";
import { asResult, workspaceWrite } from "@/lib/admin/workspace-context";
import { OperatorRefusal } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import { sendSignInAsOwnerMail } from "@/lib/sign-in-as/owner-mail";
import { signInAsCode, startSignInAs } from "@/lib/sign-in-as/sessions";

/**
 * A member's housekeeping. Each action is bound to the page's workspace slug
 * (`action.bind(null, slug)`), and every one re-reads the operator and the
 * workspace on the server before it writes.
 */

export async function changeRole(slug: string, memberId: string, role: UserRole) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "member.manage");
    await changeMemberRole(operator, workspace, memberId, role);
    return `Role changed to ${roleLabel(role)}.`;
  });
}

export async function signOutEverywhere(slug: string, memberId: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "member.manage");
    await signMemberOutEverywhere(operator, workspace, memberId);
    return "Signed out everywhere. They sign in again with their password or an emailed code.";
  });
}

export async function removeAccess(slug: string, memberId: string, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "member.manage");
    await removeMemberAccess(operator, workspace, memberId, reason);
    return "Access removed. They are signed out everywhere.";
  });
}

export async function giveAccessBack(slug: string, memberId: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "member.manage");
    await giveMemberAccessBack(operator, workspace, memberId);
    return "Access given back.";
  });
}

export type SignInAsResult = { ok: true; url: string; code: string; ownerTold: string | null } | { ok: false; error: string };

/**
 * Signs the operator in as a member: records the session, emails the owner,
 * and returns the one-use link that opens the workspace as that member. The
 * link works once, within two minutes.
 */
export async function signInAs(slug: string, memberId: string, mode: "LOOK" | "CHANGE", reason: string): Promise<SignInAsResult> {
  try {
    const { operator, workspace } = await workspaceWrite(slug, mode === "CHANGE" ? "member.signInAsChange" : "member.signInAs");
    const started = await startSignInAs({ operator, workspace, memberId, mode, reason });
    const origin = await requestOrigin();
    const owner = await workspaceOwner(workspace.id);
    if (owner?.email) {
      await sendSignInAsOwnerMail({
        to: owner.email,
        ownerName: owner.name,
        workspaceName: workspace.name,
        operatorName: operator.name,
        memberName: started.member.name,
        mode,
        reason: started.session.reason,
        code: signInAsCode(started.session.number),
        until: started.session.expiresAt,
        endUrl: workspaceUrl(slug, `/sign-in-as/end?token=${started.ownerEndToken}`, origin).toString(),
      });
    }
    return {
      ok: true,
      url: workspaceUrl(slug, `/sign-in-as?token=${started.handoffToken}`, origin).toString(),
      code: signInAsCode(started.session.number),
      ownerTold: owner?.email ? owner.name : null,
    };
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { ok: false, error: error.message };
    throw error;
  }
}

async function requestOrigin() {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The first active top-role holder: the one who signed up, or whom the workspace was set up for. */
function workspaceOwner(companyId: string) {
  return prisma.user.findFirst({
    where: { companyId, role: "SUPERADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { name: true, email: true },
  });
}
