import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";

function parseDateParam(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDateFilter(startDate: Date | null, endDate: Date | null) {
  if (!startDate && !endDate) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (startDate) filter.gte = startDate;
  if (endDate) filter.lte = endDate;
  return filter;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get("periodId");
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    let startDate = parseDateParam(startParam);
    let endDate = parseDateParam(endParam);

    if ((startParam && !startDate) || (endParam && !endDate)) {
      return errorResponse("Invalid date range", 400);
    }

    if (periodId) {
      const period = await prisma.accountingPeriod.findUnique({
        where: { id: periodId },
        select: { companyId: true, startDate: true, endDate: true },
      });
      if (!period || period.companyId !== session.user.companyId) {
        return errorResponse("Accounting period not found", 404);
      }
      startDate = period.startDate;
      endDate = period.endDate;
    }

    const dateFilter = buildDateFilter(startDate, endDate);

    const [salesGrouped, purchasesGrouped] = await Promise.all([
      prisma.salesInvoiceLine.groupBy({
        by: ["taxCodeId"],
        where: {
          taxCodeId: { not: null },
          invoice: {
            companyId: session.user.companyId,
            status: { in: ["ISSUED", "PAID"] },
            ...(dateFilter ? { invoiceDate: dateFilter } : {}),
          },
        },
        _sum: { taxAmount: true },
      }),
      prisma.purchaseBillLine.groupBy({
        by: ["taxCodeId"],
        where: {
          taxCodeId: { not: null },
          bill: {
            companyId: session.user.companyId,
            status: { in: ["RECEIVED", "PAID"] },
            ...(dateFilter ? { billDate: dateFilter } : {}),
          },
        },
        _sum: { taxAmount: true },
      }),
    ]);

    const outputMap = new Map<string, number>();
    salesGrouped.forEach((row) => {
      if (row.taxCodeId) {
        outputMap.set(row.taxCodeId, toMoney(row._sum.taxAmount));
      }
    });

    const inputMap = new Map<string, number>();
    purchasesGrouped.forEach((row) => {
      if (row.taxCodeId) {
        inputMap.set(row.taxCodeId, toMoney(row._sum.taxAmount));
      }
    });

    const taxCodeIds = Array.from(new Set([...outputMap.keys(), ...inputMap.keys()]));
    const taxCodes = taxCodeIds.length
      ? await prisma.taxCode.findMany({
          where: { id: { in: taxCodeIds }, companyId: session.user.companyId },
          select: { id: true, code: true, name: true, rate: true },
          orderBy: [{ code: "asc" }],
        })
      : [];

    const rows = taxCodes.map((tax) => {
      const outputTax = outputMap.get(tax.id) ?? 0;
      const inputTax = inputMap.get(tax.id) ?? 0;
      return {
        taxCodeId: tax.id,
        code: tax.code,
        name: tax.name,
        rate: tax.rate,
        outputTax,
        inputTax,
        netTax: outputTax - inputTax,
      };
    });

    const totals = rows.reduce(
      (acc, row) => ({
        outputTax: acc.outputTax + row.outputTax,
        inputTax: acc.inputTax + row.inputTax,
        netTax: acc.netTax + row.netTax,
      }),
      { outputTax: 0, inputTax: 0, netTax: 0 },
    );

    return successResponse({
      startDate: startDate ? startDate.toISOString() : null,
      endDate: endDate ? endDate.toISOString() : null,
      rows,
      totals,
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/reports/vat-summary error:", error);
    return errorResponse("Failed to fetch VAT summary");
  }
}
