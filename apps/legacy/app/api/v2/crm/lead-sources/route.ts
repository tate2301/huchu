import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { CRM_LEAD_CHANNELS } from "@corelithzw/module-crm/sources";
import { requireCrmCapability } from "../_helpers";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  channel: z.enum(CRM_LEAD_CHANNELS as [string, ...string[]]).optional(),
});

/** How far back the artboard's "Leads, 30d" column counts. */
const RECENT_WINDOW_DAYS = 30;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const sources = await prisma.crmLeadSource.findMany({
      where: { companyId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    /*
      What each source has actually produced.

      The artboard's Sources table is not a list of names — it carries Leads
      30d, Won and Value won beside each one, because the question the page
      exists to answer is "which of these is worth keeping". A name on its own
      cannot be audited.

      Two grouped queries rather than three per source. `CrmLead.source` is the
      free-text name a rep picked, so this joins on the name rather than on a
      foreign key. Archived leads are excluded: a converted lead becomes a deal,
      and counting both is how one opportunity gets counted twice.
    */
    const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [recent, won] = await Promise.all([
      prisma.crmLead.groupBy({
        by: ["source"],
        where: { companyId, archivedAt: null, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.crmLead.groupBy({
        by: ["source"],
        where: { companyId, archivedAt: null, stage: "WON" },
        _count: { _all: true },
        _sum: { estimatedValue: true },
      }),
    ]);

    const recentBySource = new Map(recent.map((row) => [row.source, row._count._all]));
    const wonBySource = new Map(
      won.map((row) => [
        row.source,
        { count: row._count._all, value: row._sum.estimatedValue ?? 0 },
      ]),
    );

    return successResponse({
      data: sources.map((source) => ({
        ...source,
        leads30d: recentBySource.get(source.name) ?? 0,
        won: wonBySource.get(source.name)?.count ?? 0,
        valueWon: wonBySource.get(source.name)?.value ?? 0,
      })),
      windowDays: RECENT_WINDOW_DAYS,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/lead-sources error:", error);
    return errorResponse("Failed to fetch lead sources");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "settings.manage")) return errorResponse("Manager access required", 403);

    const data = createSchema.parse(await request.json());
    const source = await prisma.crmLeadSource.create({
      data: {
        companyId: session.user.companyId,
        name: data.name,
        channel: (data.channel ?? "OTHER") as never,
      },
    });
    return successResponse(source, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (typeof error === "object" && error && "code" in error && (error as { code: string }).code === "P2002") {
      return errorResponse("A lead source with this name already exists", 409);
    }
    console.error("[API] POST /api/v2/crm/lead-sources error:", error);
    return errorResponse("Failed to create lead source");
  }
}
