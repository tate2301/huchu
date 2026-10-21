"use server";

import { createSessionHandoff } from "@/lib/auth-core/session-handoff";
import { joinCodeMatches, sendJoinCode } from "@/lib/teams/deliver";
import { TeamsRefusal } from "@/lib/teams/errors";
import { acceptInvite, acceptInviteLink, hashToken } from "@/lib/teams/invites";
import { prisma } from "@/lib/prisma";

export async function sendCodeAction(token: string): Promise<{ ok: boolean; message?: string }> {
  const invite = await prisma.workspaceInvite.findUnique({ where: { tokenHash: hashToken(token) }, select: { phone: true, status: true } });
  if (!invite?.phone) return { ok: false, message: "There is no number to send a code to." };
  const sent = await sendJoinCode({ phone: invite.phone, token });
  return sent.ok ? { ok: true } : { ok: false, message: "The code could not be sent. Try again." };
}

/** Check the code, make the person a member, and hand them a one-use ticket to sign in with. */
export async function joinAction(token: string, code: string): Promise<{ ok: true; ticket: string; landsOn: string } | { ok: false; message: string; field?: "code" }> {
  const invite = await prisma.workspaceInvite.findUnique({ where: { tokenHash: hashToken(token) }, select: { phone: true } });
  if (!invite) return { ok: false, message: "This invite link does not work. Ask for a new one." };
  if (invite.phone && !joinCodeMatches(token, code)) return { ok: false, message: "That code is not right", field: "code" };
  try {
    const joined = await acceptInvite({ token });
    return { ok: true, ticket: await createSessionHandoff(joined.userId), landsOn: joined.landsOn };
  } catch (error) {
    if (error instanceof TeamsRefusal) return { ok: false, message: error.message };
    console.error("[teams] join failed", error);
    return { ok: false, message: "That did not go through. Try again." };
  }
}

/** Join through the workspace's shared link: a name and a way to reach them, no code. */
export async function joinByLinkAction(token: string, input: { name: string; phone?: string; email?: string }): Promise<{ ok: true; ticket: string; landsOn: string } | { ok: false; message: string }> {
  try {
    const joined = await acceptInviteLink({ token, name: input.name, phone: input.phone || null, email: input.email || null });
    return { ok: true, ticket: await createSessionHandoff(joined.userId), landsOn: joined.landsOn };
  } catch (error) {
    if (error instanceof TeamsRefusal) return { ok: false, message: error.message };
    console.error("[teams] join by link failed", error);
    return { ok: false, message: "That did not go through. Try again." };
  }
}
