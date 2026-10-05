import { NextRequest, NextResponse } from "next/server";
import { requirePosDevice } from "@/lib/retail/devices";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import {
  managerOverrideSchema,
  verifyManagerOverride,
  withApprover,
} from "@/lib/retail/manager-override";
import { requireRetailSession } from "../../../../_helpers";
import { voidRetailSaleTransaction } from "../../../../_services";

const voidSchema = z.object({
  shiftId: z.string().uuid(),
  reason: z.string().min(3).max(240),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  /** A manager approving this at the till. See the refund route beside this one. */
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

  const gate = requireRetailPermission(session, "retail.sell", "void");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

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
    const input = voidSchema.parse(body);

    /*
      Voiding without a manager is `retail.sell` `approve`; anyone else brings a
      manager to the counter. See the refund route beside this one.
    */
    let reason = input.reason.trim();
    let approvedBy: { id: string; name: string } | null = null;
    if (!canRetailSessionDo(session, "retail.sell", "approve")) {
      if (!input.managerOverride) {
        return errorResponse("A manager must approve this void", 403);
      }
      const approval = await verifyManagerOverride({
        companyId: session.user.companyId,
        override: input.managerOverride,
        action: "void",
      });
      if (!approval.ok) return errorResponse(approval.error, 403);
      reason = withApprover(reason, approval.approver.name);
      approvedBy = approval.approver;
    }

    const { sale, accounting } = await voidRetailSaleTransaction({
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
      deviceId: device.id,
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
    return errorResponse(error instanceof Error ? error.message : "Failed to void sale", 400);
  }
}
