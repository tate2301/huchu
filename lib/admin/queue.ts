import type { WorkspaceProduct } from "@prisma/client";

import { formatMoney, formatTime } from "@/lib/admin/format";
import { paymentMethod } from "@/lib/admin/payment-words";
import { listWorkspaces, PROFILE_LABEL } from "@/lib/admin/workspaces";
import { standingDetail } from "@/lib/admin/standing";
import { listOperators } from "@/lib/operators/manage";
import { prisma } from "@/lib/prisma";
import { signInAsCode } from "@/lib/sign-in-as/sessions";

/**
 * What waits on Corelith staff, across every workspace: Home.
 *
 * Each item is a thing someone has to do, not a number to look at, and each
 * one that belongs to a workspace says which, and opens inside it.
 */

export type QueueItem = {
  id: string;
  kind: "Money" | "Access" | "Setup";
  title: string;
  detail: string;
  meta: string;
  href: string;
  workspace: { slug: string; name: string; product: WorkspaceProduct; profile: string | null } | null;
};

const DAY = 24 * 60 * 60 * 1000;

export async function homeQueue(options: { includeOperators: boolean }, now = new Date()): Promise<QueueItem[]> {
  const [payments, sessions, workspaces, operators] = await Promise.all([
    prisma.subscriptionPayment.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, provider: true, providerReference: true, amount: true, createdAt: true, company: { select: { slug: true, name: true, product: true, workspaceProfile: true } } },
    }),
    prisma.signInAsSession.findMany({
      where: { endedAt: null, expiresAt: { gt: now } },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        number: true,
        mode: true,
        expiresAt: true,
        reason: true,
        operator: { select: { name: true } },
        member: { select: { name: true } },
        company: { select: { slug: true, name: true, product: true, workspaceProfile: true } },
      },
    }),
    listWorkspaces({}, now),
    options.includeOperators ? listOperators(now) : Promise.resolve([]),
  ]);

  const ws = (company: { slug: string; name: string; product: WorkspaceProduct; workspaceProfile: string }) => ({
    slug: company.slug,
    name: company.name,
    product: company.product,
    profile: company.product === "CORELITH" ? (PROFILE_LABEL[company.workspaceProfile as keyof typeof PROFILE_LABEL] ?? null) : null,
  });

  const items: QueueItem[] = [];
  for (const payment of payments) {
    items.push({
      id: `payment-${payment.id}`,
      kind: "Money",
      title: `${formatMoney(payment.amount.toFixed(2))} by ${paymentMethod(payment.provider)}, not confirmed`,
      detail: `The gateway has not said whether it went through. Check the statement for ${payment.providerReference}.`,
      meta: formatTime(payment.createdAt),
      href: `/admin/w/${payment.company.slug}/billing`,
      workspace: ws(payment.company),
    });
  }
  for (const workspace of workspaces.rows) {
    const { standing, until } = workspace.standing;
    const turn = { slug: workspace.slug, name: workspace.name, product: workspace.product, profile: workspace.profile };
    if (standing === "Setting up") {
      items.push({ id: `setup-${workspace.id}`, kind: "Setup", title: "Setup has not finished", detail: "It is not open to its members yet.", meta: "", href: `/admin/w/${workspace.slug}`, workspace: turn });
    }
    if (standing === "Past due" && until && until.getTime() - now.getTime() < 3 * DAY) {
      items.push({
        id: `due-${workspace.id}`,
        kind: "Money",
        title: `Past due, ${standingDetail(workspace.standing)}`,
        detail: workspace.owner ? `Ring ${workspace.owner.name}${workspace.owner.phone ? ` on ${workspace.owner.phone}` : ""} before it goes read-only.` : "It goes read-only soon.",
        meta: "",
        href: `/admin/w/${workspace.slug}/billing`,
        workspace: turn,
      });
    }
  }
  for (const session of sessions) {
    items.push({
      id: `sia-${session.id}`,
      kind: "Access",
      title: `${session.operator.name} is signed in as ${session.member.name}, ${session.mode === "LOOK" ? "look only" : "making changes"}`,
      detail: `“${session.reason}”`,
      meta: `${signInAsCode(session.number)} · until ${formatTime(session.expiresAt)}`,
      href: `/admin/w/${session.company.slug}/settings`,
      workspace: ws(session.company),
    });
  }
  for (const operator of operators) {
    if (operator.state === "Needs a second factor" || operator.state === "Locked" || operator.state === "Invited") {
      items.push({
        id: `operator-${operator.id}`,
        kind: "Access",
        title: `${operator.name}: ${operator.state === "Invited" ? "has not accepted their invite" : operator.state === "Locked" ? "locked out after five wrong tries" : "no authenticator yet"}`,
        detail: `${operator.roleLabel} · ${operator.email}`,
        meta: "",
        href: "/admin/operators",
        workspace: null,
      });
    }
  }
  return items;
}
