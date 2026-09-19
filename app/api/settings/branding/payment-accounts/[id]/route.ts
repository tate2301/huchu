import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getBrandingFeatureKeys } from "@/lib/platform/branding";
import { hasFeature } from "@/lib/platform/features";

/**
 * Change what one account says on the paper. See the collection route for why
 * this lives under branding and why it deliberately cannot delete.
 *
 * `currency` is set when the account is created and not editable here: an
 * account with transactions behind it has a currency the ledger depends on,
 * and branding is not the place to redenominate it.
 */
const updateSchema = z.object({
  accountName: z.string().trim().max(200).nullable().optional(),
  accountNumber: z.string().trim().max(100).nullable().optional(),
  bankName: z.string().trim().max(200).nullable().optional(),
  showOnDocuments: z.boolean().optional(),
  documentPosition: z.number().int().min(0).max(99).optional(),
});

function ensureBrandingManager(sessionRole: string) {
  return sessionRole === "SUPERADMIN" || sessionRole === "MANAGER";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!ensureBrandingManager(session.user.role)) {
      return errorResponse("Only SUPERADMIN and MANAGER can manage payment accounts", 403);
    }
    const manageEnabled = await hasFeature(
      session.user.companyId,
      getBrandingFeatureKeys().manage,
    );
    if (!manageEnabled) {
      return errorResponse("Branding add-on is not enabled for this company", 403);
    }

    const { id } = await params;
    const data = updateSchema.parse(await request.json());

    // Scoped by company in the same statement that writes, so another
    // tenant's account id cannot be steered into this update.
    const updated = await prisma.bankAccount.updateMany({
      where: { id, companyId: session.user.companyId },
      data: {
        ...(data.accountName !== undefined ? { accountName: data.accountName || null } : {}),
        ...(data.accountNumber !== undefined ? { accountNumber: data.accountNumber || null } : {}),
        ...(data.bankName !== undefined ? { bankName: data.bankName || null } : {}),
        ...(data.showOnDocuments !== undefined ? { showOnDocuments: data.showOnDocuments } : {}),
        ...(data.documentPosition !== undefined ? { documentPosition: data.documentPosition } : {}),
      },
    });
    if (updated.count === 0) return errorResponse("Payment account not found", 404);

    const account = await prisma.bankAccount.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        name: true,
        currency: true,
        accountName: true,
        accountNumber: true,
        bankName: true,
        showOnDocuments: true,
        documentPosition: true,
      },
    });

    return successResponse({ account });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/settings/branding/payment-accounts/[id] error:", error);
    return errorResponse("Failed to update the payment account");
  }
}
