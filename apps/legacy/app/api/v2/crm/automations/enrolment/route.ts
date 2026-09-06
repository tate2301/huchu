import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { armedRules, type EnrolmentEntity } from "@/lib/crm/run-insights";

/**
 * What the workflows have done to this record, and what could still happen.
 *
 * "Why is this assigned to somebody I did not pick" and "will anything else
 * fire at this" are the same question asked at different times, and neither
 * had an answer anywhere on a record page. The run log answered the first
 * company-wide, which meant scrolling past everyone else's records to find
 * one line about yours.
 *
 * What is armed is derived rather than queued. The engine runs a rule the
 * moment its event happens, so nothing is literally pending — listing the
 * enabled rules whose trigger can reach this kind of record is the honest
 * version of "what is waiting", and drawing a spinner instead would be a
 * story about a queue that does not exist.
 */
const querySchema = z.object({
  entity: z.enum(["LEAD", "DEAL", "PERSON", "COMPANY", "SITE", "WORK_ORDER"]),
  recordId: z.string().uuid(),
});

const LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      entity: searchParams.get("entity"),
      recordId: searchParams.get("recordId"),
    });
    if (!parsed.success) return errorResponse("Which record?", 400);
    const { entity, recordId } = parsed.data;

    const [runs, rules] = await Promise.all([
      prisma.crmAutomationRun.findMany({
        where: { companyId: session.user.companyId, entity, recordId },
        select: {
          id: true,
          status: true,
          result: true,
          durationMs: true,
          actionCount: true,
          createdAt: true,
          automation: { select: { id: true, name: true, trigger: true } },
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      }),
      prisma.crmAutomation.findMany({
        where: { companyId: session.user.companyId },
        select: { id: true, name: true, trigger: true, isEnabled: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return successResponse({
      entity,
      recordId,
      runs,
      armed: armedRules(rules, entity as EnrolmentEntity),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/automations/enrolment error:", error);
    return errorResponse("Failed to load what has run against this record");
  }
}
