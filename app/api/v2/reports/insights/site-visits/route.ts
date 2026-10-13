import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { loadFormInsights, visitFormChoices } from "@/lib/crm/site-visits/insights";
import { canReadReport } from "@/lib/reports/access";
import { startOfDayIn } from "@/lib/reports/list-query";
import { getReportDefinition } from "@/lib/reports/registry";
import { addDays, DEFAULT_TIME_ZONE } from "@/lib/workspace/format";
import { requireCrmCapability } from "../../../crm/_helpers";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reports → Insights → Site visits (PageInsightVisits): one site-visit form's
 * visits, read the way the form's own insights read them. `form` picks the
 * form (the most used when it is left out), `rep` one rep's visits, and
 * `from`/`to` (days, Harare) the days the visits were made; without them,
 * every visit. Open to whoever can open the Site visit forms report.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const definition = getReportDefinition("crm-visit-forms");
    if (!definition || !canReadReport(definition, { role: session.user.role, enabledFeatures: session.user.enabledFeatures })) {
      return errorResponse("Your role cannot open the site visits", 403);
    }
    const search = request.nextUrl.searchParams;
    const from = search.get("from");
    const to = search.get("to");
    if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return errorResponse("Those dates could not be read", 400);

    const companyId = session.user.companyId;
    const choices = await visitFormChoices(prisma, companyId);
    const asked = search.get("form");
    const form = (asked ? choices.forms.find((candidate) => candidate.id === asked) : choices.forms[0]) ?? null;
    if (asked && !form) return errorResponse("That form is not in this workspace", 404);
    const rep = search.get("rep");
    if (rep && !choices.reps.some((candidate) => candidate.id === rep)) return errorResponse("That rep made no visits here", 404);

    const found = form
      ? await prisma.$transaction((tx) =>
          loadFormInsights(tx, companyId, form.id, {
            from: from ? startOfDayIn(from, DEFAULT_TIME_ZONE) : null,
            to: to ? new Date(startOfDayIn(addDays(to, 1), DEFAULT_TIME_ZONE).getTime() - 1) : null,
            repId: rep,
          }),
        )
      : null;
    return successResponse({
      forms: choices.forms,
      reps: choices.reps,
      form: form ? { id: form.id, name: found?.name ?? form.name } : null,
      insights: found?.insights ?? null,
      canEdit: await requireCrmCapability(session, "settings.manage"),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/insights/site-visits error:", error);
    return errorResponse("Failed to read the site visits");
  }
}
