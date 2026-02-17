import {
  EventSeverity,
  PayrollRunStatus,
  PostingDirection,
  WorkOrderStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ExecutiveDashboardRange } from "@/lib/dashboard/executive-config";
import { getExecutiveDashboardRangeDays } from "@/lib/dashboard/executive-config";

export type ExecutiveDashboardWindow = {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  days: number;
};

export type ExecutiveTrendPoint = {
  date: string;
  value: number;
  comparison?: number;
};

export type ExecutiveCashTrendPoint = {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
};

export type ExecutiveBreakdownPoint = {
  label: string;
  value: number;
};

export type ExecutiveQuickBadge = {
  count: number;
  label?: string;
};

export type ExecutiveDashboardMetrics = {
  cashPosition: number;
  previousCashPosition: number;
  nearTermNetPosition: number;
  openReceivables: number;
  openPayables: number;
  goldProducedWeight: number;
  previousGoldProducedWeight: number;
  goldRealizedValue: number;
  previousGoldRealizedValue: number;
  activeWorkers: number;
  salaryOwed: number;
  goldPayoutOwed: number;
  workforceLiability: number;
  pendingPayrollApprovals: number;
  pendingDisbursements: number;
  plantThroughput: number;
  previousPlantThroughput: number;
  dispatchPendingReceipt: number;
  openWorkOrders: number;
  lowStockItems: number;
  openComplianceIncidents: number;
  permitsExpiring30Days: number;
  criticalUnackedCctvEvents: number;
  totalRiskItems: number;
};

export type ExecutiveDashboardAggregations = {
  generatedAt: string;
  window: ExecutiveDashboardWindow;
  metrics: ExecutiveDashboardMetrics;
  charts: {
    goldTrend: ExecutiveTrendPoint[];
    cashTrend: ExecutiveCashTrendPoint[];
    throughputTrend: ExecutiveTrendPoint[];
    riskBreakdown: ExecutiveBreakdownPoint[];
  };
  quickLinkBadges: Record<string, ExecutiveQuickBadge>;
};

type GetExecutiveDashboardAggregationsInput = {
  companyId: string;
  siteId: string | null;
  range: ExecutiveDashboardRange;
  now?: Date;
};

type DateWindow = {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
  days: number;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateKey(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return date.toISOString().slice(0, 10);
}

function endOfDayUtc(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

function buildDateWindow(range: ExecutiveDashboardRange, nowInput?: Date): DateWindow {
  const now = nowInput ? new Date(nowInput) : new Date();
  const days = getExecutiveDashboardRangeDays(range);

  const endDate = endOfDayUtc(now);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  startDate.setUTCHours(0, 0, 0, 0);

  const previousEndDate = new Date(startDate.getTime() - 1);
  const previousStartDate = new Date(previousEndDate);
  previousStartDate.setUTCDate(previousStartDate.getUTCDate() - (days - 1));
  previousStartDate.setUTCHours(0, 0, 0, 0);

  return {
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    days,
  };
}

function sumOutstandingRows<T>(
  rows: T[],
  reader: (row: T) => { total: number; paid: number; deduction: number; writeOff: number },
) {
  return rows.reduce((sum, row) => {
    const values = reader(row);
    const outstanding = Math.max(0, values.total - values.paid - values.deduction - values.writeOff);
    return sum + outstanding;
  }, 0);
}

function toMapPoints(
  rows: Array<{ date: Date | string; value: number }>,
): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = dateKey(row.date);
    acc[key] = round((acc[key] ?? 0) + row.value);
    return acc;
  }, {});
}

function buildDailyAxis(start: Date, end: Date): string[] {
  const axis: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    axis.push(dateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return axis;
}

function toDeltaPercent(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100);
}

export async function getExecutiveDashboardAggregations({
  companyId,
  siteId,
  range,
  now,
}: GetExecutiveDashboardAggregationsInput): Promise<ExecutiveDashboardAggregations> {
  const window = buildDateWindow(range, now);
  const siteScope = siteId ? { id: siteId, companyId } : { companyId };
  const currentRange = { gte: window.startDate, lte: window.endDate };
  const previousRange = { gte: window.previousStartDate, lte: window.previousEndDate };

  const nearTermDate = new Date(window.endDate);
  nearTermDate.setUTCDate(nearTermDate.getUTCDate() + 30);

  const permitExpiringDate = new Date(window.endDate);
  permitExpiringDate.setUTCDate(permitExpiringDate.getUTCDate() + 30);

  const [
    bankAccounts,
    bankCreditsAllTime,
    bankDebitsAllTime,
    bankCreditsPrevious,
    bankDebitsPrevious,
    bankTransactionsCurrentRange,
    currentInvoices,
    currentBills,
    dueSoonInvoices,
    dueSoonBills,
    goldPoursCurrent,
    goldPoursPrevious,
    goldPoursDaily,
    buyerReceiptsCurrent,
    buyerReceiptsPrevious,
    activeWorkers,
    employeePaymentsDue,
    payrollSubmitted,
    disbursementSubmitted,
    plantCurrent,
    plantPrevious,
    plantDaily,
    openWorkOrders,
    lowStockRows,
    openIncidents,
    permitsExpiring,
    criticalUnackedEvents,
    pendingDispatches,
  ] = await Promise.all([
    prisma.bankAccount.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: { openingBalance: true },
    }),
    prisma.bankTransaction.aggregate({
      _sum: { amount: true },
      where: {
        companyId,
        direction: PostingDirection.CREDIT,
        txnDate: { lte: window.endDate },
      },
    }),
    prisma.bankTransaction.aggregate({
      _sum: { amount: true },
      where: {
        companyId,
        direction: PostingDirection.DEBIT,
        txnDate: { lte: window.endDate },
      },
    }),
    prisma.bankTransaction.aggregate({
      _sum: { amount: true },
      where: {
        companyId,
        direction: PostingDirection.CREDIT,
        txnDate: { lte: window.previousEndDate },
      },
    }),
    prisma.bankTransaction.aggregate({
      _sum: { amount: true },
      where: {
        companyId,
        direction: PostingDirection.DEBIT,
        txnDate: { lte: window.previousEndDate },
      },
    }),
    prisma.bankTransaction.findMany({
      where: {
        companyId,
        txnDate: currentRange,
      },
      select: {
        txnDate: true,
        amount: true,
        direction: true,
      },
      orderBy: { txnDate: "asc" },
    }),
    prisma.salesInvoice.findMany({
      where: {
        companyId,
        status: { in: ["DRAFT", "ISSUED"] },
      },
      select: {
        total: true,
        amountPaid: true,
        creditTotal: true,
        writeOffTotal: true,
        dueDate: true,
      },
    }),
    prisma.purchaseBill.findMany({
      where: {
        companyId,
        status: { in: ["DRAFT", "RECEIVED"] },
      },
      select: {
        total: true,
        amountPaid: true,
        debitNoteTotal: true,
        writeOffTotal: true,
        dueDate: true,
      },
    }),
    prisma.salesInvoice.findMany({
      where: {
        companyId,
        status: { in: ["DRAFT", "ISSUED"] },
        dueDate: {
          lte: nearTermDate,
        },
      },
      select: {
        total: true,
        amountPaid: true,
        creditTotal: true,
        writeOffTotal: true,
      },
    }),
    prisma.purchaseBill.findMany({
      where: {
        companyId,
        status: { in: ["DRAFT", "RECEIVED"] },
        dueDate: {
          lte: nearTermDate,
        },
      },
      select: {
        total: true,
        amountPaid: true,
        debitNoteTotal: true,
        writeOffTotal: true,
      },
    }),
    prisma.goldPour.aggregate({
      _sum: { grossWeight: true },
      where: {
        pourDate: currentRange,
        site: siteScope,
      },
    }),
    prisma.goldPour.aggregate({
      _sum: { grossWeight: true },
      where: {
        pourDate: previousRange,
        site: siteScope,
      },
    }),
    prisma.goldPour.findMany({
      where: {
        pourDate: currentRange,
        site: siteScope,
      },
      select: {
        pourDate: true,
        grossWeight: true,
      },
      orderBy: { pourDate: "asc" },
    }),
    prisma.buyerReceipt.aggregate({
      _sum: { paidAmount: true },
      where: {
        receiptDate: currentRange,
        goldDispatch: {
          goldPour: {
            site: siteScope,
          },
        },
      },
    }),
    prisma.buyerReceipt.aggregate({
      _sum: { paidAmount: true },
      where: {
        receiptDate: previousRange,
        goldDispatch: {
          goldPour: {
            site: siteScope,
          },
        },
      },
    }),
    prisma.employee.count({
      where: {
        companyId,
        isActive: true,
      },
    }),
    prisma.employeePayment.findMany({
      where: {
        employee: { companyId },
        status: { in: ["DUE", "PARTIAL"] },
      },
      select: {
        type: true,
        amount: true,
        paidAmount: true,
      },
    }),
    prisma.payrollRun.count({
      where: {
        companyId,
        status: PayrollRunStatus.SUBMITTED,
      },
    }),
    prisma.disbursementBatch.count({
      where: {
        companyId,
        status: { in: ["SUBMITTED", "APPROVED"] },
      },
    }),
    prisma.plantReport.aggregate({
      _sum: { tonnesProcessed: true },
      where: {
        date: currentRange,
        site: siteScope,
      },
    }),
    prisma.plantReport.aggregate({
      _sum: { tonnesProcessed: true },
      where: {
        date: previousRange,
        site: siteScope,
      },
    }),
    prisma.plantReport.findMany({
      where: {
        date: currentRange,
        site: siteScope,
      },
      select: {
        date: true,
        tonnesProcessed: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.workOrder.count({
      where: {
        equipment: { site: siteScope },
        status: { in: [WorkOrderStatus.OPEN, WorkOrderStatus.IN_PROGRESS] },
      },
    }),
    prisma.inventoryItem.findMany({
      where: {
        site: siteScope,
        minStock: { not: null },
      },
      select: {
        currentStock: true,
        minStock: true,
      },
    }),
    prisma.incident.count({
      where: {
        site: siteScope,
        status: { notIn: ["CLOSED"] },
      },
    }),
    prisma.permit.count({
      where: {
        site: siteScope,
        OR: [
          {
            expiryDate: {
              lte: permitExpiringDate,
              gt: window.endDate,
            },
          },
          {
            status: "EXPIRED",
          },
        ],
      },
    }),
    prisma.cCTVEvent.count({
      where: {
        eventTime: currentRange,
        isAcknowledged: false,
        severity: { in: [EventSeverity.HIGH, EventSeverity.CRITICAL] },
        OR: [{ camera: { site: siteScope } }, { nvr: { site: siteScope } }],
      },
    }),
    prisma.goldDispatch.count({
      where: {
        buyerReceipt: { is: null },
        goldPour: {
          site: siteScope,
        },
      },
    }),
  ]);

  const openingBalanceTotal = bankAccounts.reduce((sum, row) => sum + (row.openingBalance ?? 0), 0);
  const cashPosition =
    openingBalanceTotal +
    (bankCreditsAllTime._sum.amount ?? 0) -
    (bankDebitsAllTime._sum.amount ?? 0);
  const previousCashPosition =
    openingBalanceTotal +
    (bankCreditsPrevious._sum.amount ?? 0) -
    (bankDebitsPrevious._sum.amount ?? 0);

  const openReceivables = sumOutstandingRows(currentInvoices, (row) => ({
    total: row.total ?? 0,
    paid: row.amountPaid ?? 0,
    deduction: row.creditTotal ?? 0,
    writeOff: row.writeOffTotal ?? 0,
  }));
  const openPayables = sumOutstandingRows(currentBills, (row) => ({
    total: row.total ?? 0,
    paid: row.amountPaid ?? 0,
    deduction: row.debitNoteTotal ?? 0,
    writeOff: row.writeOffTotal ?? 0,
  }));

  const receivablesDueSoon = sumOutstandingRows(dueSoonInvoices, (row) => ({
    total: row.total ?? 0,
    paid: row.amountPaid ?? 0,
    deduction: row.creditTotal ?? 0,
    writeOff: row.writeOffTotal ?? 0,
  }));
  const payablesDueSoon = sumOutstandingRows(dueSoonBills, (row) => ({
    total: row.total ?? 0,
    paid: row.amountPaid ?? 0,
    deduction: row.debitNoteTotal ?? 0,
    writeOff: row.writeOffTotal ?? 0,
  }));

  let salaryOwed = 0;
  let goldPayoutOwed = 0;
  for (const payment of employeePaymentsDue) {
    const outstanding = Math.max(0, (payment.amount ?? 0) - (payment.paidAmount ?? 0));
    if (payment.type === "SALARY") {
      salaryOwed += outstanding;
    } else {
      goldPayoutOwed += outstanding;
    }
  }

  const workforceLiability = salaryOwed + goldPayoutOwed;
  const nearTermNetPosition = receivablesDueSoon - payablesDueSoon;

  const goldProducedWeight = round(goldPoursCurrent._sum.grossWeight ?? 0);
  const previousGoldProducedWeight = round(goldPoursPrevious._sum.grossWeight ?? 0);
  const goldRealizedValue = round(buyerReceiptsCurrent._sum.paidAmount ?? 0);
  const previousGoldRealizedValue = round(buyerReceiptsPrevious._sum.paidAmount ?? 0);

  const plantThroughput = round(plantCurrent._sum.tonnesProcessed ?? 0);
  const previousPlantThroughput = round(plantPrevious._sum.tonnesProcessed ?? 0);

  const pendingApprovals = payrollSubmitted + disbursementSubmitted;

  const lowStockItems = lowStockRows.filter(
    (row) => row.minStock !== null && row.currentStock <= row.minStock,
  ).length;

  const totalRiskItems =
    openWorkOrders +
    openIncidents +
    permitsExpiring +
    criticalUnackedEvents +
    pendingApprovals +
    lowStockItems;

  const goldDailyMap = toMapPoints(
    goldPoursDaily.map((row) => ({
      date: row.pourDate,
      value: row.grossWeight ?? 0,
    })),
  );

  const throughputDailyMap = toMapPoints(
    plantDaily.map((row) => ({
      date: row.date,
      value: row.tonnesProcessed ?? 0,
    })),
  );

  const axis = buildDailyAxis(window.startDate, window.endDate);

  const goldTrend = axis.map((day) => ({
    date: day,
    value: round(goldDailyMap[day] ?? 0),
    comparison: round(previousGoldProducedWeight / window.days),
  }));

  const throughputTrend = axis.map((day) => ({
    date: day,
    value: round(throughputDailyMap[day] ?? 0),
    comparison: round(previousPlantThroughput / window.days),
  }));

  const cashTrendMap = axis.reduce<Record<string, ExecutiveCashTrendPoint>>((acc, day) => {
    acc[day] = { date: day, inflow: 0, outflow: 0, net: 0 };
    return acc;
  }, {});

  for (const transaction of bankTransactionsCurrentRange) {
    const day = dateKey(transaction.txnDate);
    const row = cashTrendMap[day];
    if (!row) continue;
    if (transaction.direction === PostingDirection.CREDIT) {
      row.inflow = round(row.inflow + (transaction.amount ?? 0));
    } else {
      row.outflow = round(row.outflow + (transaction.amount ?? 0));
    }
    row.net = round(row.inflow - row.outflow);
  }

  const cashTrend = axis.map((day) => cashTrendMap[day]);

  const riskBreakdown: ExecutiveBreakdownPoint[] = [
    { label: "Maintenance", value: openWorkOrders },
    { label: "Compliance", value: openIncidents + permitsExpiring },
    { label: "Security", value: criticalUnackedEvents },
    { label: "Approvals", value: pendingApprovals },
    { label: "Inventory", value: lowStockItems },
  ];

  const metrics: ExecutiveDashboardMetrics = {
    cashPosition: round(cashPosition),
    previousCashPosition: round(previousCashPosition),
    nearTermNetPosition: round(nearTermNetPosition),
    openReceivables: round(openReceivables),
    openPayables: round(openPayables),
    goldProducedWeight,
    previousGoldProducedWeight,
    goldRealizedValue,
    previousGoldRealizedValue,
    activeWorkers,
    salaryOwed: round(salaryOwed),
    goldPayoutOwed: round(goldPayoutOwed),
    workforceLiability: round(workforceLiability),
    pendingPayrollApprovals: payrollSubmitted,
    pendingDisbursements: disbursementSubmitted,
    plantThroughput,
    previousPlantThroughput,
    dispatchPendingReceipt: pendingDispatches,
    openWorkOrders,
    lowStockItems,
    openComplianceIncidents: openIncidents,
    permitsExpiring30Days: permitsExpiring,
    criticalUnackedCctvEvents: criticalUnackedEvents,
    totalRiskItems,
  };

  const quickLinkBadges: Record<string, ExecutiveQuickBadge> = {
    "/human-resources/approvals": { count: pendingApprovals, label: "Pending approvals" },
    "/human-resources/payroll": { count: payrollSubmitted, label: "Pending payroll" },
    "/human-resources/disbursements": {
      count: disbursementSubmitted,
      label: "Pending disbursements",
    },
    "/gold/exceptions": { count: pendingDispatches, label: "Open exceptions" },
    "/gold/settlement/receipts/new": {
      count: pendingDispatches,
      label: "Pending receipts",
    },
    "/reports/gold-chain": { count: pendingDispatches, label: "Custody gaps" },
    "/maintenance/work-orders": { count: openWorkOrders, label: "Open work orders" },
    "/reports/compliance-incidents": {
      count: openIncidents + permitsExpiring,
      label: "Open incidents",
    },
    "/compliance": { count: openIncidents + permitsExpiring, label: "Risk items" },
    "/cctv/events": { count: criticalUnackedEvents, label: "Unack events" },
    "/reports/cctv-events": { count: criticalUnackedEvents, label: "Unack events" },
    "/stores/inventory": { count: lowStockItems, label: "Low stock" },
    "/reports/downtime": {
      count: Math.max(0, Math.round(riskBreakdown.find((row) => row.label === "Maintenance")?.value ?? 0)),
      label: "Risk count",
    },
    "/reports/stores-movements": { count: lowStockItems, label: "Stock pressure" },
    "/reports/plant": {
      count: Math.max(0, Math.round(plantThroughput)),
      label: "Throughput",
    },
    "/reports/attendance": { count: activeWorkers, label: "Active workers" },
    "/reports/shift": { count: pendingApprovals, label: "Pending checks" },
    "/accounting": {
      count: Math.max(0, Math.round(openReceivables + openPayables)),
      label: "Open ledgers",
    },
    "/accounting/banking": {
      count: Math.max(0, Math.round(Math.abs(nearTermNetPosition))),
      label: "Cash delta",
    },
    "/accounting/financial-statements": {
      count: Math.max(0, Math.round(openReceivables + openPayables)),
      label: "Open finance items",
    },
  };

  return {
    generatedAt: new Date().toISOString(),
    window: {
      startDate: window.startDate.toISOString(),
      endDate: window.endDate.toISOString(),
      previousStartDate: window.previousStartDate.toISOString(),
      previousEndDate: window.previousEndDate.toISOString(),
      days: window.days,
    },
    metrics: {
      ...metrics,
      previousCashPosition: round(previousCashPosition),
      previousGoldProducedWeight: round(previousGoldProducedWeight),
      previousGoldRealizedValue: round(previousGoldRealizedValue),
      previousPlantThroughput: round(previousPlantThroughput),
    },
    charts: {
      goldTrend,
      cashTrend,
      throughputTrend,
      riskBreakdown,
    },
    quickLinkBadges,
  };
}

export function calculateDelta(current: number, previous: number): number {
  return toDeltaPercent(current, previous);
}
