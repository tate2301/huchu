import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { getCashFlowReport, getFinancialStatements } from "@/lib/accounting/ledger";

function parseDateParam(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const startDate = parseDateParam(searchParams.get("startDate"));
    const endDate = parseDateParam(searchParams.get("endDate"));
    const branchId = searchParams.get("branchId");

    if ((searchParams.get("startDate") && !startDate) || (searchParams.get("endDate") && !endDate)) {
      return errorResponse("Invalid date filter", 400);
    }

    const [financials, cashFlow] = await Promise.all([
      getFinancialStatements({
        companyId: session.user.companyId,
        startDate,
        endDate,
      }),
      getCashFlowReport({
        companyId: session.user.companyId,
        startDate,
        endDate,
      }),
    ]);

    const kpis = {
      income: financials.profitAndLoss.totals.income,
      expenses: financials.profitAndLoss.totals.expenses,
      netIncome: financials.profitAndLoss.totals.netIncome,
      assets: financials.balanceSheet.totals.assets,
      liabilities: financials.balanceSheet.totals.liabilities,
      equity: financials.balanceSheet.totals.equity,
      netCash: cashFlow.totals.netCash,
      totalDebit: financials.trialBalance.totals.debit,
      totalCredit: financials.trialBalance.totals.credit,
    };

    const accountTypeMap = new Map<string, number>();
    for (const row of financials.trialBalance.rows) {
      accountTypeMap.set(row.type, (accountTypeMap.get(row.type) ?? 0) + Math.abs(row.balance));
    }

    return successResponse({
      kpis,
      charts: {
        pnlBreakdown: [
          { label: "Income", amount: kpis.income },
          { label: "Expenses", amount: kpis.expenses },
          { label: "Net Income", amount: kpis.netIncome },
        ],
        balanceComposition: [
          { label: "Assets", amount: kpis.assets },
          { label: "Liabilities", amount: kpis.liabilities },
          { label: "Equity", amount: kpis.equity },
        ],
        cashFlowComposition: [
          { label: "Operating", amount: cashFlow.totals.operating },
          { label: "Investing", amount: cashFlow.totals.investing },
          { label: "Financing", amount: cashFlow.totals.financing },
          { label: "Net Cash", amount: cashFlow.totals.netCash },
        ],
        accountTypeBreakdown: Array.from(accountTypeMap.entries()).map(([type, amount]) => ({
          type,
          amount,
        })),
      },
      meta: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        branchId: branchId || null,
        branchMode: "company-wide",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/hubs/financial-reports-summary error:", error);
    return errorResponse("Failed to fetch financial reports summary");
  }
}
