"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import type { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { joinUrl } from "@/lib/teams/deliver";
import { TeamsRefusal } from "@/lib/teams/errors";
import { turnOffInviteLink, turnOnInviteLink } from "@/lib/teams/invites";

type Result = { ok: true; url?: string } | { ok: false; message: string };

async function actor() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; companyId?: string } | undefined;
  return user?.id && user.companyId ? { userId: user.id, companyId: user.companyId } : null;
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.includes("localhost") || host.includes(".local") ? "http" : "https")}://${host}`;
}

/** Turning a link on gives a new address; the old one stops working. The address is shown once. */
export async function turnOnLinkAction(role: UserRole): Promise<Result> {
  const who = await actor();
  if (!who) return { ok: false, message: "Sign in again to carry on." };
  try {
    const { token } = await turnOnInviteLink(who, role);
    revalidatePath("/preferences/organization/invite-link");
    return { ok: true, url: joinUrl(await origin(), token) };
  } catch (error) {
    return { ok: false, message: error instanceof TeamsRefusal ? error.message : "That did not go through. Nothing changed." };
  }
}

export async function turnOffLinkAction(role: UserRole): Promise<Result> {
  const who = await actor();
  if (!who) return { ok: false, message: "Sign in again to carry on." };
  try {
    await turnOffInviteLink(who, role);
    revalidatePath("/preferences/organization/invite-link");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof TeamsRefusal ? error.message : "That did not go through. Nothing changed." };
  }
}
