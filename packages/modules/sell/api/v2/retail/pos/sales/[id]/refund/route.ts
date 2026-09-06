import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { parseRetailParams, retailIdParams } from "../../../../../../../request";
import { canRetailRoleDo } from "../../../../../../../permissions";
import {
  managerOverrideSchema,
  verifyManagerOverride,
  withApprover,
} from "../../../../../../../manager-override";
import { requireRetailSession } from "../../../../_helpers";
import { refundRetailSaleTransaction } from "../../../../../../../transactions";

const refundLineSchema = z.object({
  saleLineId: z.string().uuid(),
  quantity: z.number().positive(),
});

const refundPaymentSchema = z.object({
  tenderType: z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"]),
  amount: z.number().positive(),
  reference: z.string().max(120).optional().nullable(),
});

const refundSchema = z.object({
  shiftId: z.string().uuid(),
  reason: z.string().min(3).max(240),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(refundLineSchema).min(1),
  payments: z.array(refundPaymentSchema).min(1),
  /**
   * A manager approving this at the till, when the cashier may not.
   *
   * The refund has to be rung at a till because the cash comes out of a real
   * drawer and lands against `shiftId` at cash-up — a manager in the back
   * office has no drawer to take it from. So the manager comes to the counter
   * and approves the one act. See `lib/retail/manager-override.ts`.
   */
  managerOverride: managerOverrideSchema.optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    /*
    R-3.1. The segment, through a schema.

    Prisma is not injectable, so this is not a security fix. It is the
    difference between a 400 naming the parameter and a 404 that reads, to a
    shopkeeper, as "the receipt you are holding is not in the system".
  */
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
    const body = await request.json();
    const input = refundSchema.parse(body);

    /**
     * S-7.7 — the matrix, or a manager standing here.
     *
     * This used to be `requireRetailPos`, which admits `RETAIL_MANAGER_ROLES`
     * **plus `CASHIER`** — so a cashier could POST a refund straight at this
     * endpoint and reverse a posted sale that the till's own history screen
     * would never have offered them a button for. `RUN_A_TILL` in
     * `lib/retail/permissions.ts` withholds `refund` deliberately. The endpoint
     * being the only thing that disagreed is what made it a hole rather than a
     * difference of opinion, and `route-guard-coverage.test.ts` could not see
     * it because there *was* a gate here — just the wrong one.
     *
     * The override is the other half. Withholding `refund` from a cashier left
     * reversals unreachable from the shop floor entirely, because the portal
     * admits nobody else. A manager approves the one act at the counter, and
     * their name goes onto the reversal.
     */
    let reason = input.reason.trim();
    let approvedBy: { id: string; name: string } | null = null;
    if (!canRetailRoleDo(session.user.role, "retail.sell", "refund")) {
      if (!input.managerOverride) {
        return errorResponse("A manager must approve this refund", 403);
      }
      const approval = await verifyManagerOverride({
        companyId: session.user.companyId,
        override: input.managerOverride,
        action: "refund",
      });
      if (!approval.ok) return errorResponse(approval.error, 403);
      reason = withApprover(reason, approval.approver.name);
      approvedBy = approval.approver;
    }

    const { sale, accounting } = await refundRetailSaleTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      saleId: id,
      shiftId: input.shiftId,
      // Carries the approver's name when a manager signed this off at the counter.
      reason,
      // And the approval itself, so the service's own role guard knows about it.
      approvedBy,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
      lines: input.lines,
      payments: input.payments,
    });

    return successResponse({
      id: sale.id,
      saleNo: sale.saleNo,
      saleType: sale.saleType,
      status: sale.status,
      shiftId: sale.shiftId,
      siteId: sale.siteId,
      sourceSaleId: sale.sourceSaleId,
      totalAmount: sale.totalAmount,
      tenderedAmount: sale.tenderedAmount,
      postedAt: sale.postedAt ?? sale.createdAt,
      lines: sale.lines,
      payments: sale.payments,
      overrideReason: sale.overrideReason,
      notes: sale.notes,
      accountingStatus: accounting.accountingStatus,
      accountingError: accounting.accountingError,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to post refund", 400);
  }
}
