import { NextRequest, NextResponse } from "next/server";
import { startOfMonth, subDays } from "date-fns";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "./_helpers";

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-999, Math.min(999, value));
}

function pctChange(current: number, previous: number) {
  if (!Number.isFinite(previous) || Math.abs(previous) < 0.0001) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function monthLabel(value: Date) {
  return value.toLocaleDateString(undefined, { month: "short" });
}

const COGS_KEYWORDS = ["cogs", "cost of sales", "cost of goods", "inventory consumed"];
const DEPRECIATION_KEYWORDS = ["depreciation", "amortization"];
const INTEREST_KEYWORDS = ["interest"];
const TAX_KEYWORDS = ["income tax", "tax expense", "corporate tax"];
const REVENUE_KEYWORDS = ["revenue", "sales", "turnover"];
const OPEX_KEYWORDS = [
  "operations",
  "operating",
  "rent",
  "utilities",
  "salary",
  "wages",
  "marketing",
  "maintenance",
  "admin",
];

const REVENUE_CODE_PREFIXES = ["4"];
const COGS_CODE_PREFIXES = ["500"];
const OPEX_CODE_PREFIXES = ["51", "52", "53", "54", "55", "56", "57", "58", "59"];
const DEPRECIATION_CODE_PREFIXES = ["580", "581", "582", "583", "584", "585", "586", "587"];
const INTEREST_CODE_PREFIXES = ["570", "571", "572", "573", "574", "575", "576", "577"];
const TAX_EXPENSE_CODE_PREFIXES = ["590", "591", "592", "593", "594", "595", "596", "597"];

type ProfitModel = "ACCOUNTING_POSTED" | "ESTIMATED_FROM_OPERATIONS";

type MonthlyProfitRow = {
  id: string;
  label: string;
  revenue: number;
  refunds: number;
  voids: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpense: number;
  ebitda: number;
  netProfit: number;
  tickets: number;
  averageTicket: number;
};

type JournalBuckets = Record<
  string,
  {
    income: number;
    cogs: number;
    operatingExpense: number;
    depreciationAmortization: number;
    interest: number;
    taxExpense: number;
  }
>;

type ProfitBucket = "revenue" | "cogs" | "operatingExpense" | "depreciationAmortization" | "interest" | "taxExpense";

type AccountSignature = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
};

type PostingRuleSignature = {
  sourceType: string;
  lines: Array<{
    direction: "DEBIT" | "CREDIT";
    basis: "AMOUNT" | "NET" | "TAX" | "GROSS" | "DEDUCTIONS" | "ALLOWANCES";
    account: AccountSignature;
  }>;
};

function toSignature(account: Pick<AccountSignature, "id" | "code" | "name" | "category" | "type">) {
  return `${account.code} ${account.name} ${account.category ?? ""}`.toLowerCase();
}

function hasAnyKeyword(signature: string, keywords: string[]) {
  return keywords.some((keyword) => signature.includes(keyword));
}

function hasCodePrefix(code: string, prefixes: string[]) {
  return prefixes.some((prefix) => code.startsWith(prefix));
}

function classifyExpenseAccount(account: AccountSignature): Exclude<ProfitBucket, "revenue"> {
  const signature = toSignature(account);

  if (
    hasAnyKeyword(signature, COGS_KEYWORDS) ||
    String(account.category ?? "").toLowerCase() === "cogs" ||
    hasCodePrefix(account.code, COGS_CODE_PREFIXES)
  ) {
    return "cogs";
  }
  if (
    hasAnyKeyword(signature, DEPRECIATION_KEYWORDS) ||
    hasCodePrefix(account.code, DEPRECIATION_CODE_PREFIXES)
  ) {
    return "depreciationAmortization";
  }
  if (
    hasAnyKeyword(signature, INTEREST_KEYWORDS) ||
    hasCodePrefix(account.code, INTEREST_CODE_PREFIXES)
  ) {
    return "interest";
  }
  if (
    hasAnyKeyword(signature, TAX_KEYWORDS) ||
    hasCodePrefix(account.code, TAX_EXPENSE_CODE_PREFIXES)
  ) {
    return "taxExpense";
  }
  if (hasAnyKeyword(signature, OPEX_KEYWORDS) || hasCodePrefix(account.code, OPEX_CODE_PREFIXES)) {
    return "operatingExpense";
  }
  return "operatingExpense";
}

function classifyIncomeAccount(account: AccountSignature): ProfitBucket {
  const signature = toSignature(account);
  if (hasAnyKeyword(signature, REVENUE_KEYWORDS) || hasCodePrefix(account.code, REVENUE_CODE_PREFIXES)) {
    return "revenue";
  }
  return "revenue";
}

function buildPostingRuleAccountBuckets(rules: PostingRuleSignature[]) {
  const buckets: Record<ProfitBucket, Set<string>> = {
    revenue: new Set<string>(),
    cogs: new Set<string>(),
    operatingExpense: new Set<string>(),
    depreciationAmortization: new Set<string>(),
    interest: new Set<string>(),
    taxExpense: new Set<string>(),
  };

  for (const rule of rules) {
    for (const line of rule.lines) {
      const sourceType = rule.sourceType;
      const account = line.account;
      const isRevenueSignal =
        (sourceType === "RETAIL_SALE" || sourceType === "SALES_INVOICE") &&
        line.direction === "CREDIT" &&
        line.basis !== "TAX" &&
        account.type === "INCOME";

      if (isRevenueSignal) {
        buckets.revenue.add(account.id);
        continue;
      }

      if (account.type === "EXPENSE") {
        const expenseBucket = classifyExpenseAccount(account);
        buckets[expenseBucket].add(account.id);
      }
    }
  }

  return buckets;
}

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const companyId = session.user.companyId;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const sevenDaysAgo = subDays(now, 6);
  const analyticsStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1));
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const previousTrendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1));
  const previousTrendEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));

  const [
    allSales,
    receipts,
    openShifts,
    catalogItems,
    promotions,
    purchaseOrders,
    inventoryItems,
    recentSales,
    journalLines,
    postingRules,
  ] = await Promise.all([
    prisma.retailSale.findMany({
      where: {
        companyId,
        createdAt: { gte: analyticsStart },
      },
      include: {
        payments: true,
        lines: true,
      },
      orderBy: { postedAt: "desc" },
    }),
    prisma.retailGoodsReceipt.findMany({
      where: { companyId, createdAt: { gte: analyticsStart } },
      include: { lines: true },
    }),
    prisma.retailShift.findMany({
      where: { companyId, status: "OPEN" },
      orderBy: { openedAt: "asc" },
      take: 8,
    }),
    prisma.retailCatalogItem.findMany({
      where: { companyId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.retailPromotion.findMany({
      where: { companyId, status: "ACTIVE" },
    }),
    prisma.retailPurchaseOrder.findMany({
      where: {
        companyId,
        status: { in: ["DRAFT", "APPROVED", "PARTIAL"] },
      },
      include: { lines: true },
    }),
    prisma.inventoryItem.findMany({
      where: { site: { companyId } },
      orderBy: { currentStock: "asc" },
      take: 200,
    }),
    prisma.retailSale.findMany({
      where: { companyId },
      include: { payments: true, lines: true },
      orderBy: { postedAt: "desc" },
      take: 12,
    }),
    prisma.journalLine.findMany({
      where: {
        entry: {
          companyId,
          status: "POSTED",
          entryDate: { gte: analyticsStart },
        },
      },
      include: {
        account: true,
        entry: {
          select: {
            entryDate: true,
          },
        },
      },
    }),
    prisma.postingRule.findMany({
      where: {
        companyId,
        isActive: true,
        sourceType: {
          in: ["RETAIL_SALE", "RETAIL_REFUND", "RETAIL_GOODS_RECEIPT", "SALES_INVOICE", "PURCHASE_BILL"],
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    }),
  ]);

  const sales = allSales.filter((sale) => (sale.postedAt ?? sale.createdAt) >= monthStart);
  const retailInventoryIds = new Set(catalogItems.map((item) => item.inventoryItemId));
  const retailInventory = inventoryItems.filter((item) => retailInventoryIds.has(item.id));
  const lowStock = retailInventory.filter(
    (item) => item.minStock !== null && item.currentStock <= (item.minStock ?? 0),
  );

  const postedSales = sales.filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED");
  const refunds = sales.filter((sale) => sale.saleType === "REFUND" && sale.status === "POSTED");
  const voids = sales.filter((sale) => sale.saleType === "VOID" && sale.status === "POSTED");
  const grossSales = sum(postedSales.map((sale) => sale.totalAmount));
  const netSales = sum(sales.map((sale) => sale.totalAmount));
  const refundValue = Math.abs(sum(refunds.map((sale) => sale.totalAmount)));
  const voidValue = Math.abs(sum(voids.map((sale) => sale.totalAmount)));
  const discountValue = sum(postedSales.map((sale) => sale.discountAmount));
  const taxValue = sum(postedSales.map((sale) => sale.taxAmount));
  const goodsReceivedValue = sum(
    receipts
      .filter((receipt) => (receipt.postedAt ?? receipt.createdAt) >= monthStart)
      .flatMap((receipt) => receipt.lines)
      .map((line) => line.lineTotal),
  );
  const openOrderValue = sum(
    purchaseOrders.flatMap((order) => order.lines).map((line) => line.lineTotal),
  );

  const tenderTotals = sales.flatMap((sale) => sale.payments).reduce<Record<string, number>>(
    (accumulator, payment) => {
      accumulator[payment.tenderType] = (accumulator[payment.tenderType] ?? 0) + payment.amount;
      return accumulator;
    },
    {},
  );

  const salesTrend = Array.from({ length: 7 }).map((_, index) => {
    const day = subDays(now, 6 - index);
    const key = day.toISOString().slice(0, 10);
    const daySales = sales.filter(
      (sale) => (sale.postedAt ?? sale.createdAt).toISOString().slice(0, 10) === key,
    );
    return {
      id: key,
      label: day.toLocaleDateString(undefined, { weekday: "short" }),
      sales: sum(daySales.map((sale) => sale.totalAmount)),
      tickets: daySales.length,
    };
  });

  const topItems = recentSales
    .flatMap((sale) => sale.lines)
    .reduce<Record<string, { itemName: string; quantity: number; value: number }>>(
      (accumulator, line) => {
        const bucket = accumulator[line.itemName] ?? {
          itemName: line.itemName,
          quantity: 0,
          value: 0,
        };
        bucket.quantity += line.quantity;
        bucket.value += line.lineTotal;
        accumulator[line.itemName] = bucket;
        return accumulator;
      },
      {},
    );

  const dailySales = sales.filter((sale) => (sale.postedAt ?? sale.createdAt) >= sevenDaysAgo);

  const receiptCostByMonth = receipts.reduce<Record<string, number>>((accumulator, receipt) => {
    const postedAt = receipt.postedAt ?? receipt.createdAt;
    const key = monthKey(postedAt);
    const value = sum(receipt.lines.map((line) => line.lineTotal));
    accumulator[key] = (accumulator[key] ?? 0) + value;
    return accumulator;
  }, {});

  const postingRuleBuckets = buildPostingRuleAccountBuckets(
    postingRules.map((rule) => ({
      sourceType: rule.sourceType,
      lines: rule.lines.map((line) => ({
        direction: line.direction,
        basis: line.basis,
        account: {
          id: line.account.id,
          code: line.account.code,
          name: line.account.name,
          category: line.account.category,
          type: line.account.type,
        },
      })),
    })),
  );

  const hasJournalProfitData = journalLines.length > 0;
  const journalByMonth = journalLines.reduce<JournalBuckets>((accumulator, line) => {
    const key = monthKey(line.entry.entryDate);
    const accountType = line.account.type;
    const amount =
      accountType === "INCOME" ? line.credit - line.debit : line.debit - line.credit;
    const bucket = accumulator[key] ?? {
      income: 0,
      cogs: 0,
      operatingExpense: 0,
      depreciationAmortization: 0,
      interest: 0,
      taxExpense: 0,
    };

    const lineAccount: AccountSignature = {
      id: line.account.id,
      code: line.account.code,
      name: line.account.name,
      category: line.account.category,
      type: line.account.type,
    };

    if (accountType === "INCOME") {
      const hasRuleRevenueSet = postingRuleBuckets.revenue.size > 0;
      const isRevenue = hasRuleRevenueSet
        ? postingRuleBuckets.revenue.has(line.account.id)
        : classifyIncomeAccount(lineAccount) === "revenue";
      if (isRevenue) {
        bucket.income += amount;
      }
    } else if (accountType === "EXPENSE") {
      let expenseBucket: Exclude<ProfitBucket, "revenue">;
      if (postingRuleBuckets.cogs.has(line.account.id)) {
        expenseBucket = "cogs";
      } else if (postingRuleBuckets.depreciationAmortization.has(line.account.id)) {
        expenseBucket = "depreciationAmortization";
      } else if (postingRuleBuckets.interest.has(line.account.id)) {
        expenseBucket = "interest";
      } else if (postingRuleBuckets.taxExpense.has(line.account.id)) {
        expenseBucket = "taxExpense";
      } else {
        expenseBucket = classifyExpenseAccount(lineAccount);
      }

      if (expenseBucket === "cogs") {
        bucket.cogs += amount;
      } else if (expenseBucket === "depreciationAmortization") {
        bucket.depreciationAmortization += amount;
      } else if (expenseBucket === "interest") {
        bucket.interest += amount;
      } else if (expenseBucket === "taxExpense") {
        bucket.taxExpense += amount;
      } else {
        bucket.operatingExpense += amount;
      }
    }

    accumulator[key] = bucket;
    return accumulator;
  }, {});

  const postedSaleRows = allSales.filter((sale) => sale.status === "POSTED");
  const monthlySalesMap = postedSaleRows.reduce<
    Record<string, { sale: number; refund: number; void: number; tickets: number; discounts: number }>
  >((accumulator, sale) => {
    const key = monthKey(sale.postedAt ?? sale.createdAt);
    const bucket = accumulator[key] ?? { sale: 0, refund: 0, void: 0, tickets: 0, discounts: 0 };

    if (sale.saleType === "SALE") {
      bucket.sale += sale.totalAmount;
      bucket.tickets += 1;
      bucket.discounts += sale.discountAmount;
    } else if (sale.saleType === "REFUND") {
      bucket.refund += Math.abs(sale.totalAmount);
    } else if (sale.saleType === "VOID") {
      bucket.void += Math.abs(sale.totalAmount);
    }

    accumulator[key] = bucket;
    return accumulator;
  }, {});

  const monthlyProfit: MonthlyProfitRow[] = Array.from({ length: 12 }).map((_, idx) => {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - idx), 1));
    const key = monthKey(monthDate);
    const salesBucket = monthlySalesMap[key] ?? {
      sale: 0,
      refund: 0,
      void: 0,
      tickets: 0,
      discounts: 0,
    };
    const netRevenue = salesBucket.sale - salesBucket.refund - salesBucket.void;
    const journalBucket = journalByMonth[key];
    const estimatedOpex = Math.max(
      netRevenue * 0.08,
      salesBucket.discounts + salesBucket.refund * 0.2 + salesBucket.void * 0.15,
    );
    const cogs = journalBucket?.cogs ?? receiptCostByMonth[key] ?? netRevenue * 0.55;
    const operatingExpense = journalBucket?.operatingExpense ?? estimatedOpex;
    const depreciationAmortization = journalBucket?.depreciationAmortization ?? netRevenue * 0.015;
    const interest = journalBucket?.interest ?? netRevenue * 0.01;
    const taxExpense =
      journalBucket?.taxExpense ??
      Math.max(0, (netRevenue - cogs - operatingExpense - depreciationAmortization - interest) * 0.24);

    const grossProfit = netRevenue - cogs;
    const ebitda = grossProfit - operatingExpense;
    const netProfit = ebitda - depreciationAmortization - interest - taxExpense;

    return {
      id: key,
      label: monthLabel(monthDate),
      revenue: salesBucket.sale,
      refunds: salesBucket.refund,
      voids: salesBucket.void,
      netRevenue,
      cogs,
      grossProfit,
      operatingExpense,
      ebitda,
      netProfit,
      tickets: salesBucket.tickets,
      averageTicket: salesBucket.tickets > 0 ? netRevenue / salesBucket.tickets : 0,
    };
  });

  const previousPeriod = Array.from({ length: 12 }).map((_, idx) => {
    const monthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (23 - idx), 1),
    );
    const key = monthKey(monthDate);
    const salesBucket = monthlySalesMap[key] ?? { sale: 0, refund: 0, void: 0, tickets: 0, discounts: 0 };
    const netRevenue = salesBucket.sale - salesBucket.refund - salesBucket.void;
    const journalBucket = journalByMonth[key];
    const cogs = journalBucket?.cogs ?? receiptCostByMonth[key] ?? netRevenue * 0.55;
    const operatingExpense =
      journalBucket?.operatingExpense ??
      Math.max(
        netRevenue * 0.08,
        salesBucket.discounts + salesBucket.refund * 0.2 + salesBucket.void * 0.15,
      );
    const depreciationAmortization = journalBucket?.depreciationAmortization ?? netRevenue * 0.015;
    const interest = journalBucket?.interest ?? netRevenue * 0.01;
    const taxExpense =
      journalBucket?.taxExpense ??
      Math.max(0, (netRevenue - cogs - operatingExpense - depreciationAmortization - interest) * 0.24);
    const grossProfit = netRevenue - cogs;
    const ebitda = grossProfit - operatingExpense;
    const netProfit = ebitda - depreciationAmortization - interest - taxExpense;

    return {
      id: key,
      label: monthLabel(monthDate),
      netRevenue,
      grossProfit,
      ebitda,
      netProfit,
      averageTicket: salesBucket.tickets > 0 ? netRevenue / salesBucket.tickets : 0,
    };
  });

  const current = monthlyProfit[monthlyProfit.length - 1] ?? {
    netRevenue: 0,
    grossProfit: 0,
    ebitda: 0,
    netProfit: 0,
  };
  const previous = monthlyProfit[monthlyProfit.length - 2] ?? {
    netRevenue: 0,
    grossProfit: 0,
    ebitda: 0,
    netProfit: 0,
  };

  const runRate = current.netRevenue * 12;
  const grossMargin = current.netRevenue > 0 ? (current.grossProfit / current.netRevenue) * 100 : 0;
  const ebitdaMargin = current.netRevenue > 0 ? (current.ebitda / current.netRevenue) * 100 : 0;
  const netMargin = current.netRevenue > 0 ? (current.netProfit / current.netRevenue) * 100 : 0;
  const inventoryPressurePct =
    catalogItems.length > 0 ? (lowStock.length / catalogItems.length) * 100 : 0;

  const profitModel: ProfitModel = hasJournalProfitData
    ? "ACCOUNTING_POSTED"
    : "ESTIMATED_FROM_OPERATIONS";

  const highlightRows = [
    {
      id: "gross-margin",
      title: "Gross margin",
      value: `${grossMargin.toFixed(1)}%`,
      deltaPct: clampPercent(pctChange(current.grossProfit, previous.grossProfit)),
      detail: "Operating profitability after inventory cost.",
      tone: grossMargin >= 35 ? "success" : grossMargin >= 20 ? "warning" : "danger",
    },
    {
      id: "ebitda",
      title: "EBITDA",
      value: current.ebitda,
      deltaPct: clampPercent(pctChange(current.ebitda, previous.ebitda)),
      detail: "Core earnings before financing and non-cash expenses.",
      tone: current.ebitda >= 0 ? "success" : "danger",
    },
    {
      id: "net-profit",
      title: "Net profit",
      value: current.netProfit,
      deltaPct: clampPercent(pctChange(current.netProfit, previous.netProfit)),
      detail: "Bottom-line profit after all modeled costs.",
      tone: current.netProfit >= 0 ? "success" : "danger",
    },
  ];

  const trendRows = monthlyProfit.map((row, index) => ({
    id: row.id,
    label: row.label,
    netRevenue: row.netRevenue,
    grossProfit: row.grossProfit,
    ebitda: row.ebitda,
    netProfit: row.netProfit,
    averageTicket: row.averageTicket,
    previousNetRevenue: previousPeriod[index]?.netRevenue ?? 0,
    previousGrossProfit: previousPeriod[index]?.grossProfit ?? 0,
    previousEbitda: previousPeriod[index]?.ebitda ?? 0,
    previousNetProfit: previousPeriod[index]?.netProfit ?? 0,
    previousAverageTicket: previousPeriod[index]?.averageTicket ?? 0,
  }));

  return successResponse({
    summary: {
      grossSales,
      netSales,
      refundValue,
      voidValue,
      discountValue,
      taxValue,
      goodsReceivedValue,
      openOrderValue,
      activeCatalogCount: catalogItems.length,
      activePromotionCount: promotions.length,
      openShiftCount: openShifts.length,
      lowStockCount: lowStock.length,
      ticketCount: postedSales.length,
      averageTicket:
        postedSales.length > 0
          ? sum(postedSales.map((sale) => sale.totalAmount)) / postedSales.length
          : 0,
      sevenDaySales: sum(dailySales.map((sale) => sale.totalAmount)),
    },
    ownerMetrics: {
      model: profitModel,
      taxonomy: {
        strategy: "POSTING_RULES_THEN_CODE_FALLBACK",
        hasPostingRules: postingRules.length > 0,
        mappedAccountCounts: {
          revenue: postingRuleBuckets.revenue.size,
          cogs: postingRuleBuckets.cogs.size,
          operatingExpense: postingRuleBuckets.operatingExpense.size,
          depreciationAmortization: postingRuleBuckets.depreciationAmortization.size,
          interest: postingRuleBuckets.interest.size,
          taxExpense: postingRuleBuckets.taxExpense.size,
        },
      },
      period: {
        start: trendStart.toISOString(),
        end: now.toISOString(),
      },
      previousPeriod: {
        start: previousTrendStart.toISOString(),
        end: previousTrendEnd.toISOString(),
      },
      kpis: {
        grossProfit: current.grossProfit,
        grossMarginPct: grossMargin,
        ebitda: current.ebitda,
        ebitdaMarginPct: ebitdaMargin,
        netProfit: current.netProfit,
        netMarginPct: netMargin,
        monthlyRunRateRevenue: runRate,
        inventoryPressurePct,
      },
      momentum: {
        revenueDeltaPct: clampPercent(pctChange(current.netRevenue, previous.netRevenue)),
        grossProfitDeltaPct: clampPercent(pctChange(current.grossProfit, previous.grossProfit)),
        ebitdaDeltaPct: clampPercent(pctChange(current.ebitda, previous.ebitda)),
        netProfitDeltaPct: clampPercent(pctChange(current.netProfit, previous.netProfit)),
      },
      highlights: highlightRows,
      trend: trendRows,
      costBridge: {
        revenue: current.netRevenue,
        cogs: current.cogs,
        operatingExpense: current.operatingExpense,
        ebitda: current.ebitda,
        netProfit: current.netProfit,
      },
    },
    salesTrend,
    tenderMix: Object.entries(tenderTotals).map(([tenderType, amount]) => ({
      tenderType,
      amount,
    })),
    topItems: Object.values(topItems)
      .sort((left, right) => right.value - left.value)
      .slice(0, 8),
    openShifts: openShifts.map((shift) => ({
      id: shift.id,
      shiftNo: shift.shiftNo,
      registerName: shift.registerName,
      siteId: shift.siteId,
      cashierName: shift.cashierName,
      openedAt: shift.openedAt,
      expectedCash: shift.expectedCash,
      openingFloat: shift.openingFloat,
    })),
    lowStock: lowStock.slice(0, 10).map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      currentStock: item.currentStock,
      minStock: item.minStock ?? 0,
      unit: item.unit,
    })),
    recentSales: recentSales.map((sale) => ({
      id: sale.id,
      saleNo: sale.saleNo,
      saleType: sale.saleType,
      status: sale.status,
      postedAt: sale.postedAt ?? sale.createdAt,
      cashierName: sale.cashierName,
      totalAmount: sale.totalAmount,
      itemCount: sale.lines.reduce((total, line) => total + line.quantity, 0),
      tenderTypes: sale.payments.map((payment) => payment.tenderType),
    })),
  });
}
