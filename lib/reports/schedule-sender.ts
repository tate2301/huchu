import { enrichTokenClaims } from "@/lib/auth-core/session-claims";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { buildNotificationEmail } from "@/lib/notification-email";
import { buildWorkspaceUrl } from "@/lib/platform/tenant-url";
import { prisma } from "@/lib/prisma";
import { renderReportFile } from "@/lib/reports/export-file";
import { fetchReport, paramsFromSearch } from "@/lib/reports/request";
import { describeWhen, dueSchedules, layoutFor, nextRunAt } from "@/lib/reports/schedule";
import { applyView, decodeView, defaultView, fitView } from "@/lib/reports/view";
import { getSiteUrl } from "@/lib/site-url";
import { formatMediumDay } from "@/lib/workspace/format";

/**
 * Sends the reports whose time has come (Send it, `ReportSchedule`).
 *
 * Each due schedule is claimed first — its `nextRunAt` moved on only if it
 * still holds the slot this run read — so two runs at once, or a run repeated,
 * send each slot once. Then, for each recipient, the report is fetched as that
 * person (their role, their features: someone who can no longer open it gets
 * nothing), rendered the way Export renders it, and emailed with the app's
 * mailer. A schedule a person stopped is never picked.
 */

/** A session for one person, read from the database as a sign-in would read it; null when they are gone. */
async function sessionFor(userId: string, companyId: string): Promise<AuthenticatedSession | null> {
  const user = await prisma.user.findFirst({ where: { id: userId, companyId, isActive: true }, select: { id: true, name: true, email: true } });
  if (!user) return null;
  const claims = await enrichTokenClaims({ id: user.id, companyId });
  if (!claims.role) return null;
  return {
    expires: new Date(Date.now() + 10 * 60_000).toISOString(),
    user: {
      ...claims,
      id: user.id,
      name: user.name,
      email: user.email,
      role: claims.role,
      companyId,
    },
  } as AuthenticatedSession;
}

type Due = Awaited<ReturnType<typeof readDue>>[number];

function readDue(now: Date) {
  return prisma.reportSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: 200,
    include: { company: { select: { name: true, slug: true } } },
  });
}

/** One schedule to each of its recipients. How many it reached. */
async function sendOne(schedule: Due, now: Date): Promise<number> {
  const search = new URLSearchParams(schedule.query);
  const params = paramsFromSearch(search);
  const path = `/reports/${schedule.reportKey}${schedule.query ? `?${schedule.query}` : ""}`;
  const link = schedule.company.slug
    ? buildWorkspaceUrl({ slug: schedule.company.slug, path, currentUrl: getSiteUrl() }).toString()
    : new URL(path, getSiteUrl()).toString();
  const format = schedule.format === "CSV" ? "csv" : "pdf";

  let reached = 0;
  for (const recipientId of schedule.recipientIds) {
    try {
      const session = await sessionFor(recipientId, schedule.companyId);
      if (!session?.user.email) continue;
      const report = await fetchReport(session, schedule.reportKey, params);
      if (!report) continue; // They can no longer open it: they are sent nothing.
      const view = fitView(decodeView(search.get("v")) ?? defaultView(report.meta), report.meta.columns);
      const applied = applyView(report.rows, report.meta.columns, view);
      const file = await renderReportFile({
        companyId: schedule.companyId,
        key: schedule.reportKey,
        format,
        layout: layoutFor(schedule.content),
        meta: report.meta,
        params: report.params,
        applied,
        view,
        selected: false,
      });
      const rows = applied.rows.length;
      const { subject, text, html } = buildNotificationEmail({
        title: `${report.meta.title}, ${formatMediumDay(now)}`,
        summary: `${rows.toLocaleString("en-US")} ${rows === 1 ? "row" : "rows"}, attached as ${file.fileName}. Sent ${describeWhen(schedule).toLowerCase()}.`,
        link,
        workspaceName: schedule.company.name,
      });
      await sendEmail({
        to: session.user.email,
        subject,
        text,
        html,
        sender: { name: schedule.company.name },
        attachments: [{ filename: file.fileName, content: file.body }],
      });
      reached += 1;
    } catch (error) {
      console.error("[report-schedules] send failed", { schedule: schedule.id, recipientId, error });
    }
  }
  return reached;
}

/** Sends every due schedule once and says what it did, in one line. */
export async function sendDueReportSchedules(now: Date = new Date()): Promise<string> {
  if (!isEmailConfigured()) return "email is not set up; nothing sent";
  const due = dueSchedules(await readDue(now), now);
  let sent = 0;
  let skipped = 0;
  for (const schedule of due) {
    // Claim the slot: only the run that moves it on sends it.
    const claimed = await prisma.reportSchedule.updateMany({
      where: { id: schedule.id, active: true, nextRunAt: schedule.nextRunAt },
      data: { nextRunAt: nextRunAt(schedule, now) },
    });
    if (claimed.count === 0) {
      skipped += 1;
      continue;
    }
    const reached = await sendOne(schedule, now);
    if (reached > 0) {
      await prisma.reportSchedule.update({ where: { id: schedule.id }, data: { lastSentAt: now } });
      sent += 1;
    }
  }
  return `${sent} of ${due.length} due sent${skipped ? `, ${skipped} already taken by another run` : ""}`;
}
