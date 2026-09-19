import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getBrandingFeatureKeys } from "@/lib/platform/branding";
import { hasFeature } from "@/lib/platform/features";

/**
 * The accounts a customer is asked to pay into.
 *
 * These are `BankAccount` rows — the same records accounting reconciles, so
 * there is one account list and not two — but reached from branding rather
 * than from accounting, because deciding what is printed on a quotation is a
 * branding decision and the accounting surface is gated on
 * `accounting.banking`. A CRM-only tenant has no such feature, so every route
 * under `/api/accounting/banking` refuses them: before this existed, a tenant
 * selling on quotations alone could fill in their bank details and never get
 * them onto a single document, with nothing on screen explaining why.
 *
 * This is deliberately a narrow window onto the record. It exposes the fields
 * that decide what the paper says and the identifiers a payer needs; it does
 * not expose balances, reconciliation state, or `isActive`, and it cannot
 * delete an account — an account with transactions behind it is not branding's
 * to remove. Taking one off the paper is `showOnDocuments: false`.
 */

const createSchema = z.object({
  /** The ledger's own label for the account, e.g. "USD Current". */
  name: z.string().trim().min(1).max(200),
  currency: z.string().trim().min(1).max(10),
  /** The name the account is held in, which a payer's bank matches against. */
  accountName: z.string().trim().max(200).optional(),
  accountNumber: z.string().trim().max(100).optional(),
  bankName: z.string().trim().max(200).optional(),
  showOnDocuments: z.boolean().optional(),
  documentPosition: z.number().int().min(0).max(99).optional(),
});

function ensureBrandingManager(sessionRole: string) {
  return sessionRole === "SUPERADMIN" || sessionRole === "MANAGER";
}

async function authorise(request: NextRequest) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) return { response: sessionResult };
  const { session } = sessionResult;

  if (!ensureBrandingManager(session.user.role)) {
    return {
      response: errorResponse("Only SUPERADMIN and MANAGER can manage payment accounts", 403),
    };
  }

  const manageEnabled = await hasFeature(session.user.companyId, getBrandingFeatureKeys().manage);
  if (!manageEnabled) {
    return { response: errorResponse("Branding add-on is not enabled for this company", 403) };
  }

  return { companyId: session.user.companyId };
}

const SELECT = {
  id: true,
  name: true,
  currency: true,
  accountName: true,
  accountNumber: true,
  bankName: true,
  showOnDocuments: true,
  documentPosition: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await authorise(request);
    if (auth.response) return auth.response;

    // Every account, not only the ones already shown: the point of the screen
    // is to turn the others on.
    const accounts = await prisma.bankAccount.findMany({
      where: { companyId: auth.companyId },
      orderBy: [{ showOnDocuments: "desc" }, { documentPosition: "asc" }, { currency: "asc" }],
      select: SELECT,
    });

    return successResponse({ accounts });
  } catch (error) {
    console.error("[API] GET /api/settings/branding/payment-accounts error:", error);
    return errorResponse("Failed to load payment accounts");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorise(request);
    if (auth.response) return auth.response;

    const data = createSchema.parse(await request.json());

    const account = await prisma.bankAccount.create({
      data: {
        companyId: auth.companyId,
        name: data.name,
        currency: data.currency.toUpperCase(),
        accountName: data.accountName || null,
        accountNumber: data.accountNumber || null,
        bankName: data.bankName || null,
        // An account added from this screen was added in order to be printed,
        // so it starts on. The ledger's own default stays off.
        showOnDocuments: data.showOnDocuments ?? true,
        documentPosition: data.documentPosition ?? 0,
      },
      select: SELECT,
    });

    return successResponse({ account }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/settings/branding/payment-accounts error:", error);
    return errorResponse("Failed to add the payment account");
  }
}
