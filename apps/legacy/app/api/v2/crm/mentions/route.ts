import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";

/**
 * Everywhere a record has been written about.
 *
 * A record page could show what it points at — its company, its site, its
 * people — and nothing about what points back. But half of what somebody
 * writes on a deal is about another deal, the site it is on, or the company
 * behind both, and those references have been stored in note and comment
 * bodies since the composer learned to make them: `@[Label](kind:uuid)`.
 *
 * So the backlinks are already in the data. This reads them out.
 *
 * Matching is a substring search on the record's id rather than a join table.
 * The id is a uuid — 36 characters with dashes — so a false positive would
 * need somebody to type one into prose, and the alternative is a migration
 * plus a write path that can drift out of step with the text it indexes. If
 * this ever gets slow, the fix is a materialised `CrmReference` table fed by
 * the same parser, not a different query here.
 */
const querySchema = z.object({
  recordId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const SOURCE_SELECT = {
  lead: { select: { id: true, leadNo: true, title: true } },
  deal: { select: { id: true, dealNo: true, title: true } },
  client: { select: { id: true, name: true } },
  person: { select: { id: true, fullName: true } },
  site: { select: { id: true, name: true } },
} as const;

type SourceRow = {
  lead?: { id: string; leadNo: string; title: string | null } | null;
  deal?: { id: string; dealNo: string; title: string | null } | null;
  client?: { id: string; name: string } | null;
  person?: { id: string; fullName: string } | null;
  site?: { id: string; name: string } | null;
};

/** Which record the note was written on, named the way a link needs. */
function sourceOf(row: SourceRow) {
  if (row.lead) {
    return {
      kind: "lead" as const,
      id: row.lead.id,
      label: row.lead.title ?? row.lead.leadNo,
      href: `/crm/leads/${row.lead.id}`,
    };
  }
  if (row.deal) {
    return {
      kind: "deal" as const,
      id: row.deal.id,
      label: row.deal.title ?? row.deal.dealNo,
      href: `/crm/deals/${row.deal.id}`,
    };
  }
  if (row.client) {
    return {
      kind: "company" as const,
      id: row.client.id,
      label: row.client.name,
      href: `/crm/companies/${row.client.id}`,
    };
  }
  if (row.person) {
    return {
      kind: "person" as const,
      id: row.person.id,
      label: row.person.fullName,
      href: `/crm/people/${row.person.id}`,
    };
  }
  if (row.site) {
    return {
      kind: "site" as const,
      id: row.site.id,
      label: row.site.name,
      href: `/crm/sites/${row.site.id}`,
    };
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const { recordId, limit } = querySchema.parse({
      recordId: searchParams.get("recordId"),
      limit: searchParams.get("limit") ?? undefined,
    });

    const [comments, activities] = await Promise.all([
      prisma.crmComment.findMany({
        where: { companyId, body: { contains: recordId } },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          body: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
          lead: SOURCE_SELECT.lead,
          deal: SOURCE_SELECT.deal,
          client: SOURCE_SELECT.client,
          person: SOURCE_SELECT.person,
          site: SOURCE_SELECT.site,
        },
      }),
      prisma.crmActivity.findMany({
        where: {
          companyId,
          OR: [{ body: { contains: recordId } }, { subject: { contains: recordId } }],
        },
        orderBy: { occurredAt: "desc" },
        take: limit,
        select: {
          id: true,
          subject: true,
          body: true,
          occurredAt: true,
          createdBy: { select: { id: true, name: true } },
          lead: SOURCE_SELECT.lead,
          deal: SOURCE_SELECT.deal,
          client: SOURCE_SELECT.client,
          person: SOURCE_SELECT.person,
        },
      }),
    ]);

    const data = [
      ...comments.map((row) => ({
        id: row.id,
        kind: "comment" as const,
        // The stored text, tokens and all — the client renders it the same
        // way it renders a note, so a mention inside a mention still links.
        body: row.body,
        occurredAt: row.createdAt.toISOString(),
        authorName: row.createdBy?.name ?? null,
        source: sourceOf(row),
      })),
      ...activities.map((row) => ({
        id: row.id,
        kind: "activity" as const,
        body: row.body?.trim() ? row.body : row.subject,
        occurredAt: row.occurredAt.toISOString(),
        authorName: row.createdBy?.name ?? null,
        source: sourceOf(row),
      })),
    ]
      // A mention on the record you are already looking at is not a backlink,
      // it is the note itself — the timeline already shows it.
      .filter((entry) => entry.source && entry.source.id !== recordId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);

    return successResponse({ data });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] GET /api/v2/crm/mentions error:", error);
    return errorResponse("Failed to load mentions");
  }
}
