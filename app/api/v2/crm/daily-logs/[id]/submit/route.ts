/**
 * Closing the day — and, in the same breath, the report going to management.
 *
 * James asked for a daily report "which is automatically sent to management".
 * Automatic, here, means the person does not write it: they close their day,
 * and the report assembles itself from what they already recorded and goes.
 * A nightly cron would also be automatic and would be worse — it would send
 * management a report of a day the person had not finished writing up.
 *
 * The notification is best-effort. A mail or notification failure must not
 * leave the day un-submitted, because the person would submit again and the
 * second attempt would be refused as already closed.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { submitDailyLog } from "@/lib/crm/daily-log";
import { reportHeadline, saveDailyReport, type DailyReportSummary } from "@/lib/crm/daily-report";
import { emitCrmNotification, getCrmManagerRecipients } from "@/lib/notifications";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const log = await prisma.crmDailyLog.findFirst({
      where: { id, companyId },
      select: { id: true, userId: true, logDate: true, submittedAt: true },
    });
    if (!log) return errorResponse("Daily log not found", 404);
    if (log.userId !== session.user.id) {
      return errorResponse("You can only submit your own day", 403);
    }

    const { submitted, report } = await prisma.$transaction(async (tx) => {
      const submitted = await submitDailyLog(tx, companyId, id);
      const report = await saveDailyReport(tx, companyId, log.userId, log.logDate);
      return { submitted, report };
    });

    const summary = report.summary as unknown as DailyReportSummary;

    try {
      const recipientIds = await getCrmManagerRecipients(companyId, log.userId);
      if (recipientIds.length > 0) {
        await emitCrmNotification({
          companyId,
          recipientIds,
          type: "CRM_DAILY_REPORT_READY",
          title: `${summary.person.name ?? "Somebody"} — ${summary.date}`,
          summary:
            summary.flags.length > 0
              ? `${reportHeadline(summary)}. ${summary.flags[0]}`
              : reportHeadline(summary),
          entityType: "CRM_DAILY_REPORT",
          entityId: report.id,
          viewPath: `/crm/daily-reports/${report.id}`,
          severity: summary.flags.length > 0 ? "WARNING" : "INFO",
        });
        await prisma.crmDailyReport.update({
          where: { id: report.id },
          data: { sentAt: new Date() },
        });
      }
    } catch (error) {
      // The day is closed either way. Losing the notice is recoverable; a day
      // that refuses to close because of it is not.
      console.error("[API] daily report notification failed:", error);
    }

    return successResponse({ log: submitted, report });
  } catch (error) {
    if (error instanceof Error && error.message.includes("before submitting")) {
      return errorResponse(error.message, 400);
    }
    console.error("[API] POST /api/v2/crm/daily-logs/[id]/submit error:", error);
    return errorResponse("Failed to submit the day");
  }
}
