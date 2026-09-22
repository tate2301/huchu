import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getSubscriptionHealth } from "@/lib/platform/subscription";
import { prisma } from "@/lib/prisma";

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

    const [
      company,
      subscription,
      addons,
      activeSites,
      totalSites,
      activeUsers,
      totalUsers,
      health,
      paymentHistory,
    ] = await Promise.all([
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
        include: { plan: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.companySubscriptionAddon.findMany({
        where: { companyId, isEnabled: true },
        include: { bundle: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.site.count({ where: { companyId, isActive: true } }),
      prisma.site.count({ where: { companyId } }),
      prisma.user.count({ where: { companyId, isActive: true } }),
      prisma.user.count({ where: { companyId } }),
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
    ]);

    if (!company) {
      return errorResponse("Workspace not found", 404);
    }

    return successResponse({
      company,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startedAt: subscription.startedAt,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            effectiveMonthlyAmount: subscription.effectiveMonthlyAmount,
            lastPriceComputedAt: subscription.lastPriceComputedAt,
          }
        : null,
      plan: subscription?.plan
        ? {
            id: subscription.plan.id,
            code: subscription.plan.code,
            name: subscription.plan.name,
            description: subscription.plan.description,
            monthlyPrice: subscription.plan.monthlyPrice,
            annualPrice: subscription.plan.annualPrice,
            currency: subscription.plan.currency,
            maxSites: subscription.plan.maxSites,
            maxUsers: subscription.plan.maxUsers,
          }
        : null,
      addons: addons.map((addon) => ({
        id: addon.id,
        isEnabled: addon.isEnabled,
        name: addon.bundle.name,
        code: addon.bundle.code,
        monthlyPrice: addon.bundle.monthlyPrice,
        additionalSiteMonthlyPrice: addon.bundle.additionalSiteMonthlyPrice,
      })),
      usage: {
        activeSites,
        totalSites,
        activeUsers,
        totalUsers,
        maxSites: subscription?.plan.maxSites ?? null,
        maxUsers: subscription?.plan.maxUsers ?? null,
      },
      health,
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
