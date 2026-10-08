import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { esc } from "@/lib/documents/html-renderer";
import { formatDay, formatMoney, formatSigned, formatTime } from "@/lib/workspace/format";

import { tenderLabel } from "./words";
import {
  RETAIL_Z_REPORT_TENDERS,
  serializeRetailZReport,
  tradingDayAsDate,
  tradingDayKey,
  type RetailZReportPayload,
} from "./z-report";

/**
 * The Z-reports behind a set of shifts (00-foundations 4.8), for the Shifts
 * list's "Print Z-reports" and "Download Z-reports as CSV".
 *
 * A Z-report is one register's trading day, so a set of shifts maps onto the
 * register-days they were opened on (`tradingDayKey`, the one rule the close
 * itself uses). Two shifts on the same till and day are one report; a day that
 * has not been closed yet has no report, and the caller is told how many.
 */

/** At most this many shifts per request: the selection's own cap. */
export const Z_REPORT_SHIFT_CAP = 500;

/** At most this many site-days per request: a year of one site (Past days' selection). */
export const Z_REPORT_DAY_CAP = 366;

const shiftIds = z.array(z.string().uuid()).min(1).max(Z_REPORT_SHIFT_CAP);

/** The Shifts list's shifts, or Past days' site-days (FLR-07). */
export const zReportPrintSchema = z.union([
  z.object({ shiftIds }),
  z.object({
    days: z
      .array(z.object({ siteId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .min(1)
      .max(Z_REPORT_DAY_CAP),
  }),
]);

export const zReportExportSchema = z.object({ shiftIds, format: z.literal("csv") });

/** Refused with 409 when no day the shifts belong to has a report yet. */
export const NONE_CLOSED = "None of these days has been closed yet.";

export type RegisterDay = { registerCode: string; businessDate: string };

/** The register-days a set of shifts belongs to, each once, oldest first. */
export function registerDays(shifts: Array<{ registerCode: string; openedAt: Date }>): RegisterDay[] {
  const seen = new Map<string, RegisterDay>();
  for (const shift of shifts) {
    const day = { registerCode: shift.registerCode, businessDate: tradingDayKey(shift.openedAt) };
    seen.set(`${day.businessDate}|${day.registerCode}`, day);
  }
  return [...seen.values()].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate) || a.registerCode.localeCompare(b.registerCode),
  );
}

type ZReportClient = Pick<PrismaClient, "retailShift" | "retailZReport" | "retailDayClose">;

export type ShiftZReports = {
  reports: RetailZReportPayload[];
  /** Register-days the shifts belong to. */
  days: number;
  /** Of those, the ones with no report yet. */
  notClosed: number;
};

/**
 * The stored Z-reports for the days these shifts were opened on.
 *
 * Every id is re-checked against the company: a shift id from another company
 * matches nothing, the same as an id that does not exist.
 */
export async function findShiftZReports(
  client: ZReportClient,
  companyId: string,
  shiftIds: string[],
): Promise<ShiftZReports> {
  const shifts = await client.retailShift.findMany({
    where: { companyId, id: { in: [...new Set(shiftIds)] } },
    select: { registerCode: true, openedAt: true },
  });
  const days = registerDays(shifts);
  if (days.length === 0) return { reports: [], days: 0, notClosed: 0 };

  const rows = await client.retailZReport.findMany({
    where: {
      companyId,
      OR: days.map((day) => ({ registerCode: day.registerCode, businessDate: tradingDayAsDate(day.businessDate) })),
    },
    include: { site: { select: { name: true } } },
  });
  const reports = rows
    .map((row) => serializeRetailZReport(row, row.site?.name ?? null))
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.registerCode.localeCompare(b.registerCode));
  return { reports, days: days.length, notClosed: days.length - reports.length };
}

/**
 * The Z-reports taken when these site-days closed (FLR-07): a day closes all
 * its tills' reports at once, so a day not closed yet has none, and the
 * caller is told how many such days there were.
 */
export async function findDayZReports(
  client: ZReportClient,
  companyId: string,
  days: Array<{ siteId: string; date: string }>,
): Promise<ShiftZReports> {
  const unique = [...new Map(days.map((day) => [`${day.siteId}|${day.date}`, day])).values()];
  if (unique.length === 0) return { reports: [], days: 0, notClosed: 0 };
  const closes = await client.retailDayClose.findMany({
    where: { companyId, OR: unique.map((day) => ({ siteId: day.siteId, businessDate: tradingDayAsDate(day.date) })) },
    select: { zReportIds: true },
  });
  const ids = closes.flatMap((close) => close.zReportIds);
  const rows = ids.length
    ? await client.retailZReport.findMany({ where: { companyId, id: { in: ids } }, include: { site: { select: { name: true } } } })
    : [];
  const reports = rows
    .map((row) => serializeRetailZReport(row, row.site?.name ?? null))
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.registerCode.localeCompare(b.registerCode));
  return { reports, days: unique.length, notClosed: unique.length - closes.length };
}

/* ──────────────────────────────────────────────────────────────────────────
   CSV: one row per report
   ────────────────────────────────────────────────────────────────────────── */

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const fixed = (value: number) => value.toFixed(2);

/** The tender's share of the day in the report's currency, "0.00" when it took none. */
function tenderAmount(report: RetailZReportPayload, tender: string): string {
  const line = report.tenderBreakdown.find((entry) => entry.tenderType === tender);
  return line ? Number(line.amount).toFixed(2) : "0.00";
}

/**
 * The reports as rows: date, till, sales, takings, cash expected, counted,
 * variance, then one column per tender. Amounts are the stored figures,
 * printed to two places, so a spreadsheet sums to the documents.
 */
export function zReportsCsv(reports: RetailZReportPayload[]): string {
  const headers = [
    "Date",
    "Till",
    "Z-report",
    "Sales",
    "Takings",
    "Cash expected",
    "Counted",
    "Variance",
    ...RETAIL_Z_REPORT_TENDERS.map((tender) => tenderLabel(tender)),
  ];
  const rows = reports.map((report) => [
    report.businessDate,
    report.registerName,
    report.reportNo,
    String(report.saleCount),
    fixed(report.grossTakings),
    fixed(report.expectedCash),
    fixed(report.countedCash),
    fixed(report.cashVariance),
    ...RETAIL_Z_REPORT_TENDERS.map((tender) => tenderAmount(report, tender)),
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** `z-reports_2026-09-01_2026-09-30.csv` — the first and last day in the set. */
export function zReportsFileName(reports: RetailZReportPayload[], extension: "csv" | "pdf"): string {
  const first = reports[0]?.businessDate ?? "none";
  const last = reports[reports.length - 1]?.businessDate ?? first;
  return first === last ? `z-reports_${first}.${extension}` : `z-reports_${first}_${last}.${extension}`;
}

/* ──────────────────────────────────────────────────────────────────────────
   PDF: one report per page
   ────────────────────────────────────────────────────────────────────────── */

function row(label: string, value: string, strong = false): string {
  return `<tr${strong ? ' class="strong"' : ""}><td>${esc(label)}</td><td class="num mono">${esc(value)}</td></tr>`;
}

/** One stored report, laid out the way the till's end-of-day screen reads it. */
function reportSection(report: RetailZReportPayload): string {
  const cur = report.currency;
  const m = (value: number | string) => formatMoney(Number(value), cur);
  const sales = [
    row("Sales before discounts", m(report.grossSales)),
    row(report.approvedDiscountCount ? `Discounts (${report.approvedDiscountCount} approved)` : "Discounts", m(-report.discountTotal)),
    row(`VAT ${report.taxRatePercent.toFixed(2)}%`, m(report.taxTotal)),
    row("Takings", m(report.grossTakings), true),
    ...(report.depositTotal ? [row("Bottle deposits held", m(report.depositTotal))] : []),
    row(`Refunds (${report.refundCount})`, m(report.refundTotal)),
    row(`Voids (${report.voidCount})`, m(report.voidTotal)),
  ].join("");
  const tenders = report.tenderBreakdown
    .map((line) => row(`${tenderLabel(line.tenderType)} · ${line.count}`, m(line.amount)))
    .join("");
  const cash = [
    row("Opening float", m(report.openingFloat)),
    row("Cash takings", m(report.cashTakings)),
    row("Cash moved", formatSigned(report.cashMovementNet, cur)),
    row("Expected", m(report.expectedCash)),
    row("Counted", m(report.countedCash)),
    row("Variance", formatSigned(report.cashVariance, cur), true),
  ].join("");
  const shifts = report.shifts
    .map(
      (shift) =>
        `<tr><td class="mono">${esc(shift.shiftNo)}</td><td>${esc(shift.cashierName)}</td>` +
        `<td class="mono">${esc(formatTime(shift.openedAt))}–${esc(shift.closedAt ? formatTime(shift.closedAt) : "")}</td>` +
        `<td class="num mono">${esc(m(shift.expectedCash))}</td>` +
        `<td class="num mono">${esc(shift.countedCash === null ? "—" : m(shift.countedCash))}</td>` +
        `<td class="num mono">${esc(shift.variance === null ? "—" : formatSigned(Number(shift.variance), cur))}</td></tr>`,
    )
    .join("");
  const generated = new Date(report.generatedAt);
  return `<section class="zr">
  <h2>${esc(report.registerName)} · ${esc(formatDay(report.businessDate))}</h2>
  <p class="zr-sub"><span class="mono">${esc(report.reportNo)}</span>${report.siteName ? ` · ${esc(report.siteName)}` : ""} · ${esc(
    `${report.saleCount} sales, ${report.shiftCount} ${report.shiftCount === 1 ? "shift" : "shifts"}`,
  )} · taken ${esc(formatDay(generated))} ${esc(formatTime(generated))}${report.generatedByName ? ` by ${esc(report.generatedByName)}` : ""}</p>
  <div class="zr-cols">
    <table class="zr-table"><caption>Sales</caption><tbody>${sales}</tbody></table>
    <table class="zr-table"><caption>Cash in the drawer</caption><tbody>${cash}</tbody></table>
  </div>
  <table class="zr-table"><caption>How people paid</caption><tbody>${tenders || row("No payments", m(0))}</tbody></table>
  <table class="zr-table zr-shifts"><caption>Shifts</caption>
    <thead><tr><th>Shift</th><th>Cashier</th><th>Open</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Variance</th></tr></thead>
    <tbody>${shifts}</tbody></table>
</section>`;
}

export const Z_REPORT_CSS = `
  .zr + .zr { break-before: page; page-break-before: always; }
  .zr h2 { margin: 0 0 4px; font-size: 16px; }
  .zr-sub { margin: 0 0 14px; color: var(--ink-muted); font-size: 11px; }
  .zr-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .zr-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
  .zr-table caption { text-align: left; font-weight: 600; padding: 0 0 4px; }
  .zr-table td, .zr-table th { padding: 4px 0; border-bottom: 1px solid var(--rule); text-align: left; }
  .zr-table th { color: var(--ink-muted); font-weight: 500; }
  .zr-table .num { text-align: right; }
  .zr-table tr.strong td { font-weight: 600; }
`;

/** The body of the document: every report, one per page. */
export function zReportsHtml(reports: RetailZReportPayload[]): string {
  return reports.map(reportSection).join("\n");
}
