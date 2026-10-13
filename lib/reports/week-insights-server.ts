import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { readCustomReport } from "@/lib/reports/custom/store";
import { readerOf } from "@/lib/reports/custom/sources";
import { getReportDefinition } from "@/lib/reports/registry";
import { fetchReport } from "@/lib/reports/request";
import { defaultView, encodeView } from "@/lib/reports/view";
import { audienceFilter } from "@/lib/vane/status";
import {
  insightFromVaneItem,
  insightMoney,
  RECIPE_REPORTS,
  scheduleWords,
  weekFinding,
  workedOutInsights,
  type RecipeInput,
  type WeekInsights,
} from "@/lib/reports/week-insights";

const WEEK = 7 * 86_400_000;

/**
 * The week's insights for this person: Vane's INSIGHT items from the last
 * week that they may see, or, where Vane has written none, what the rows of
 * the reports they can open say. Reads only.
 */
export async function loadWeekInsights(session: AuthenticatedSession, now = new Date()): Promise<WeekInsights> {
  const { companyId, id: userId, role } = session.user;
  const [settings, items] = await Promise.all([
    prisma.vaneSettings.findUnique({ where: { companyId }, select: { insightsSchedule: true, insightsBoardId: true } }),
    prisma.vaneItem.findMany({
      where: { companyId, kind: "INSIGHT", status: "OPEN", createdAt: { gte: new Date(now.getTime() - WEEK) }, ...audienceFilter(userId, role) },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, headline: true, body: true, action: true, readFrom: true },
    }),
  ]);

  const chosen = settings?.insightsBoardId ? await readCustomReport(readerOf(session), settings.insightsBoardId) : null;
  const board = chosen && chosen.editable ? { id: chosen.id, title: chosen.title } : null;
  const schedule = scheduleWords(settings?.insightsSchedule);

  if (items.length > 0) {
    const titleOf = (key: string) => getReportDefinition(key)?.title ?? null;
    const insights = items.map((item) => insightFromVaneItem(item, titleOf));
    const read = [
      ...new Set(
        items.flatMap((item) =>
          Array.isArray(item.readFrom)
            ? item.readFrom.flatMap((entry) => {
                const template = (entry as Record<string, unknown> | null)?.template;
                return typeof template === "string" && titleOf(template) ? [titleOf(template)!] : [];
              })
            : [],
        ),
      ),
    ];
    return { source: "vane", finding: weekFinding("vane", read, insights.length), schedule, board, insights };
  }

  const inputs: RecipeInput[] = [];
  const read: string[] = [];
  for (const key of RECIPE_REPORTS) {
    // A report this person cannot open, or the workspace switched off, is not read.
    const report = await fetchReport(session, key, {});
    if (!report) continue;
    read.push(report.meta.title);
    const base = defaultView(report.meta);
    inputs.push({
      key,
      rows: report.rows,
      hrefGroupedBy: (column) =>
        column ? `/reports/${key}?v=${encodeView({ ...base, groupBy: column })}` : `/reports/${key}`,
    });
  }
  const insights = workedOutInsights(inputs, insightMoney);
  const used = new Set(insights.map((insight) => insight.pin?.reportKey));
  const named = inputs.filter((input) => used.has(input.key)).map((input) => getReportDefinition(input.key)?.title ?? input.key);
  return { source: "rows", finding: weekFinding("rows", named.length ? named : read, insights.length), schedule, board, insights };
}
