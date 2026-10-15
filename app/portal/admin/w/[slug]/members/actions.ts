"use server";

import type { UserRole } from "@prisma/client";
import { headers } from "next/headers";

import {
  addMembers,
  editMember,
  MemberFieldsRefusal,
  MemberLinesRefusal,
} from "@/lib/admin/member-actions";
import { workspaceUrl } from "@/lib/admin/hosts";
import { listMembers, roleOptions } from "@/lib/admin/members";
import { AdminRefusal } from "@/lib/admin/refusal";
import { workspaceWrite } from "@/lib/admin/workspace-context";
import { OperatorRefusal } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";
import { canTellOwner, sendSignInAsOwnerMail } from "@/lib/sign-in-as/owner-mail";
import { endSignInAs, signInAsCode, startSignInAs } from "@/lib/sign-in-as/sessions";

/**
 * What the Members sheets ask of the server. Each takes the page's workspace
 * slug and re-reads the operator and the workspace before it reads or writes;
 * the list's own actions post to `/api/platform-admin/members/*`.
 */

type Refused = { ok: false; error: string };

function refusedWith(error: unknown): Refused {
  if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { ok: false, error: error.message };
  throw error;
}

export type MemberRoles = { ok: true; workspaceName: string; roles: Array<{ value: UserRole; label: string }> } | Refused;

/** The roles a member of this workspace may hold, for Change role and Add members. */
export async function memberRoles(slug: string): Promise<MemberRoles> {
  try {
    const { workspace } = await workspaceWrite(slug, "member.manage");
    return { ok: true, workspaceName: workspace.name, roles: await roleOptions(workspace) };
  } catch (error) {
    return refusedWith(error);
  }
}

export type MemberToEdit =
  | { ok: true; workspaceName: string; phoneNeeded: boolean; member: { name: string; email: string; phone: string } }
  | Refused;

export async function memberToEdit(slug: string, memberId: string): Promise<MemberToEdit> {
  try {
    const { workspace } = await workspaceWrite(slug, "member.manage");
    const member = await prisma.user.findFirst({
      where: { id: memberId, companyId: workspace.id },
      select: { name: true, email: true, phone: true },
    });
    if (!member) throw new AdminRefusal(`That member is not in ${workspace.name}.`);
    return {
      ok: true,
      workspaceName: workspace.name,
      phoneNeeded: workspace.workspaceProfile === "RETAIL",
      member: { name: member.name, email: member.email ?? "", phone: member.phone ?? "" },
    };
  } catch (error) {
    return refusedWith(error);
  }
}

export type SaveMemberResult = { ok: true; message: string } | (Refused & { fields?: Record<string, string> });

export async function saveMember(slug: string, memberId: string, input: { name: string; email: string; phone: string }): Promise<SaveMemberResult> {
  try {
    const { operator, workspace } = await workspaceWrite(slug, "member.manage");
    const { signedOut } = await editMember(operator, workspace, memberId, input);
    return {
      ok: true,
      message: signedOut ? "Saved. Their email changed, so they were signed out everywhere and sign in again with the new one." : "Saved.",
    };
  } catch (error) {
    if (error instanceof MemberFieldsRefusal) return { ok: false, error: error.message, fields: error.fields };
    return refusedWith(error);
  }
}

export type AddMembersResult = { ok: true; message: string } | (Refused & { problems?: string[] });

/** Adds everyone pasted, or nobody: the problems come back by line. */
export async function addMembersTo(slug: string, input: { text: string; role: UserRole }): Promise<AddMembersResult> {
  try {
    const { operator, workspace } = await workspaceWrite(slug, "member.manage");
    const { added } = await addMembers(operator, workspace, input);
    const who = added.length === 1 ? added[0]!.name : `${added.length} members`;
    const address = await signInAddress(slug);
    const how = address
      ? `They sign in at ${address} with their email, and a code is sent to it.`
      : "They sign in with their email, and a code is sent to it.";
    return { ok: true, message: `${who} added to ${workspace.name}. ${how}` };
  } catch (error) {
    if (error instanceof MemberLinesRefusal) return { ok: false, error: error.message, problems: error.problems };
    return refusedWith(error);
  }
}

/** The workspace's sign-in page, for the words; none where the deployment has no workspace hosts. */
async function signInAddress(slug: string): Promise<string | null> {
  try {
    const url = workspaceUrl(slug, "/login", await requestOrigin());
    return url.search ? url.toString() : `${url.host}/login`;
  } catch (error) {
    if (error instanceof AdminRefusal) return null;
    throw error;
  }
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
    const origin = await requestOrigin();
    const owner = await workspaceOwner(workspace.id);
    // Everything that could refuse is asked before a session exists, so a refusal leaves nothing open.
    workspaceUrl(slug, "/", origin);
    if (owner?.email && !canTellOwner()) {
      throw new AdminRefusal(
        "This deployment cannot send email, so the owner cannot be told and nobody can be signed in as. Set RESEND_API_KEY and EMAIL_FROM_ADDRESS.",
      );
    }
    const started = await startSignInAs({ operator, workspace, memberId, mode, reason });
    if (owner?.email) {
      try {
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
      } catch (error) {
        // The owner was not told, so nobody goes in: the session ends before its link is handed over.
        await endSignInAs(started.session.id, "OPERATOR", operator.id);
        console.error("[sign-in-as] owner email failed", error);
        throw new AdminRefusal(`The email to ${owner.name} did not go, so nobody was signed in. Try again in a minute.`);
      }
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

export type SignInAsChoices =
  | { ok: true; workspaceName: string; ownerName: string | null; canChange: boolean; members: Array<{ id: string; name: string; roleLabel: string }> }
  | { ok: false; error: string };

/** Who the operator may sign in as here: members with access, for the picker in the context bar. */
export async function signInAsChoices(slug: string): Promise<SignInAsChoices> {
  try {
    const { operator, workspace } = await workspaceWrite(slug, "member.signInAs");
    const [members, owner] = await Promise.all([listMembers(workspace.id), workspaceOwner(workspace.id)]);
    return {
      ok: true,
      workspaceName: workspace.name,
      ownerName: owner?.name ?? null,
      canChange: operatorCan(operator.role, "member.signInAsChange"),
      members: members
        .filter((member) => member.state !== "Access removed" && member.state !== "Invited")
        .map((member) => ({ id: member.id, name: member.name, roleLabel: member.roleLabel })),
    };
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { ok: false, error: error.message };
    throw error;
  }
}
