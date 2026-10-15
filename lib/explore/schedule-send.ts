import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { customDocumentSchema } from "@/lib/reports/custom/document";
import { renderReportFile } from "@/lib/reports/export-file";
import type { ReportFile } from "@/lib/reports/export-file";
import { applyView, defaultView } from "@/lib/reports/view";
import type { ReportMeta, ReportRow } from "@/lib/reports/types";

import { canUseExplore } from "./access";
import { questionReads, questionSql } from "./questions";
import { exploreReaderReady, exploreScope, runAsExploreReader } from "./reader";
import { exploreRoles } from "./runs";
import { questionDates } from "./tables";

/**
 * A saved question sent on its schedule (`ReportSchedule`, keyed by the
 * question's id), from the same cron as every report schedule
 * (`lib/reports/schedule-sender.ts`). For each recipient it runs as
 * `explore_reader` over that person's own tables, as if they had asked it, so
 * nobody is sent a row their role does not read; it is logged as theirs.
 */

export type ScheduledQuestion = { id: string; title: string; sql: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The question a schedule sends, when its key is a saved question over the real tables; null for a report. */
export async function scheduledQuestion(companyId: string, reportKey: string): Promise<ScheduledQuestion | null> {
  if (!UUID.test(reportKey)) return null;
  const report = await prisma.customReport.findFirst({ where: { id: reportKey, companyId }, select: { id: true, title: true, document: true } });
  if (!report) return null;
  const document = customDocumentSchema.safeParse(report.document);
  if (!document.success) return null;
  const sql = questionSql({ document: document.data });
  if (!sql || questionReads({ document: document.data }) !== "tables") return null;
  return { id: report.id, title: report.title, sql };
}

/** The question answered for one recipient, as a file; null when they cannot use Explore or it did not run. */
export async function questionFile(
  session: AuthenticatedSession,
  question: ScheduledQuestion,
  format: "csv" | "pdf",
  layout: "summary" | "layout",
): Promise<{ file: ReportFile; rows: number } | null> {
  if (!exploreReaderReady()) return null;
  if (!canUseExplore(session.user.role, await exploreRoles(prisma, session.user.companyId))) return null;
  const scope = await exploreScope({ role: session.user.role, enabledFeatures: session.user.enabledFeatures, workspaceProfile: session.user.workspaceProfile });
  const period = questionDates();
  const run = await runAsExploreReader({ companyId: session.user.companyId, userId: session.user.id, title: question.title }, question.sql, scope, period);
  if (!run.ok) return null;
  const meta: ReportMeta = { key: question.id, title: question.title, area: "Explore", columns: run.answer.columns, params: [], defaults: {} };
  const rows = run.answer.rows.map((row, index): ReportRow => ({ ...row, id: String(index + 1) }));
  const view = defaultView(meta);
  const applied = applyView(rows, meta.columns, view);
  const file = await renderReportFile({
    companyId: session.user.companyId,
    key: question.id,
    format,
    layout,
    meta,
    params: { from: period.from, to: period.to },
    applied,
    view,
    selected: false,
  });
  return { file, rows: applied.rows.length };
}
