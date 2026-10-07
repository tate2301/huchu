/**
 * The site-visit form sources, against a real database: a form made from the
 * epoxy template, measured on a visit, reads back as what it measured, the
 * quote it drafted and how the deal went.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { saveAnswers } from "@/lib/crm/site-visits/answers";
import { builderTemplate, createQuestionSetFrom } from "@/lib/crm/site-visits/builder-templates";
import { CRM_LOADERS } from "@/lib/reports/loaders/crm";

const SLUG = "visit-forms-report-test";
let companyId = "";
let userId = "";

beforeAll(async () => {
  const company = await prisma.company.upsert({ where: { slug: SLUG }, update: {}, create: { name: "Visit forms report", slug: SLUG } });
  companyId = company.id;
  await prisma.crmQuestionSet.deleteMany({ where: { companyId } });
  await prisma.crmAppointment.deleteMany({ where: { companyId } });
  const user = await prisma.user.upsert({
    where: { email: "visit-forms-report@example.invalid" },
    update: {},
    create: { email: "visit-forms-report@example.invalid", name: "Rutendo Moyo", companyId, role: "CLERK" },
  });
  userId = user.id;

  const set = await prisma.$transaction((tx) => createQuestionSetFrom(tx, companyId, userId, builderTemplate("epoxy_flooring_survey")));
  const appointment = await prisma.crmAppointment.create({
    data: { companyId, appointmentNo: "SVT-VF-1", title: "Avondale Fresh Mart", assignedToId: userId, scheduledStart: new Date() },
  });
  const section = await prisma.crmSiteVisitSection.create({
    data: { companyId, appointmentId: appointment.id, questionSetId: set.id, name: set.name, kind: "PRODUCT" },
  });
  await prisma.$transaction((tx) =>
    saveAnswers({ tx, companyId, sectionId: section.id, answeredById: userId }, [
      { questionKey: "areas", value: [{ name: "Shop floor", length: 12, width: 20 }] },
      { questionKey: "moisture", value: 4.6 },
      { questionKey: "colour", notApplicable: true },
    ]),
  );
});

afterAll(async () => {
  await prisma.crmAppointment.deleteMany({ where: { companyId } });
  await prisma.crmQuestionSet.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

const ctx = () => ({ companyId, userId, role: "MANAGER" });

describe("site visit forms", () => {
  it("reads one row per form filled in, with what it measured and drafted", async () => {
    const { rows } = await CRM_LOADERS["crm-visit-forms"].load(ctx(), {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      visitNo: "SVT-VF-1",
      form: "Epoxy flooring survey",
      rep: "Rutendo Moyo",
      answered: 3,
      measured: 240,
      // 240 m² × 1.08 × 32 + 240 × 6 + the damp-proof primer at 4.6%: 240 × 7.5
      drafted: 8294.4 + 1440 + 1800,
      outcome: null,
    });
  });

  it("reads every answer as it reads on the visit", async () => {
    const { rows } = await CRM_LOADERS["crm-visit-answers"].load(ctx(), {});
    const byKey = new Map(rows.map((row) => [row.questionKey, row]));
    expect(byKey.get("areas")).toMatchObject({ answer: "1 area, 240.00 m²", figure: 240 });
    expect(byKey.get("moisture")).toMatchObject({ figure: 4.6 });
    expect(byKey.get("colour")).toMatchObject({ answer: "Not applicable", figure: null, notApplicable: "Yes" });
  });

  it("stays in its own workspace", async () => {
    const { rows } = await CRM_LOADERS["crm-visit-forms"].load({ ...ctx(), companyId: "someone-else" }, {});
    expect(rows).toEqual([]);
  });
});
