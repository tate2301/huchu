/**
 * Telling a record's members that something happened on it.
 *
 * A record's members are the people following it — commenting follows a
 * record, and anyone can press Follow or be added — and whoever owns it. When
 * somebody adds to a record's timeline (logs a call, moves the stage, edits a
 * field, sends a quote, records a payment), every other member is notified,
 * in the app and by email.
 *
 * It is driven by the request rather than by each of the two dozen places that
 * write a timeline entry: the activity recorder (`lib/activity/record.ts`)
 * collects the ids of the entries a request wrote, and this runs once the
 * response has gone, for requests that succeeded. One notice per record per
 * request, so saving five fields is one notice, not five.
 *
 * Comments are not timeline entries and keep their own notices.
 */
import type { CrmActivityType, Prisma } from "@prisma/client";

import type { ActivityRequest } from "@/lib/activity/context";
import { collabRecordPath, COLLAB_ENTITY_LABELS } from "@/lib/crm/collaboration";
import { emitCrmNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export type MemberRecordEntity = "LEAD" | "DEAL" | "COMPANY" | "PERSON" | "SITE";

const ENTITIES = new Set<MemberRecordEntity>(["LEAD", "DEAL", "COMPANY", "PERSON", "SITE"]);

export type TimelineEntry = {
  type: CrmActivityType;
  subject: string;
  metadata: Prisma.JsonValue;
  leadId: string | null;
  dealId: string | null;
  clientId: string | null;
  personId: string | null;
};

/**
 * The record an entry belongs to. A field edit names its record in its
 * metadata — the only way a site's entries are named at all. Otherwise the
 * most specific column wins: a quote sent on a deal also carries the deal's
 * company, and the deal is what it is about.
 */
export function entryRecord(entry: TimelineEntry): { entity: MemberRecordEntity; recordId: string } | null {
  const meta = entry.metadata as { entity?: unknown; recordId?: unknown } | null;
  if (
    meta &&
    typeof meta.entity === "string" &&
    typeof meta.recordId === "string" &&
    ENTITIES.has(meta.entity as MemberRecordEntity)
  ) {
    return { entity: meta.entity as MemberRecordEntity, recordId: meta.recordId };
  }
  if (entry.dealId) return { entity: "DEAL", recordId: entry.dealId };
  if (entry.leadId) return { entity: "LEAD", recordId: entry.leadId };
  if (entry.personId) return { entity: "PERSON", recordId: entry.personId };
  if (entry.clientId) return { entity: "COMPANY", recordId: entry.clientId };
  return null;
}

const LOGGED: Partial<Record<CrmActivityType, string>> = {
  NOTE: "Note",
  CALL: "Call",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  MEETING: "Meeting",
};

function shown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** One line per entry, in the words the timeline uses. */
export function entryLine(entry: TimelineEntry): string {
  const meta = entry.metadata as { kind?: unknown; changes?: unknown } | null;
  if (meta?.kind === "FIELD_CHANGE" && Array.isArray(meta.changes)) {
    return (meta.changes as Array<{ label?: unknown; to?: unknown }>)
      .map((change) => {
        const label = shown(change.label) ?? "A field";
        const to = shown(change.to);
        return to ? `${label}: ${to}` : `${label} cleared`;
      })
      .join("\n");
  }
  const kind = LOGGED[entry.type];
  return kind ? `${kind}: ${entry.subject}` : entry.subject;
}

/** Everyone following it and its owner, once each, without whoever did it. */
export function recordMembers(input: {
  followerIds: string[];
  ownerId: string | null;
  actorId: string;
}): string[] {
  const members = new Set(input.followerIds);
  if (input.ownerId) members.add(input.ownerId);
  members.delete(input.actorId);
  return Array.from(members);
}

async function recordHeading(
  companyId: string,
  entity: MemberRecordEntity,
  recordId: string,
): Promise<{ name: string; ownerId: string | null } | null> {
  const where = { id: recordId, companyId };
  switch (entity) {
    case "LEAD": {
      const lead = await prisma.crmLead.findFirst({
        where,
        select: { leadNo: true, title: true, contactName: true, assignedToId: true },
      });
      return lead && { name: lead.title ?? lead.contactName ?? lead.leadNo, ownerId: lead.assignedToId };
    }
    case "DEAL": {
      const deal = await prisma.crmDeal.findFirst({ where, select: { title: true, assignedToId: true } });
      return deal && { name: deal.title, ownerId: deal.assignedToId };
    }
    case "COMPANY": {
      const client = await prisma.crmClient.findFirst({ where, select: { name: true, assignedToId: true } });
      return client && { name: client.name, ownerId: client.assignedToId };
    }
    case "PERSON": {
      const person = await prisma.crmPerson.findFirst({ where, select: { fullName: true, assignedToId: true } });
      return person && { name: person.fullName, ownerId: person.assignedToId };
    }
    case "SITE": {
      const site = await prisma.crmSite.findFirst({ where, select: { name: true } });
      return site && { name: site.name, ownerId: null };
    }
  }
}

/** The longest a notice's body gets before the rest is left to the record. */
const SUMMARY_LIMIT = 600;

export async function notifyRecordMembers(request: ActivityRequest): Promise<void> {
  if (request.failed || !request.companyId || !request.actorId) return;
  if (request.crmActivityIds.length === 0) return;
  const companyId = request.companyId;
  const actorId = request.actorId;

  try {
    const entries = await prisma.crmActivity.findMany({
      where: { id: { in: request.crmActivityIds }, companyId },
      select: {
        type: true,
        subject: true,
        metadata: true,
        leadId: true,
        dealId: true,
        clientId: true,
        personId: true,
      },
      orderBy: { occurredAt: "asc" },
    });

    const byRecord = new Map<string, { entity: MemberRecordEntity; recordId: string; lines: string[] }>();
    for (const entry of entries) {
      const target = entryRecord(entry);
      if (!target) continue;
      const key = `${target.entity}:${target.recordId}`;
      const group = byRecord.get(key) ?? { ...target, lines: [] };
      group.lines.push(entryLine(entry));
      byRecord.set(key, group);
    }

    const actor = request.actorName ?? "Someone";
    for (const { entity, recordId, lines } of byRecord.values()) {
      const [heading, followers] = await Promise.all([
        recordHeading(companyId, entity, recordId),
        prisma.crmFollower.findMany({
          where: { companyId, entity, recordId },
          select: { userId: true },
        }),
      ]);
      if (!heading) continue;

      const recipientIds = recordMembers({
        followerIds: followers.map((follower) => follower.userId),
        ownerId: heading.ownerId,
        actorId,
      });
      if (recipientIds.length === 0) continue;

      const body = lines.join("\n");
      await emitCrmNotification({
        companyId,
        recipientIds,
        type: "CRM_RECORD_ACTIVITY",
        title: `${actor} updated ${COLLAB_ENTITY_LABELS[entity].toLowerCase()} ${heading.name}`,
        summary: body.length > SUMMARY_LIMIT ? `${body.slice(0, SUMMARY_LIMIT - 1)}…` : body,
        entityType: "CRM_RECORD",
        entityId: recordId,
        viewPath: collabRecordPath({ entity, recordId }),
      });
    }
  } catch (error) {
    console.error("[record-members] failed to notify", { path: request.path, error });
  }
}
