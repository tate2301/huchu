import { prisma } from "@/lib/prisma";

import { hashToken } from "./invites";
import { productWord, roleWord, clock } from "./words";

/** What the join page says about an invite: who asked, as what, where the code went. */
export type JoinView = {
  state: "OPEN" | "EXPIRED" | "REVOKED" | "ACCEPTED";
  workspace: string;
  product: string;
  invitedBy: string;
  sentAt: string;
  name: string | null;
  role: string;
  phone: string | null;
  email: string | null;
};

export async function loadJoin(token: string, now = new Date()): Promise<JoinView | null> {
  const invite = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { company: { select: { name: true, product: true } } },
  });
  if (!invite) return null;
  const by = await prisma.user.findUnique({ where: { id: invite.invitedById }, select: { name: true } });
  const state = invite.status === "ACCEPTED" || invite.status === "REVOKED" ? invite.status : invite.status === "EXPIRED" || invite.expiresAt <= now ? "EXPIRED" : "OPEN";
  return {
    state,
    workspace: invite.company.name,
    product: productWord(invite.company.product),
    invitedBy: by?.name ?? "",
    sentAt: clock(invite.sentAt),
    name: invite.name,
    role: roleWord({ role: invite.role, isOwner: false, isAdmin: invite.role === "SUPERADMIN" }),
    phone: invite.phone,
    email: invite.email,
  };
}

/** The shared link for a role, as the join page sees it. */
export type LinkView = { workspace: string; product: string; role: string; madeBy: string };

export async function loadLinkJoin(token: string): Promise<LinkView | null> {
  const link = await prisma.inviteLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { company: { select: { name: true, product: true } } } });
  if (!link || !link.isActive) return null;
  const by = await prisma.user.findUnique({ where: { id: link.createdById }, select: { name: true } });
  return { workspace: link.company.name, product: productWord(link.company.product), role: roleWord({ role: link.role, isOwner: false, isAdmin: link.role === "SUPERADMIN" }), madeBy: by?.name ?? "" };
}

export type LinkRow = { role: string; label: string; active: boolean; madeBy: string | null; madeAt: string | null };

export async function loadInviteLinks(companyId: string, jobs: Array<{ value: string; label: string }>): Promise<LinkRow[]> {
  const links = await prisma.inviteLink.findMany({ where: { companyId } });
  const makers = await prisma.user.findMany({ where: { id: { in: links.map((l) => l.createdById) } }, select: { id: true, name: true } });
  return jobs.map((job) => {
    const link = links.find((l) => l.role === job.value);
    return {
      role: job.value,
      label: job.label,
      active: Boolean(link?.isActive),
      madeBy: link ? (makers.find((m) => m.id === link.createdById)?.name ?? null) : null,
      madeAt: link ? (link.rotatedAt ?? link.createdAt).toISOString() : null,
    };
  });
}
