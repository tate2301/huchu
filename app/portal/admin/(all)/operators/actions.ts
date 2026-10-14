"use server";

import type { OperatorRole } from "@prisma/client";
import { headers } from "next/headers";

import { AdminRefusal } from "@/lib/admin/refusal";
import { asResult } from "@/lib/admin/workspace-context";
import { OperatorRefusal, requireOperatorFor } from "@/lib/operators/guards";
import { sendOperatorInviteMail } from "@/lib/operators/invite-mail";
import { changeOperatorRole, inviteOperator, removeOperator, resetAuthenticator, sendNewInvite } from "@/lib/operators/manage";

/** Operators, kept by owners. An invite's link is returned once, to copy, as well as emailed. */

async function inviteLink(token: string) {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/admin/login/invite?token=${token}`;
}

export type InviteResult = { ok: true; message: string; link: string } | { ok: false; error: string };

export async function invite(input: { name: string; email: string; role: OperatorRole }): Promise<InviteResult> {
  try {
    const owner = await requireOperatorFor("operator.manage");
    const { operator, token } = await inviteOperator(owner, input);
    const link = await inviteLink(token);
    await sendOperatorInviteMail({ to: operator.email, name: operator.name, invitedBy: owner.name, link, again: false });
    return { ok: true, message: `${operator.name} is invited.`, link };
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { ok: false, error: error.message };
    throw error;
  }
}

export async function newInvite(operatorId: string): Promise<InviteResult> {
  try {
    const owner = await requireOperatorFor("operator.manage");
    const { operator, token } = await sendNewInvite(owner, operatorId);
    const link = await inviteLink(token);
    await sendOperatorInviteMail({ to: operator.email, name: operator.name, invitedBy: owner.name, link, again: true });
    return { ok: true, message: `${operator.name} is signed out and sent a new invite.`, link };
  } catch (error) {
    if (error instanceof AdminRefusal || error instanceof OperatorRefusal) return { ok: false, error: error.message };
    throw error;
  }
}

export async function resetTheirAuthenticator(operatorId: string) {
  return asResult(async () => {
    const owner = await requireOperatorFor("operator.manage");
    const operator = await resetAuthenticator(owner, operatorId);
    return `${operator.name} is signed out, and sets up a new authenticator at their next sign-in.`;
  });
}

export async function changeRole(operatorId: string, role: OperatorRole) {
  return asResult(async () => {
    const owner = await requireOperatorFor("operator.manage");
    const operator = await changeOperatorRole(owner, operatorId, role);
    return `${operator.name}'s role is changed.`;
  });
}

export async function remove(operatorId: string) {
  return asResult(async () => {
    const owner = await requireOperatorFor("operator.manage");
    const operator = await removeOperator(owner, operatorId);
    return `${operator.name} is removed and signed out.`;
  });
}
