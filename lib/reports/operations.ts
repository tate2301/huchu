import { z } from "zod";

import { reportMeta } from "@/lib/reports/catalog";
import { getReportDefinition } from "@/lib/reports/registry";
import { readReportSetting } from "@/lib/reports/settings";
import { createTemplate } from "@/lib/reports/templates";
import { CONDITION_OPS } from "@/lib/reports/types";
import { defaultView } from "@/lib/reports/view";

import { routeGate } from "@/lib/operations/gate";
import { OperationRefused, type Operation } from "@/lib/operations/types";

type Params = {
  reportKey: string;
  report: string;
  name: string;
  description?: string;
  groupBy?: string;
  conditions?: Array<{ column: string; op: (typeof CONDITION_OPS)[number]; value?: string | string[] }>;
  search?: string;
};

const keepView = {
  key: "reports.template.save",
  name: "Keep a view of a report",
  risk: "change",
  product: "reports",
  description:
    "Keep a view of a report as a template under the person's own reports, just for them: the report as it opens, grouped, filtered or searched the way you answered with. Use the report's own column keys (describe_report). Name it for what it shows: \"Deals gone quiet\".",
  input: z.object({
    reportKey: z.string().min(1).max(64),
    report: z.string().min(1).max(120).describe("The report's title, as the catalogue shows it."),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(240).optional(),
    groupBy: z.string().max(64).optional(),
    conditions: z
      .array(z.object({ column: z.string().max(64), op: z.enum(CONDITION_OPS), value: z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]).optional() }))
      .max(10)
      .optional(),
    search: z.string().max(200).optional(),
  }),
  fields: [
    { name: "name", label: "Name", type: "text" },
    { name: "description", label: "What it is for", type: "text" },
  ],
  verb: () => "Save as a template",
  title: (p) => `Keep ${p.report}${p.groupBy || p.conditions?.length ? ", as you asked about it," : ""} as “${p.name}”`,
  target: (p) => `/reports/${p.reportKey}`,
  authorize: (context) => routeGate(context, "/api/v2/reports/templates"),
  async run(context, p) {
    const definition = getReportDefinition(p.reportKey);
    if (!definition) throw new OperationRefused(`There is no report ${p.report} any more.`);
    // The report as it opens for this person, with Vane's grouping, filters and search over it.
    const base = defaultView(reportMeta(definition, context.role, definition.params, await readReportSetting(context.companyId, p.reportKey)));
    const view = {
      ...base,
      ...(p.groupBy !== undefined ? { groupBy: p.groupBy } : {}),
      ...(p.conditions ? { conditions: p.conditions } : {}),
      ...(p.search !== undefined ? { search: p.search } : {}),
    };
    const outcome = await createTemplate(context.session, {
      reportKey: p.reportKey,
      name: p.name,
      description: p.description ?? null,
      audience: "JUST_ME",
      view,
      params: {},
      keepDates: false,
    });
    if (!outcome.ok) throw new OperationRefused(outcome.status === 403 ? "You cannot keep templates of this report." : `You cannot open ${p.report}.`);
    return `“${outcome.template.name}” is under your reports.`;
  },
} satisfies Operation<Params>;

export const REPORTS_OPERATIONS = [keepView] as const;
