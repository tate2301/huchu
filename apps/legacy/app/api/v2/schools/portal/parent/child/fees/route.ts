import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";

import { scopeToChild } from "../_guard";

/**
 * S-6.6 — what a family owes, broken down by what it is for.
 *
 * Invoice LINES, not one total. "Fees: $450" is a number a parent cannot check;
 * "Tuition 380, Sports 25, Books 45" is one they can, and it is the difference
 * between a bill they pay and a bill they ring the office about. The prototype
 * shows the same thing.
 *
 * Receipts come back alongside so the screen can offer a parent the receipt for
 * a payment they have already made (S-6.7) without a second round trip.
 *
 * Money is serialised as strings. `successResponse` would turn Decimals into
 * numbers on the way out, and a balance that passes through a float is one that
 * can print a cent wrong on a bill.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const scope = await scopeToChild({
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      studentId: searchParams.get("childId"),
      needs: "financials",
    });
    if (!scope.ok) return scope.response;

    const [invoices, receipts] = await Promise.all([
      prisma.schoolFeeInvoice.findMany({
        where: {
          companyId: session.user.companyId,
          studentId: scope.studentId,
          status: { notIn: ["DRAFT", "VOIDED"] },
        },
        orderBy: { issueDate: "desc" },
        select: {
          id: true,
          invoiceNo: true,
          issueDate: true,
          dueDate: true,
          status: true,
          currency: true,
          totalAmount: true,
          paidAmount: true,
          balanceAmount: true,
          term: { select: { id: true, name: true } },
          lines: {
            orderBy: { feeCode: "asc" },
            select: { id: true, feeCode: true, description: true, lineTotal: true },
          },
        },
      }),
      prisma.schoolFeeReceipt.findMany({
        where: {
          companyId: session.user.companyId,
          studentId: scope.studentId,
          status: "POSTED",
        },
        orderBy: { receiptDate: "desc" },
        select: {
          id: true,
          receiptNo: true,
          receiptDate: true,
          paymentMethod: true,
          reference: true,
          currency: true,
          amountReceived: true,
        },
      }),
    ]);

    return successResponse({
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        issueDate: invoice.issueDate.toISOString(),
        dueDate: invoice.dueDate.toISOString(),
        status: invoice.status,
        currency: invoice.currency,
        total: invoice.totalAmount.toFixed(2),
        paid: invoice.paidAmount.toFixed(2),
        balance: invoice.balanceAmount.toFixed(2),
        term: invoice.term,
        lines: invoice.lines.map((line) => ({
          id: line.id,
          feeCode: line.feeCode,
          description: line.description,
          amount: line.lineTotal.toFixed(2),
        })),
      })),
      receipts: receipts.map((receipt) => ({
        id: receipt.id,
        receiptNo: receipt.receiptNo,
        receiptDate: receipt.receiptDate.toISOString(),
        method: receipt.paymentMethod,
        reference: receipt.reference,
        currency: receipt.currency,
        amount: receipt.amountReceived.toFixed(2),
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/portal/parent/child/fees error:", error);
    return errorResponse("Failed to load fees");
  }
}
