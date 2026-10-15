import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canUseExplore, sourcesFor } from "@/lib/explore/access";
import { checkQuestion } from "@/lib/explore/guard";
import { questionSql } from "@/lib/explore/questions";
import { exploreReaderReady, READER_WAITING } from "@/lib/explore/reader";
import { prisma } from "@/lib/prisma";
import { readerOf } from "@/lib/reports/custom/sources";
import { readCustomReport } from "@/lib/reports/custom/store";
import { nextRunAt, scheduleInputSchema } from "@/lib/reports/schedule";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { sqlName } from "@/lib/reports/sql/schema";

/**
 * A saved question's schedule (the ExploreSchedule drawer): who it may go to,
 * and making one. It is stored as a report's schedule is (`ReportSchedule`,
 * keyed by the question's id), but sending it means running its SQL with
 * nobody's browser open, which needs Explore's own login: until that is
 * approved, `ready` is false and nothing is made.
 */

async function questionFor(request: NextRequest, id: string) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) return { response: sessionResult } as const;
  const { session } = sessionResult;
  if (!canUseExplore(session.user.role)) return { response: errorResponse("Only owners and managers use Explore", 403) } as const;
  const report = await readCustomReport(readerOf(session), id);
  const sql = report ? questionSql(report) : null;
  if (!report || !sql) return { response: errorResponse("Question not found", 404) } as const;
  return { session, report, sql } as const;
}

/** The people in the workspace whose role reads every table the question reads. */
async function readersOf(companyId: string, enabledFeatures: string[] | undefined, sql: string) {
  const every = new Set(REPORT_DEFINITIONS.map((definition) => sqlName(definition.key)));
  const checked = checkQuestion(sql, every);
  const reads = checked.ok ? checked.tables : [];
  const users = await prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
  return users.filter((user) => {
    const own = new Set(sourcesFor({ role: user.role, enabledFeatures }).map((definition) => sqlName(definition.key)));
    return reads.every((table) => own.has(table));
  }).map((user) => ({ id: user.id, name: user.name }));
}

export async function GET(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("question") ?? "";
    if (!z.string().uuid().safeParse(id).success) return errorResponse("Name the question", 400);
    const found = await questionFor(request, id);
    if ("response" in found) return found.response;
    const { session, sql } = found;
    return successResponse({
      ready: exploreReaderReady(),
      waiting: exploreReaderReady() ? null : READER_WAITING,
      people: await readersOf(session.user.companyId, session.user.enabledFeatures, sql),
    });
  } catch (error) {
    console.error("[API] GET /api/explore/schedules error:", error);
    return errorResponse("Could not read who this question can go to");
  }
}

const bodySchema = z.object({ question: z.string().uuid(), schedule: scheduleInputSchema });

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.safeParse(await request.clone().json().catch(() => null));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "That schedule could not be read", 400);
    const found = await questionFor(request, body.data.question);
    if ("response" in found) return found.response;
    if (!exploreReaderReady()) return errorResponse(READER_WAITING, 503);
    const { session, report, sql } = found;
    const input = body.data.schedule;
    const readers = new Set((await readersOf(session.user.companyId, session.user.enabledFeatures, sql)).map((person) => person.id));
    if (input.recipientIds.some((id) => !readers.has(id))) {
      return errorResponse("Only people whose role reads every table in the question can be sent it", 400);
    }
    const created = await prisma.reportSchedule.create({
      data: {
        companyId: session.user.companyId,
        reportKey: report.id,
        frequency: input.frequency,
        day: input.day,
        time: input.time,
        recipientIds: [...new Set(input.recipientIds)],
        format: input.format,
        content: input.content,
        query: "",
        createdById: session.user.id,
        active: true,
        nextRunAt: nextRunAt(input, new Date()),
      },
      select: { id: true },
    });
    return successResponse(created, 201);
  } catch (error) {
    console.error("[API] POST /api/explore/schedules error:", error);
    return errorResponse("The question was not scheduled");
  }
}
