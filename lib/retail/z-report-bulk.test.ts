import { describe, expect, it } from "vitest";

import type { RetailZReportRow } from "./z-report";
import {
  findDayZReports,
  findShiftZReports,
  registerDays,
  zReportPrintSchema,
  zReportExportSchema,
  zReportsCsv,
  zReportsFileName,
  zReportsHtml,
} from "./z-report-bulk";

const COMPANY = "company-1";

function report(registerCode: string, registerName: string, businessDate: string, overrides: Partial<RetailZReportRow> = {}) {
  return {
    id: `z-${registerCode}-${businessDate}`,
    reportNo: `Z-${registerCode.replace("-", "")}-${businessDate.replace(/-/g, "")}`,
    businessDate: new Date(`${businessDate}T00:00:00.000Z`),
    registerCode,
    registerName,
    siteId: "site-1",
    currency: "USD",
    generatedAt: new Date(`${businessDate}T20:00:00.000Z`),
    generatedById: "u-1",
    generatedByName: "Tafara Nyathi",
    shiftCount: 1,
    saleCount: 96,
    refundCount: 0,
    voidCount: 1,
    itemCount: 140,
    grossSales: "780.00",
    discountTotal: "0.00",
    netSales: "771.17",
    taxTotal: "115.68",
    taxRatePercent: "15.00",
    grossTakings: "886.85",
    depositTotal: "0.00",
    refundTotal: "0.00",
    voidTotal: "-3.20",
    openingFloat: "100.00",
    cashTakings: "432.50",
    cashDropTotal: "0.00",
    cashTopUpTotal: "0.00",
    cashPayoutTotal: "0.00",
    cashMovementNet: "0.00",
    expectedCash: "532.50",
    countedCash: "525.35",
    cashVariance: "-7.15",
    tenderBreakdown: [
      { tenderType: "CASH", count: 50, amount: "432.50", share: "48.77" },
      { tenderType: "ECOCASH", count: 30, amount: "300.00", share: "33.83" },
      { tenderType: "CARD", count: 16, amount: "154.35", share: "17.40" },
    ],
    topItems: [],
    cashMovements: [],
    shifts: [
      {
        shiftId: "s-1",
        shiftNo: "SH-00238",
        cashierName: "Chipo Dube",
        openedAt: `${businessDate}T06:00:00.000Z`,
        closedAt: `${businessDate}T13:00:00.000Z`,
        openingFloat: "100.00",
        cashTakings: "432.50",
        movementNet: "0.00",
        expectedCash: "532.50",
        countedCash: "525.35",
        variance: "-7.15",
      },
    ],
    site: { name: "Harare Main Branch" },
    ...overrides,
  };
}

/** A database that knows three shifts and one closed day, for one company. */
function fakeClient() {
  const shifts = [
    { id: "a", companyId: COMPANY, registerCode: "TILL-1", openedAt: new Date("2026-09-30T05:58:00.000Z") },
    { id: "b", companyId: COMPANY, registerCode: "TILL-1", openedAt: new Date("2026-09-30T09:00:00.000Z") },
    { id: "c", companyId: COMPANY, registerCode: "TILL-2", openedAt: new Date("2026-10-01T13:00:00.000Z") },
    { id: "x", companyId: "other", registerCode: "TILL-1", openedAt: new Date("2026-09-29T05:58:00.000Z") },
  ];
  const reports = [report("TILL-1", "Front till", "2026-09-30"), { ...report("TILL-1", "Front till", "2026-09-29"), companyId: "other" }];
  const seen: unknown[] = [];
  const client = {
    retailShift: {
      findMany: async ({ where }: { where: { companyId: string; id: { in: string[] } } }) =>
        shifts.filter((shift) => shift.companyId === where.companyId && where.id.in.includes(shift.id)),
    },
    retailZReport: {
      findMany: async ({ where }: { where: { companyId: string; OR: Array<{ registerCode: string; businessDate: Date }> } }) => {
        seen.push(where);
        return reports.filter(
          (row) =>
            ((row as { companyId?: string }).companyId ?? COMPANY) === where.companyId &&
            where.OR.some(
              (key) => key.registerCode === row.registerCode && key.businessDate.getTime() === row.businessDate.getTime(),
            ),
        );
      },
    },
  };
  return { client: client as unknown as Parameters<typeof findShiftZReports>[0], seen };
}

describe("registerDays", () => {
  it("maps shifts onto their register-days once each, oldest first", () => {
    expect(
      registerDays([
        { registerCode: "TILL-2", openedAt: new Date("2026-10-01T13:00:00Z") },
        { registerCode: "TILL-1", openedAt: new Date("2026-09-30T05:58:00Z") },
        { registerCode: "TILL-1", openedAt: new Date("2026-09-30T13:00:00Z") },
      ]),
    ).toEqual([
      { registerCode: "TILL-1", businessDate: "2026-09-30" },
      { registerCode: "TILL-2", businessDate: "2026-10-01" },
    ]);
  });
});

describe("findShiftZReports", () => {
  it("returns the closed days' reports and counts the days not closed yet", async () => {
    const { client } = fakeClient();
    const found = await findShiftZReports(client, COMPANY, ["a", "b", "c"]);
    expect(found.days).toBe(2);
    expect(found.notClosed).toBe(1);
    expect(found.reports.map((entry) => entry.reportNo)).toEqual(["Z-TILL1-20260930"]);
    expect(found.reports[0]!.siteName).toBe("Harare Main Branch");
  });

  it("re-checks every id against the company", async () => {
    const { client, seen } = fakeClient();
    const found = await findShiftZReports(client, COMPANY, ["x"]);
    expect(found).toEqual({ reports: [], days: 0, notClosed: 0 });
    // Nothing else is even looked up for an id from another company.
    expect(seen).toHaveLength(0);
  });
});

describe("findDayZReports (Past days, FLR-07)", () => {
  const SITE = "6f1f7a52-6b5c-4a6e-9d2c-3d7b3c1e9a10";
  /** Two closed site-days of this company (Front and Back till on the 30th, Front on the 1st), one of another's. */
  function daysClient() {
    const rows = [
      report("TILL-1", "Front till", "2026-09-30"),
      report("TILL-2", "Back till", "2026-09-30"),
      report("TILL-1", "Front till", "2026-10-01"),
      { ...report("TILL-1", "Front till", "2026-09-29"), companyId: "other" },
    ];
    const closes = [
      { companyId: COMPANY, siteId: SITE, businessDate: new Date("2026-09-30T00:00:00.000Z"), zReportIds: ["z-TILL-1-2026-09-30", "z-TILL-2-2026-09-30"] },
      { companyId: COMPANY, siteId: SITE, businessDate: new Date("2026-10-01T00:00:00.000Z"), zReportIds: ["z-TILL-1-2026-10-01"] },
      { companyId: "other", siteId: SITE, businessDate: new Date("2026-09-29T00:00:00.000Z"), zReportIds: ["z-TILL-1-2026-09-29"] },
    ];
    const client = {
      retailDayClose: {
        findMany: async ({ where }: { where: { companyId: string; OR: Array<{ siteId: string; businessDate: Date }> } }) =>
          closes.filter(
            (close) =>
              close.companyId === where.companyId &&
              where.OR.some((key) => key.siteId === close.siteId && key.businessDate.getTime() === close.businessDate.getTime()),
          ),
      },
      retailZReport: {
        findMany: async ({ where }: { where: { companyId: string; id: { in: string[] } } }) =>
          rows.filter((row) => ((row as { companyId?: string }).companyId ?? COMPANY) === where.companyId && where.id.in.includes(row.id)),
      },
    };
    return client as unknown as Parameters<typeof findDayZReports>[0];
  }

  it("prints every till's report of each closed day, oldest first, and counts the days not closed", async () => {
    const found = await findDayZReports(daysClient(), COMPANY, [
      { siteId: SITE, date: "2026-10-01" },
      { siteId: SITE, date: "2026-09-30" },
      { siteId: SITE, date: "2026-10-02" },
      { siteId: SITE, date: "2026-09-30" },
    ]);
    expect(found.days).toBe(3);
    expect(found.notClosed).toBe(1);
    expect(found.reports.map((entry) => entry.reportNo)).toEqual(["Z-TILL1-20260930", "Z-TILL2-20260930", "Z-TILL1-20261001"]);
  });

  it("finds nothing of another company's days", async () => {
    const found = await findDayZReports(daysClient(), COMPANY, [{ siteId: SITE, date: "2026-09-29" }]);
    expect(found).toEqual({ reports: [], days: 1, notClosed: 1 });
  });

  it("takes 1 to 366 site-days, each a site id and a date", () => {
    expect(zReportPrintSchema.safeParse({ days: [{ siteId: SITE, date: "2026-10-02" }] }).success).toBe(true);
    expect(zReportPrintSchema.safeParse({ days: [] }).success).toBe(false);
    expect(zReportPrintSchema.safeParse({ days: [{ siteId: SITE, date: "2 Oct" }] }).success).toBe(false);
    expect(zReportPrintSchema.safeParse({ days: [{ siteId: "main", date: "2026-10-02" }] }).success).toBe(false);
    expect(zReportPrintSchema.safeParse({ days: Array.from({ length: 367 }, () => ({ siteId: SITE, date: "2026-10-02" })) }).success).toBe(false);
  });
});

describe("the request bodies", () => {
  it("takes 1 to 500 shift ids, as uuids", () => {
    const id = "6f1f7a52-6b5c-4a6e-9d2c-3d7b3c1e9a10";
    expect(zReportPrintSchema.safeParse({ shiftIds: [id] }).success).toBe(true);
    expect(zReportPrintSchema.safeParse({ shiftIds: [] }).success).toBe(false);
    expect(zReportPrintSchema.safeParse({ shiftIds: ["SH-00238"] }).success).toBe(false);
    expect(zReportPrintSchema.safeParse({ shiftIds: Array.from({ length: 501 }, () => id) }).success).toBe(false);
    expect(zReportExportSchema.safeParse({ shiftIds: [id], format: "csv" }).success).toBe(true);
    expect(zReportExportSchema.safeParse({ shiftIds: [id], format: "xlsx" }).success).toBe(false);
  });
});

describe("the files", () => {
  it("writes one CSV row per report with every tender", async () => {
    const { client } = fakeClient();
    const { reports } = await findShiftZReports(client, COMPANY, ["a"]);
    const lines = zReportsCsv(reports).split("\r\n");
    expect(lines[0]).toBe(
      "Date,Till,Z-report,Sales,Takings,Cash expected,Counted,Variance,Cash,Card,EcoCash,InnBucks,Bank transfer,On account,Voucher",
    );
    expect(lines[1]).toBe("2026-09-30,Front till,Z-TILL1-20260930,96,886.85,532.50,525.35,-7.15,432.50,154.35,300.00,0.00,0.00,0.00,0.00");
    expect(lines).toHaveLength(2);
  });

  it("names the file by the first and last day", () => {
    const one = [{ businessDate: "2026-09-30" }] as Parameters<typeof zReportsFileName>[0];
    const two = [{ businessDate: "2026-09-01" }, { businessDate: "2026-09-30" }] as Parameters<typeof zReportsFileName>[0];
    expect(zReportsFileName(one, "pdf")).toBe("z-reports_2026-09-30.pdf");
    expect(zReportsFileName(two, "csv")).toBe("z-reports_2026-09-01_2026-09-30.csv");
  });

  it("prints each report as its own page with the stored figures", async () => {
    const { client } = fakeClient();
    const { reports } = await findShiftZReports(client, COMPANY, ["a"]);
    const html = zReportsHtml([...reports, ...reports]);
    expect(html.match(/<section class="zr">/g)).toHaveLength(2);
    expect(html).toContain("Front till · 30 September 2026");
    expect(html).toContain("US$886.85");
    expect(html).toContain("−US$7.15");
    expect(html).toContain("SH-00238");
  });
});
