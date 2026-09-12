import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

/**
 * How much is in each setup section.
 *
 * The artboards draw a count beside every entry in the setup rail — Pipelines
 * 2, Custom fields 31, Lead sources 7, Catalogue 48, Commissions 3, API keys 3,
 * Facebook ads 1.
 * That is the rail's job beyond navigation: it says which sections have been
 * set up and which are still empty, without opening each one.
 *
 * One endpoint rather than seven list fetches. The rail needs all seven numbers
 * whichever section is open, so deriving them from the panels' own queries
 * would mean loading six panels' worth of rows to render six numbers.
 *
 * Counts only — no names, no rows. A reader who wants the rows opens the
 * section, and the panel there fetches them.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const [pipelines, fields, sources, catalogue, commissions, keys, integrations] = await Promise.all([
      prisma.crmPipeline.count({ where: { companyId, isActive: true } }),
      // Archived definitions still exist so historical records keep a field to
      // point at; they are not part of what is configured now.
      prisma.crmFieldDefinition.count({ where: { companyId, archivedAt: null } }),
      prisma.crmLeadSource.count({ where: { companyId, isActive: true } }),
      prisma.product.count({ where: { companyId, isActive: true, archivedAt: null } }),
      prisma.crmCommissionRule.count({ where: { companyId, isActive: true } }),
      // A revoked key is history, not a credential — the rail counts what still
      // works.
      prisma.crmApiKey.count({ where: { companyId, revokedAt: null } }),
      // A paused Page is still connected — it is configuration that exists,
      // which is what this tally is about. Disconnecting is how a Page stops
      // counting.
      prisma.crmFacebookConnection.count({ where: { companyId } }),
    ]);

    return successResponse({
      data: { pipelines, fields, sources, catalogue, commissions, keys, integrations },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/settings/counts error:", error);
    return errorResponse("Failed to fetch setup counts");
  }
}
