/**
 * Keeping a view of a report from Vane's answer, against the test database:
 * the template starts from the report as it opens, with Vane's grouping and
 * filters over it (a column the report does not have is dropped), is just
 * the approver's, and is refused to someone who cannot open the report.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { reportFeatureKey } from "@/lib/reports/access";
import { getReportDefinition } from "@/lib/reports/registry";
import { prisma } from "@/lib/prisma";

import { OPERATIONS } from "@/lib/operations/registry";
import { OperationRefused, type OperationActor } from "@/lib/operations/types";

const suffix = randomUUID().slice(0, 8);
const ids = { company: "", user: "" };

const context = (features: string[]): OperationActor => ({
  companyId: ids.company,
  userId: ids.user,
  role: "MANAGER",
  session: { user: { id: ids.user, companyId: ids.company, role: "MANAGER", enabledFeatures: features } } as unknown as AuthenticatedSession,
  requestUrl: "http://vane.test/api/vane/actions/x",
  via: { kind: "integration", integration: "vane" },
});

const keep = OPERATIONS.find((action) => action.key === "reports.template.save")!;
const params = {
  reportKey: "crm-deals",
  report: "Deals",
  name: "Deals gone quiet",
  groupBy: "owner",
  conditions: [
    { column: "stage", op: "is", value: "Negotiating" },
    { column: "nowhere", op: "is", value: "x" },
  ],
};

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Vane reports ${suffix}`, slug: `vane-reports-${suffix}` } });
  const user = await prisma.user.create({ data: { email: `farai-${suffix}@vane.test`, name: "Farai", password: "x", role: "MANAGER", companyId: company.id } });
  Object.assign(ids, { company: company.id, user: user.id });
});

afterAll(async () => {
  await prisma.reportTemplate.deleteMany({ where: { companyId: ids.company } });
  await prisma.user.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
});

describe("keeping a view of a report", () => {
  it("saves the report as it opens, grouped and filtered as Vane answered, just for the approver", async () => {
    const feature = reportFeatureKey(getReportDefinition("crm-deals")!);
    const said = await keep.run(context(feature ? [feature] : []), keep.input.parse(params) as never);
    expect(said).toBe("“Deals gone quiet” is under your reports.");
    const template = await prisma.reportTemplate.findFirstOrThrow({ where: { companyId: ids.company } });
    expect(template).toMatchObject({ reportKey: "crm-deals", name: "Deals gone quiet", audience: "JUST_ME", createdById: ids.user });
    const view = template.view as { groupBy: string; conditions: Array<{ column: string }>; columns: unknown[] };
    expect(view.groupBy).toBe("owner");
    expect(view.conditions.map((condition) => condition.column)).toEqual(["stage"]);
    expect(view.columns.length).toBeGreaterThan(3);
  });

  it("is refused to someone who cannot open the report", async () => {
    await expect(keep.run(context([]), keep.input.parse(params) as never)).rejects.toBeInstanceOf(OperationRefused);
  });
});
