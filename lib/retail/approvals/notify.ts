import type { NotificationEntityType, NotificationSeverity, NotificationType } from "@prisma/client";

import { emitRetailNotification } from "@/lib/notifications";
import { buildWorkspaceUrl } from "@/lib/platform/tenant-url";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";

import { activeOwners, getApprovalLimits } from "./limits";

/**
 * The one way any area asks for an approval (80-admin 3.5, ADM-04). BUY-04,
 * STK-06, CUS-07 and ADM-05 call it after the ask is saved.
 *
 * - Owner level: the owner named in "Owner approvals go to" while they are an
 *   active owner, else every active owner.
 * - Manager level: every active owner and every active manager who works at
 *   `siteId` (all of them when no site is named).
 *
 * Each is told in the app; with "Ask by" on "WhatsApp and the app", each with a
 * phone also gets a WhatsApp through the outbox, template `approval-ask`:
 * "<title>. <summary> Open it: <link>".
 */

export const APPROVAL_ASK_TEMPLATE = "approval-ask";

export type ApprovalAsk = {
  companyId: string;
  level: "owner" | "manager";
  siteId?: string | null;
  type: NotificationType;
  title: string;
  summary: string;
  entityType: NotificationEntityType;
  entityId: string;
  viewPath: string;
  severity?: NotificationSeverity;
  /** Who asks: never asked themselves. */
  askedById?: string | null;
  /** The request's address, for the link's host; else the shop's own. */
  requestUrl?: string | null;
};

export type ApprovalAskResult = { recipientIds: string[]; whatsapp: number };

type Recipient = { id: string; phone: string | null };

async function recipientsOf(ask: ApprovalAsk, ownerApproverId: string | null): Promise<Recipient[]> {
  const owners = await activeOwners(ask.companyId);
  if (ask.level === "owner") {
    const named = ownerApproverId ? owners.find((owner) => owner.id === ownerApproverId) : undefined;
    return (named ? [named] : owners).map((owner) => ({ id: owner.id, phone: owner.phone ?? null }));
  }
  const managers = await prisma.user.findMany({
    where: {
      companyId: ask.companyId,
      isActive: true,
      role: { in: ["MANAGER", "SHOP_MANAGER"] },
      ...(ask.siteId ? { OR: [{ allSites: true }, { siteAccess: { some: { siteId: ask.siteId } } }] } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, phone: true },
  });
  return [...owners, ...managers].map((person) => ({ id: person.id, phone: person.phone ?? null }));
}

/** The link in the WhatsApp: on this shop's own address. */
export async function approvalLink(companyId: string, viewPath: string, requestUrl?: string | null): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  const slug = company?.slug ?? "";
  if (requestUrl) return buildWorkspaceUrl({ slug, path: viewPath, currentUrl: requestUrl }).toString();
  const root = process.env.PLATFORM_ROOT_DOMAIN?.trim().toLowerCase();
  return root && slug ? `https://${slug}.${root}${viewPath}` : absoluteUrl(viewPath);
}

/** "<title>. <summary> Open it: <link>" — the title's own full stop kept. */
export function approvalAskText(title: string, summary: string, link: string): string {
  const head = /[.!?]$/.test(title) ? title : `${title}.`;
  return `${head} ${summary} Open it: ${link}`;
}

export async function notifyApprover(ask: ApprovalAsk): Promise<ApprovalAskResult> {
  const limits = await getApprovalLimits(ask.companyId);
  const recipients = (await recipientsOf(ask, limits.ownerApproverId)).filter(
    (person, index, all) => person.id !== ask.askedById && all.findIndex((other) => other.id === person.id) === index,
  );
  if (recipients.length === 0) return { recipientIds: [], whatsapp: 0 };

  await emitRetailNotification({
    companyId: ask.companyId,
    recipientIds: recipients.map((person) => person.id),
    type: ask.type,
    title: ask.title,
    summary: ask.summary,
    entityType: ask.entityType,
    entityId: ask.entityId,
    viewPath: ask.viewPath,
    severity: ask.severity ?? "WARNING",
  });

  const withPhone = limits.askBy === "WHATSAPP_AND_APP" ? recipients.filter((person) => person.phone) : [];
  if (withPhone.length > 0) {
    const text = approvalAskText(ask.title, ask.summary, await approvalLink(ask.companyId, ask.viewPath, ask.requestUrl));
    await prisma.retailMessage.createMany({
      data: withPhone.map((person) => ({
        companyId: ask.companyId,
        channel: "WHATSAPP" as const,
        to: person.phone!,
        template: APPROVAL_ASK_TEMPLATE,
        body: text,
        createdById: ask.askedById ?? null,
      })),
    });
  }
  return { recipientIds: recipients.map((person) => person.id), whatsapp: withPhone.length };
}
