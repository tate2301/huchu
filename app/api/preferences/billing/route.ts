import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { computeCompanyPricing } from "@/lib/platform/entitlements";
import { getSubscriptionHealth } from "@/lib/platform/subscription";
import { VERTICAL_ORDER, VERTICALS } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/lib/vane/settings";

const BILLING_VIEW_ROLES = new Set(["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"]);

/**
 * The board draws four invoice rows with a Download beside each. There are no
 * invoices. `SalesInvoice` and `SchoolFeeInvoice` are the tenant's invoices to
 * its own customers; nothing in this schema issues a document to the tenant for
 * its own subscription — no number series, no tax lines, no rendered PDF, no
 * storage.
 *
 * What does exist is the money: `SubscriptionPayment` records a period, a date,
 * an amount and the gateway's reference for every charge that settled. That is
 * what the board's rows actually say, minus the Download, so this returns
 * payments and names them payments. A Download button with nothing behind it
 * would be worse than no button.
 */
const PAYMENT_HISTORY_LIMIT = 12;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!BILLING_VIEW_ROLES.has(session.user.role)) {
      return errorResponse("Insufficient permissions to view billing", 403);
    }

    const companyId = session.user.companyId;

    const [company, subscription, pricing, health, paymentHistory, vaneSettings, vaneJobs] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          slug: true,
          tenantStatus: true,
          workspaceProfile: true,
        },
      }),
      prisma.companySubscription.findFirst({
        where: { companyId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          startedAt: true,
          trialEndsAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
        },
      }),
      // Priced live: its verticals at the rate its member count sets today.
      computeCompanyPricing(companyId),
      getSubscriptionHealth(companyId),
      // Settled charges only. An INITIATED or FAILED attempt is not a thing a
      // tenant is owed a record of on a settings page, and the index this
      // rides on is ([companyId, status, createdAt]).
      prisma.subscriptionPayment.findMany({
        where: { companyId, status: "PAID" },
        // `paidAt` is nullable, and Postgres sorts NULLs first on DESC — a PAID
        // row with no settlement date would otherwise head the list.
        orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: PAYMENT_HISTORY_LIMIT,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          paidAt: true,
          periodMonths: true,
          provider: true,
          providerReference: true,
        },
      }),
      prisma.vaneSettings.findUnique({ where: { companyId }, select: { monthlyAllowance: true } }),
      prisma.vaneJob.count({
        where: { companyId, status: "DONE", finishedAt: { gte: monthBounds().start, lt: monthBounds().next } },
      }),
    ]);

    // The verticals it could add, each at the rate it pays today. Adding one
    // is arranged with Corelith.
    const held = new Set(pricing.lines.map((line) => line.vertical));
    const available = VERTICAL_ORDER.filter((vertical) => !held.has(vertical)).map((vertical) => ({
      vertical,
      label: VERTICALS[vertical].label,
    }));

    if (!company) {
      return errorResponse("Workspace not found", 404);
    }

    return successResponse({
      company,
      subscription,
      // What the workspace pays each month: one line per vertical at the rate
      // its member count sets, why that rate, and what one more would come to.
      charges: {
        currency: pricing.currency,
        lines: pricing.lines,
        total: pricing.total,
        each: pricing.each,
        members: pricing.members,
        over: pricing.over,
        why: pricing.why,
        withOneMore: pricing.withOneMore,
      },
      health,
      available,
      vane: { jobsThisMonth: vaneJobs, monthlyAllowance: vaneSettings?.monthlyAllowance ?? 5000 },
      payments: {
        onlinePaymentsSupported: false,
        methods: ["Cash", "Cheque"],
        guidance:
          "Payments are handled offline by cash or cheque. Confirm payment with your Huchu account contact before the renewal date.",
        // False, and the client is meant to read it: there is no invoice
        // document to download, so the Download control on the board's rows has
        // nothing to point at. When an issuer exists this flips and a `documentUrl`
        // joins each row.
        invoiceDocumentsSupported: false,
        // Also false: the payment method is hardcoded offline above and there is
        // no company payment-method record to edit, so the board's Update verb on
        // the Payment row has nothing to open. It stays hidden until a gateway is
        // picked (see the SubscriptionPayment doc-comment).
        methodEditable: false,
        history: paymentHistory.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paidAt: payment.paidAt,
          periodMonths: payment.periodMonths,
          provider: payment.provider,
          reference: payment.providerReference,
        })),
      },
    });
  } catch (error) {
    console.error("[API] GET /api/preferences/billing error:", error);
    return errorResponse("Failed to fetch billing preferences");
  }
}
