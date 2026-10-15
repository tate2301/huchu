import { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-utils";
import { canUseExplore } from "@/lib/explore/access";
import { exploreGate } from "@/lib/explore/gate";
import { checkQuestion } from "@/lib/explore/guard";
import { questionReads, questionSql } from "@/lib/explore/questions";
import { exploreReaderReady, exploreScope, READER_WAITING } from "@/lib/explore/reader";
import { exploreRoles } from "@/lib/explore/runs";
import { prisma } from "@/lib/prisma";
import { readerOf } from "@/lib/reports/custom/sources";
import { readCustomReport } from "@/lib/reports/custom/store";
import { nextRunAt, scheduleInputSchema } from "@/lib/reports/schedule";

/**
 * A saved question's schedule (the ExploreSchedule drawer): who it may go to,
 * and making one. It is stored as a report's schedule is (`ReportSchedule`,
 * keyed by the question's id) and sent by the same cron
 * (`lib/explore/schedule-send.ts`), which runs it as `explore_reader` for each
 * recipient. A question saved over the report sources, rather than the
 * tables, runs only in a browser, so it cannot be sent; nor can anything
 * before Explore's own login is set up on this server.
 */

const SOURCES_WAITING = "This question reads reports, which run only in your browser. Save it again over your tables to send it.";

async function questionFor(request: NextRequest, id: string) {
  const gate = await exploreGate(request);
  if ("response" in gate) return gate;
  const { session } = gate;
  const report = await readCustomReport(readerOf(session), id);
  const sql = report ? questionSql(report) : null;
  if (!report || !sql) return { response: errorResponse("Question not found", 404) } as const;
  return { session, report, sql, reads: questionReads(report) } as const;
}

/** The people in the workspace who may use Explore and whose role reads every table the question reads. */
async function readersOf(companyId: string, enabledFeatures: string[] | undefined, workspaceProfile: string | null | undefined, sql: string) {
  const [users, roles] = await Promise.all([
    prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    exploreRoles(prisma, companyId),
  ]);
  const reads = new Map<string, boolean>();
  for (const role of new Set(users.map((user) => user.role))) {
    if (!canUseExplore(role, roles)) {
      reads.set(role, false);
      continue;
    }
    const scope = await exploreScope({ role, enabledFeatures, workspaceProfile });
    reads.set(role, checkQuestion(sql, new Set(scope.tables.map((table) => table.name))).ok);
  }
  return users.filter((user) => reads.get(user.role)).map((user) => ({ id: user.id, name: user.name }));
}

export async function GET(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("question") ?? "";
    if (!z.string().uuid().safeParse(id).success) return errorResponse("Name the question", 400);
    const found = await questionFor(request, id);
    if ("response" in found) return found.response;
    const { session, sql, reads } = found;
    const ready = exploreReaderReady() && reads === "tables";
    return successResponse({
      ready,
      waiting: ready ? null : exploreReaderReady() ? SOURCES_WAITING : READER_WAITING,
      people: ready ? await readersOf(session.user.companyId, session.user.enabledFeatures, session.user.workspaceProfile, sql) : [],
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
    const { session, report, sql, reads } = found;
    if (reads !== "tables") return errorResponse(SOURCES_WAITING, 409);
    const input = body.data.schedule;
    const readers = new Set((await readersOf(session.user.companyId, session.user.enabledFeatures, session.user.workspaceProfile, sql)).map((person) => person.id));
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
