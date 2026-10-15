import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";

/** The operators a bulk action names. */
export async function operatorsByIds(ids: string[]) {
  return prisma.operator.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
}

/** Where an invite is accepted, on the host the owner is using now. */
export async function inviteLink(token: string) {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/admin/login/invite?token=${token}`;
}
