import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { resolveBaseCurrency, toNumberOrZero } from "@/lib/schools/money";

/**
 * A single money figure across a school that bills in two currencies is only
 * meaningful in one of them.
 *
 * Post S-2.2 the totals below are converted to the school's base currency by
 * the database, using the rate stamped on each document rather than today's.
 * `Prisma.aggregate` cannot express the division, so this is raw — the sum is
 * `numeric` throughout, so nothing here is a float.
 */
async function sumInBaseCurrency(sql: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: Prisma.Decimal | null }>>(sql);
  return toNumberOrZero(rows[0]?.total ?? 0);
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const [
      structures,
      activeStructures,
      invoices,
      issuedInvoices,
      overdueInvoices,
      receiptsPosted,
      waivedAmount,
      outstandingBalance,
      creditOnAccount,
      baseCurrency,
    ] = await Promise.all([
        prisma.schoolFeeStructure.count({ where: { companyId } }),
        prisma.schoolFeeStructure.count({ where: { companyId, status: "ACTIVE" } }),
        prisma.schoolFeeInvoice.count({ where: { companyId } }),
        prisma.schoolFeeInvoice.count({
          where: { companyId, status: { in: ["ISSUED", "PART_PAID"] } },
        }),
        prisma.schoolFeeInvoice.count({
          where: {
            companyId,
            dueDate: { lt: new Date() },
            status: { in: ["ISSUED", "PART_PAID"] },
            balanceAmount: { gt: 0 },
          },
        }),
        prisma.schoolFeeReceipt.count({ where: { companyId, status: "POSTED" } }),
        sumInBaseCurrency(Prisma.sql`
          SELECT COALESCE(SUM(ROUND("amount" / "exchangeRate", 2)), 0) AS total
          FROM "SchoolFeeWaiver"
          WHERE "companyId" = ${companyId} AND "status" = 'APPLIED'
        `),
        sumInBaseCurrency(Prisma.sql`
          SELECT COALESCE(SUM(ROUND("balanceAmount" / "exchangeRate", 2)), 0) AS total
          FROM "SchoolFeeInvoice"
          WHERE "companyId" = ${companyId} AND "status" IN ('ISSUED', 'PART_PAID')
        `),
        // S-2.5. What the school is holding that is not its own: overpayments
        // sitting on posted receipts, plus invoices settled beyond their total.
        // Net of anything a requested refund is already holding, because that
        // money is spoken for and showing it as spendable would be a lie the
        // bursar acts on.
        sumInBaseCurrency(Prisma.sql`
          SELECT COALESCE((
            SELECT SUM(ROUND(("amountUnallocated" - "refundedAmount") / "exchangeRate", 2))
            FROM "SchoolFeeReceipt"
            WHERE "companyId" = ${companyId}
              AND "status" = 'POSTED'
              AND "amountUnallocated" > "refundedAmount"
          ), 0) + COALESCE((
            SELECT SUM(ROUND(("creditAmount" - "refundedAmount") / "exchangeRate", 2))
            FROM "SchoolFeeInvoice"
            WHERE "companyId" = ${companyId}
              AND "status" <> 'VOIDED'
              AND "creditAmount" > "refundedAmount"
          ), 0) AS total
        `),
        resolveBaseCurrency(companyId),
      ]);

    return successResponse({
      success: true,
      data: {
        resource: "schools-fees",
        companyId,
        summary: {
          structures,
          activeStructures,
          invoices,
          issuedInvoices,
          overdueInvoices,
          receiptsPosted,
          /** The currency the money figures below are stated in. */
          currency: baseCurrency,
          waivedAmount,
          outstandingBalance,
          creditOnAccount,
        },
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/fees error:", error);
    return errorResponse("Failed to fetch schools fees summary");
  }
}
