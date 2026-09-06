import "@/scripts/lib/env";
/**
 * A payroll workspace to look at.
 *
 * Not a fixture — a demo tenant with enough shape that the screens show real
 * numbers: a dual-currency workforce, one employee deliberately missing a BP
 * number so the blocker path renders, an approved run, and a posted journal.
 */
import { prisma } from "@corelithzw/db/client";
import { ensureAccountingDefaults } from "@corelithzw/module-books/bootstrap";
import { seedZimbabweStatutoryPack } from "@/lib/hr/statutory/zimbabwe-pack";
import { seedZimbabweLeavePack } from "@/lib/people/leave/zimbabwe-pack";
import { countWorkingDays, holidayKeysForSite } from "@/lib/people/leave/working-days";
import { FEATURE_BUNDLES, FEATURE_CATALOG, TIERS } from "@corelithzw/platform/feature-catalog";
import {
  getClientTemplateBundleCodes,
  getClientTemplateDisabledFeatureKeys,
  getClientTemplateFeatureKeys,
} from "@corelithzw/platform/client-templates";
import { assembleSalaryRun } from "@/lib/hr/payroll/assemble";
import { postPayrollRun } from "@/lib/hr/payroll/posting";
import bcrypt from "bcryptjs";

const SLUG = "payroll-demo";
const PERIOD_KEY = "2026-08";
const START = new Date("2026-08-01T00:00:00.000Z");
const END = new Date("2026-08-31T23:59:59.999Z");

async function main() {
  // Re-runnable. The company cascade cannot clear everything on its own — the
  // accounting seed leaves tax templates whose lines reference tax codes — so the
  // payroll rows go first and by name, rather than being swallowed by a `catch`
  // that leaves the tenant half-deleted and the next run failing on the slug.
  const existing = await prisma.company.findUnique({
    where: { slug: SLUG },
    select: { id: true },
  });
  if (existing) {
    const companyId = existing.id;
    await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
    await prisma.payrollLineComponent.deleteMany({
      where: { lineItem: { run: { companyId } } },
    });
    await prisma.employeePayment.deleteMany({ where: { employee: { companyId } } });
    await prisma.disbursementItem.deleteMany({
      where: { batch: { companyId } },
    });
    await prisma.disbursementBatch.deleteMany({ where: { companyId } });
    await prisma.hrIncident.deleteMany({ where: { companyId } });
    await prisma.shiftGroupMember.deleteMany({
      where: { shiftGroup: { companyId } },
    });
    await prisma.shiftGroup.deleteMany({ where: { companyId } });
    await prisma.payrollLineItem.deleteMany({ where: { run: { companyId } } });
    await prisma.approvalAction.deleteMany({ where: { companyId } });
    await prisma.payrollRun.deleteMany({ where: { companyId } });
    await prisma.payrollPeriod.deleteMany({ where: { companyId } });
    await prisma.compensationProfile.deleteMany({ where: { employee: { companyId } } });
    await prisma.compensationRule.deleteMany({ where: { companyId } });
    await prisma.employee.deleteMany({ where: { companyId } });
    await prisma.department.deleteMany({ where: { companyId } });
    await prisma.payeTable.deleteMany({ where: { companyId } });
    await prisma.statutoryRate.deleteMany({ where: { companyId } });
    await prisma.taxCredit.deleteMany({ where: { companyId } });
    await prisma.necAgreement.deleteMany({ where: { companyId } });
    await prisma.leaveRequest.deleteMany({ where: { companyId } });
    await prisma.leaveEntitlement.deleteMany({ where: { companyId } });
    await prisma.leaveType.deleteMany({ where: { companyId } });
    await prisma.publicHoliday.deleteMany({ where: { companyId } });
    await prisma.currencyRate.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.companyFeatureFlag.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.taxRule.deleteMany({ where: { companyId } });
    await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
    await prisma.taxTemplate.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }

  const company = await prisma.company.create({
    data: {
      name: "Kariba Payroll Bureau",
      slug: SLUG,
      workspaceProfile: "PAYROLL",
      // Auth refuses a tenant that is still PROVISIONING, so a demo left at the
      // default cannot be signed into at all.
      tenantStatus: "ACTIVE",
      // Without this the onboarding provider decides the workspace is unset up
      // and opens a modal over every screen that cannot be dismissed until the
      // wizard is finished.
      isProvisioned: true,
    },
    select: { id: true },
  });
  const companyId = company.id;

  // No site. A bureau has an office, not a shaft — and now that sites are
  // optional the demo stops pretending otherwise. This is the case that proved
  // the requirement was wrong: the only way past onboarding used to be inventing
  // one.

  const admin = await prisma.user.create({
    data: {
      companyId,
      // The email domain carries the tenant: `<slug>.test` matches how the school
      // demo tenant is addressed, and auth resolves the tenant from it.
      email: "rudo.chirwa@payroll-demo.test",
      name: "Rudo Chirwa",
      password: await bcrypt.hash("Password123!", 10),
      role: "MANAGER",
      isActive: true,
    },
    select: { id: true },
  });

  await ensureAccountingDefaults(companyId);
  await seedZimbabweStatutoryPack({ companyId });
  await seedZimbabweLeavePack({ companyId, year: 2026 });

  // What the bureau buys: the template's recommended tier and its bundles, plus
  // accounting bought separately so the journal seam has a ledger to post into.
  // Going up a tier for accounting would drag maintenance and the portal suite
  // in with it, and a payroll bureau has neither.
  const TEMPLATE_CODE = "TEMPLATE_PAYROLL_BUREAU";
  const TIER_CODE = "STANDARD";
  const bureauBundleCodes = [
    ...getClientTemplateBundleCodes(TEMPLATE_CODE),
    "ADDON_ACCOUNTING_CORE",
  ];

  // A tenant with no subscription is refused at sign-in: getSubscriptionHealth
  // returns MISSING_SUBSCRIPTION with shouldBlock, which turns an ACTIVE tenant
  // status inactive in the credentials callback. So the demo needs a real
  // subscription row, not just the ACTIVE flag above. It is also what entitles
  // the billable feature keys — a CompanyFeatureFlag on a billable feature that
  // no tier or bundle entitles is ignored by getCompanyFeatureMap.
  const tier = TIERS.find((candidate) => candidate.code === TIER_CODE) ?? TIERS[0];
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: tier.code },
    update: { name: tier.name, isActive: true },
    create: {
      code: tier.code,
      name: tier.name,
      description: tier.description,
      monthlyPrice: tier.monthlyPrice,
      currency: "USD",
      warningDays: tier.warningDays,
      graceDays: tier.graceDays,
      isActive: true,
    },
    select: { id: true },
  });

  await prisma.companySubscription.create({
    data: { companyId, planId: plan.id, status: "ACTIVE" },
  });

  for (const code of bureauBundleCodes) {
    const definition = FEATURE_BUNDLES.find((bundle) => bundle.code === code);
    if (!definition) continue;
    const bundle = await prisma.featureBundle.upsert({
      where: { code: definition.code },
      update: { name: definition.name, isActive: true },
      create: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        monthlyPrice: definition.monthlyPrice,
        additionalSiteMonthlyPrice: definition.additionalSiteMonthlyPrice,
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.companySubscriptionAddon.upsert({
      where: { companyId_bundleId: { companyId, bundleId: bundle.id } },
      update: { isEnabled: true },
      create: { companyId, bundleId: bundle.id, isEnabled: true },
    });
  }

  // Turn on the payroll surface. Ask the template what it grants rather than
  // listing keys here — that applies its disabledFeatureKeys too, so the
  // sidebar is the payroll-only one a real bureau would see rather than the
  // tier's full base set with stores and gold hanging off it. The accounting
  // bundle is unioned in separately because it sits outside the template.
  const disabledKeys = new Set(getClientTemplateDisabledFeatureKeys(TEMPLATE_CODE));
  const bureauKeys = new Set(getClientTemplateFeatureKeys(TEMPLATE_CODE, TIER_CODE));
  for (const key of FEATURE_BUNDLES.find(
    (bundle) => bundle.code === "ADDON_ACCOUNTING_CORE",
  )?.features ?? []) {
    if (!disabledKeys.has(key)) bureauKeys.add(key);
  }

  // Writing only the enabled keys is not enough. A key the bureau never asked
  // for can still be on, because a non-billable catalog feature defaults to
  // enabled and a billable one rides in on the tier. The disabled keys need an
  // explicit `false` row, which is what provisioning writes too — otherwise the
  // sidebar carries Stores and Maintenance into a payroll workspace.
  const flagStates = new Map<string, boolean>();
  for (const key of bureauKeys) flagStates.set(key, true);
  for (const key of disabledKeys) flagStates.set(key, false);

  for (const [key, isEnabled] of flagStates) {
    const catalog = FEATURE_CATALOG.find((feature) => feature.key === key);
    const feature = await prisma.platformFeature.upsert({
      where: { key },
      update: {},
      create: {
        key,
        name: catalog?.name ?? key,
        description: catalog?.description,
        domain: catalog?.domain,
        defaultEnabled: false,
        isBillable: catalog?.isBillable ?? false,
      },
      select: { id: true },
    });
    await prisma.companyFeatureFlag.upsert({
      where: { companyId_featureId: { companyId, featureId: feature.id } },
      update: { isEnabled },
      create: { companyId, featureId: feature.id, isEnabled },
    });
  }

  await prisma.currencyRate.create({
    data: {
      companyId,
      baseCurrency: "USD",
      quoteCurrency: "ZWG",
      rate: 27.5,
      effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
    },
  });

  const dept = await prisma.department.create({
    data: { companyId, name: "Operations", code: "OPS" },
    select: { id: true },
  });

  const people: Array<[string, string, string, string, string | null, boolean]> = [
    // name, employeeId, base, currency, taxNumber, hasDisability
    ["Ada Moyo", "EMP-001", "1450", "USD", "BP1000001", false],
    ["Tendai Zulu", "EMP-002", "820", "USD", "BP1000002", false],
    ["Chipo Nyoni", "EMP-003", "2600", "USD", "BP1000003", false],
    ["Farai Dube", "EMP-004", "540", "USD", null, false],
    ["Tapiwa Gumbo", "EMP-005", "41250", "ZWG", "BP1000005", false],
    ["Nyasha Banda", "EMP-006", "19800", "ZWG", "BP1000006", true],
  ];

  const createdEmployees: Array<{ id: string; name: string }> = [];

  for (const [name, employeeId, base, currency, taxNumber, hasDisability] of people) {
    const employee = await prisma.employee.create({
      data: {
        companyId,
        employeeId,
        name,
        jobTitle: "Operations Officer",
        departmentId: dept.id,
        phone: "0770000000",
        nextOfKinName: "Next of kin",
        nextOfKinPhone: "0770000001",
        passportPhotoUrl: "https://example.invalid/p.jpg",
        villageOfOrigin: "Harare",
        defaultCurrency: currency,
        taxNumber,
        nssaNumber: taxNumber ? `NSSA-${employeeId}` : null,
        hasDisability,
        overtimeHourlyRate: currency === "USD" ? "9.25" : null,
      },
      select: { id: true },
    });
    createdEmployees.push({ id: employee.id, name: String(name) });

    await prisma.compensationProfile.create({
      data: {
        employeeId: employee.id,
        baseAmount: base,
        currency,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        workflowStatus: "APPROVED",
        createdById: admin.id,
      },
    });
  }

  // A taxable housing allowance and a pre-tax pension, so the payslip has stages.
  await prisma.compensationRule.create({
    data: {
      companyId,
      name: "Housing allowance",
      type: "ALLOWANCE",
      calcMethod: "PERCENT",
      value: "10",
      taxable: true,
      currency: "USD",
      isActive: true,
      workflowStatus: "APPROVED",
      createdById: admin.id,
    },
  });
  await prisma.compensationRule.create({
    data: {
      companyId,
      name: "Pension",
      type: "DEDUCTION",
      calcMethod: "PERCENT",
      value: "5",
      currency: "USD",
      isActive: true,
      workflowStatus: "APPROVED",
      statutoryKey: "PENSION",
      createdById: admin.id,
    },
  });
  await prisma.compensationRule.create({
    data: {
      companyId,
      name: "Medical aid",
      type: "DEDUCTION",
      calcMethod: "FIXED",
      value: "95",
      currency: "USD",
      isActive: true,
      workflowStatus: "APPROVED",
      statutoryKey: "MEDICAL_AID_CONTRIBUTION",
      createdById: admin.id,
    },
  });

  await prisma.necAgreement.create({
    data: {
      companyId,
      councilName: "NEC for the Commercial Sectors",
      currency: "USD",
      employeeRatePercent: "0.5",
      employerRatePercent: "0.5",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  const period = await prisma.payrollPeriod.create({
    data: {
      companyId,
      periodKey: PERIOD_KEY,
      startDate: START,
      endDate: END,
      dueDate: new Date("2026-09-05T00:00:00.000Z"),
      status: "APPROVED",
      createdById: admin.id,
    },
    select: { id: true },
  });

  const assembled = await assembleSalaryRun({
    companyId,
    periodStart: START,
    periodEnd: END,
    appliesToContractorsOnly: false,
  });
  if (assembled.gaps.length > 0) throw new Error(assembled.gaps.join("; "));

  const run = await prisma.payrollRun.create({
    data: {
      companyId,
      periodId: period.id,
      runNumber: 1,
      status: "APPROVED",
      approvedById: admin.id,
      approvedAt: new Date("2026-08-31T00:00:00.000Z"),
      createdById: admin.id,
      lineItems: {
        create: assembled.lines.flatMap((line) =>
          line.payroll.slices.map((slice) => ({
            employeeId: line.employee.id,
            compensationProfileId: line.profile.id,
            baseAmount: line.profile.baseAmount,
            allowancesTotal: slice.allowancesTotal,
            deductionsTotal: slice.deductionsTotal,
            grossAmount: slice.grossAmount,
            netAmount: slice.netAmount,
            taxableGross: slice.taxableGross,
            employerCost: slice.employerCost,
            currency: slice.currency,
            exchangeRate: slice.exchangeRate,
            netBaseAmount: slice.netAmount.dividedBy(slice.exchangeRate).toDecimalPlaces(2),
            components: {
              create: slice.components.map((c) => ({
                name: c.name,
                type: c.type,
                calcMethod: c.calcMethod,
                rateOrAmount: c.rateOrAmount,
                amount: c.amount,
                isTaxable: c.isTaxable,
                statutoryKey: c.statutoryKey ?? undefined,
                sequence: c.sequence,
                basis: c.basis ?? undefined,
              })),
            },
          })),
        ),
      },
    },
    select: { id: true, runNumber: true, lineItems: { select: { id: true } } },
  });

  const totals = assembled.lines.flatMap((l) => l.payroll.slices);
  await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      grossTotal: totals.reduce((s, x) => s.plus(x.grossAmount), totals[0].grossAmount.minus(totals[0].grossAmount)),
      netTotal: totals.reduce((s, x) => s.plus(x.netAmount), totals[0].netAmount.minus(totals[0].netAmount)),
      deductionsTotal: totals.reduce((s, x) => s.plus(x.deductionsTotal), totals[0].deductionsTotal.minus(totals[0].deductionsTotal)),
      employerCostTotal: totals.reduce((s, x) => s.plus(x.employerCost), totals[0].employerCost.minus(totals[0].employerCost)),
    },
  });

  // ── Leave ──────────────────────────────────────────────────────────────────
  //
  // Enough to make the screens honest: a granted entitlement, leave already
  // taken, one request waiting on a decision, and one deliberately spanning
  // Heroes' Day so the frozen day count visibly differs from the calendar span.
  const leaveTypes = await prisma.leaveType.findMany({
    where: { companyId },
    select: { id: true, code: true, defaultEntitlement: true },
  });
  const typeByCode = new Map(leaveTypes.map((type) => [type.code, type]));
  const holidays = await prisma.publicHoliday.findMany({
    where: { companyId },
    select: { date: true, siteId: true },
  });
  const holidayKeys = holidayKeysForSite(holidays, null);

  const leavePeople = createdEmployees.slice(0, 4);
  for (const [index, employee] of leavePeople.entries()) {
    for (const code of ["ANNUAL", "SICK"]) {
      const type = typeByCode.get(code);
      if (!type) continue;
      await prisma.leaveEntitlement.create({
        data: {
          companyId,
          employeeId: employee.id,
          leaveTypeId: type.id,
          year: 2026,
          granted: type.defaultEntitlement,
          carriedOver: code === "ANNUAL" && index === 0 ? "3" : "0",
        },
      });
    }
  }

  const annual = typeByCode.get("ANNUAL");
  const sick = typeByCode.get("SICK");

  const leaveSpecs: Array<{
    employeeId: string;
    typeId: string | undefined;
    start: string;
    end: string;
    status: "APPROVED" | "SUBMITTED";
    reason: string;
    cover?: string;
  }> = [
    {
      employeeId: leavePeople[0].id,
      typeId: annual?.id,
      start: "2026-04-06",
      end: "2026-04-10",
      status: "APPROVED",
      reason: "Family visit to Bulawayo",
      cover: leavePeople[1]?.id,
    },
    {
      // 10–14 August spans Heroes' Day and Defence Forces Day, so five calendar
      // days cost three. The whole reason the holiday calendar exists.
      employeeId: leavePeople[1].id,
      typeId: annual?.id,
      start: "2026-08-10",
      end: "2026-08-14",
      status: "APPROVED",
      reason: "Leave over the August holidays",
    },
    {
      employeeId: leavePeople[2].id,
      typeId: sick?.id,
      start: "2026-07-15",
      end: "2026-07-16",
      status: "APPROVED",
      reason: "Flu",
    },
    {
      employeeId: leavePeople[3].id,
      typeId: annual?.id,
      start: "2026-09-21",
      end: "2026-09-25",
      status: "SUBMITTED",
      reason: "Wedding in Mutare",
      cover: leavePeople[0]?.id,
    },
  ];

  for (const spec of leaveSpecs) {
    if (!spec.typeId) continue;
    const startDate = new Date(`${spec.start}T00:00:00.000Z`);
    const endDate = new Date(`${spec.end}T00:00:00.000Z`);
    const count = countWorkingDays({ startDate, endDate, holidayKeys });
    await prisma.leaveRequest.create({
      data: {
        companyId,
        employeeId: spec.employeeId,
        leaveTypeId: spec.typeId,
        startDate,
        endDate,
        workingDays: count.workingDays,
        reason: spec.reason,
        coveringEmployeeId: spec.cover ?? null,
        status: spec.status,
        createdById: admin.id,
        submittedAt: new Date(`${spec.start}T00:00:00.000Z`),
        ...(spec.status === "APPROVED"
          ? { decidedById: admin.id, decidedAt: new Date(`${spec.start}T00:00:00.000Z`) }
          : {}),
      },
    });
  }

  // ── The rest of the surface ────────────────────────────────────────────────
  //
  // Six screens were showing empty states, which photographs as though the
  // feature is missing rather than idle. What follows is the smallest amount of
  // data that makes each one legible.
  //
  // A company-wide crew, which is now expressible: `ShiftGroup.siteId` used to be
  // required, so a bureau could not have a roster at all without inventing a
  // site. A crew is a group of people who work together; a site is a mine's way
  // of narrowing that.
  const roster = await prisma.shiftGroup.create({
    data: {
      companyId,
      siteId: null,
      name: "Payroll desk",
      code: "PD-1",
      leaderEmployeeId: createdEmployees[0].id,
      members: {
        create: createdEmployees.slice(0, 3).map((employee) => ({
          employeeId: employee.id,
        })),
      },
    },
    select: { id: true },
  });
  void roster;

  // Money out the door: a batch against the approved run, part-paid, so the
  // outstanding column has something in it and PAID/PARTIAL/DUE all render.
  const lineDetails = await prisma.payrollLineItem.findMany({
    where: { runId: run.id },
    select: {
      id: true,
      employeeId: true,
      netAmount: true,
      currency: true,
      exchangeRate: true,
      netBaseAmount: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const usdLines = lineDetails.filter((line) => line.currency === "USD");

  const batch = await prisma.disbursementBatch.create({
    data: {
      companyId,
      payrollRunId: run.id,
      code: "DSB-2026-08-001",
      status: "APPROVED",
      method: "CASH",
      currency: "USD",
      cashCustodian: "Rudo Chirwa",
      cashIssuedAt: new Date("2026-08-31T09:00:00.000Z"),
      totalAmount: usdLines.reduce(
        (sum, line) => sum.plus(line.netAmount),
        usdLines[0].netAmount.minus(usdLines[0].netAmount),
      ),
      itemCount: usdLines.length,
      createdById: admin.id,
      submittedById: admin.id,
      submittedAt: new Date("2026-08-31T08:00:00.000Z"),
      approvedById: admin.id,
      approvedAt: new Date("2026-08-31T08:30:00.000Z"),
      items: {
        create: usdLines.map((line, index) => {
          // The last one is short by 40 — a cashier out of small change. That is
          // the case the outstanding column exists for.
          const isShort = index === usdLines.length - 1;
          const paid = isShort
            ? line.netAmount.minus(40)
            : line.netAmount;
          return {
            lineItemId: line.id,
            employeeId: line.employeeId,
            amount: line.netAmount,
            paidAmount: paid,
            currency: line.currency,
            exchangeRate: line.exchangeRate,
            baseAmount: line.netBaseAmount,
            status: isShort ? "PARTIAL" : "PAID",
            paidAt: new Date("2026-08-31T10:00:00.000Z"),
            receiptReference: `RCP-${String(index + 1).padStart(3, "0")}`,
          };
        }),
      },
    },
    select: { id: true, items: { select: { id: true, employeeId: true, amount: true, paidAmount: true, currency: true, status: true, lineItemId: true } } },
  });

  // What each person was paid, which is what the salaries screens read.
  for (const item of batch.items) {
    await prisma.employeePayment.create({
      data: {
        employeeId: item.employeeId,
        periodStart: START,
        periodEnd: END,
        dueDate: new Date("2026-08-31T00:00:00.000Z"),
        amount: item.amount,
        unit: item.currency,
        paidAmount: item.paidAmount,
        paidAt: new Date("2026-08-31T10:00:00.000Z"),
        status: item.status,
        notes: `Disbursement batch DSB-2026-08-001`,
        createdById: admin.id,
        payrollRunId: run.id,
        payrollLineItemId: item.lineItemId,
        disbursementBatchId: batch.id,
        disbursementItemId: item.id,
      },
    });
  }

  // A workforce incident with no site, because `HrIncident.siteId` is nullable
  // and a bureau's incidents happen in an office.
  await prisma.hrIncident.create({
    data: {
      companyId,
      employeeId: createdEmployees[2].id,
      incidentDate: new Date("2026-08-14T00:00:00.000Z"),
      category: "ATTENDANCE",
      severity: "MEDIUM",
      status: "UNDER_REVIEW",
      title: "Repeated late arrival",
      description:
        "Arrived after 09:00 on four occasions in the fortnight to 14 August. Discussed informally on the second occasion.",
      investigationNotes: "Statement taken. Awaiting the employee's written response.",
      reportedById: admin.id,
    },
  });

  // The audit trail. These are written by the workflow routes in normal use;
  // the seed creates the run and the batch directly, so it writes the actions
  // the routes would have — otherwise History photographs empty on a tenant
  // that has plainly approved things.
  const auditTrail: Array<{
    entityType: "PAYROLL_RUN" | "DISBURSEMENT_BATCH";
    entityId: string;
    action: "CREATE" | "SUBMIT" | "APPROVE";
    fromStatus: string | null;
    toStatus: string;
    at: string;
    note: string;
  }> = [
    {
      entityType: "PAYROLL_RUN",
      entityId: run.id,
      action: "CREATE",
      fromStatus: null,
      toStatus: "DRAFT",
      at: "2026-08-28T09:00:00.000Z",
      note: `Run ${run.runNumber} generated for ${PERIOD_KEY}.`,
    },
    {
      entityType: "PAYROLL_RUN",
      entityId: run.id,
      action: "SUBMIT",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      at: "2026-08-29T11:30:00.000Z",
      note: "Submitted for approval.",
    },
    {
      entityType: "PAYROLL_RUN",
      entityId: run.id,
      action: "APPROVE",
      fromStatus: "SUBMITTED",
      toStatus: "APPROVED",
      at: "2026-08-31T00:00:00.000Z",
      note: "Approved; posted to the ledger.",
    },
    {
      entityType: "DISBURSEMENT_BATCH",
      entityId: batch.id,
      action: "CREATE",
      fromStatus: null,
      toStatus: "DRAFT",
      at: "2026-08-31T07:45:00.000Z",
      note: "Cash disbursement batch DSB-2026-08-001 created.",
    },
    {
      entityType: "DISBURSEMENT_BATCH",
      entityId: batch.id,
      action: "SUBMIT",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      at: "2026-08-31T08:00:00.000Z",
      note: "Submitted for approval.",
    },
    {
      entityType: "DISBURSEMENT_BATCH",
      entityId: batch.id,
      action: "APPROVE",
      fromStatus: "SUBMITTED",
      toStatus: "APPROVED",
      at: "2026-08-31T08:30:00.000Z",
      note: "Approved for cash issue.",
    },
  ];

  for (const entry of auditTrail) {
    await prisma.approvalAction.create({
      data: {
        companyId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        actedById: admin.id,
        fromStatus: entry.fromStatus ?? undefined,
        toStatus: entry.toStatus,
        note: entry.note,
        // Both, because the screen orders and displays `actedAt` while
        // `createdAt` is the row's own age. Setting only the latter gave six
        // rows stamped with the moment the seed ran, which reads as one
        // simultaneous event rather than a sequence.
        actedAt: new Date(entry.at),
        createdAt: new Date(entry.at),
      },
    });
  }

  const outcome = await postPayrollRun({
    companyId,
    runId: run.id,
    runNumber: run.runNumber,
    entryDate: new Date("2026-08-31T00:00:00.000Z"),
    createdById: admin.id,
    enabledFeatures: ["accounting.core"],
  });

  console.log(JSON.stringify({
    companyId,
    slug: SLUG,
    login: "rudo.chirwa@payroll-demo.test / Password123!",
    lineItemIds: run.lineItems.map((l) => l.id),
    posted: outcome.posted,
  }, null, 2));
}

main().then(() => prisma.$disconnect());
