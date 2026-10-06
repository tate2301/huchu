import { NextRequest, NextResponse } from "next/server";
import { requirePosDevice } from "@/lib/retail/devices";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { approverSchema, tillRuleResponse } from "@/lib/retail/manager-pin";
import { doneOffline } from "@/lib/retail/till-rules";
import { requireRetailSession } from "../../../../_helpers";
import { voidRetailSaleTransaction } from "../../../../_services";
import { fiscaliseAfterPosting } from "@/lib/retail/fiscalisation";

const voidSchema = z.object({
  shiftId: z.string().uuid(),
  /** One of the till rules' void reasons (SET-06). */
  reason: z.string().min(1).max(240),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  /** A manager's till PIN, when "Voids need a manager PIN" asks for one. See the refund route beside this one. */
  approver: approverSchema.optional().nullable(),
  /**
   * When the till voided it, set only by the offline queue. Done offline
   * (more than a minute before it arrives), it is judged leniently: what the
   * rules would refuse now goes in, marked for a manager to look at.
   */
  voidedAt: z.string().datetime().optional(),
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

    const { sale, accounting, fiscal: assigned } = await voidRetailSaleTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      saleId: id,
      shiftId: input.shiftId,
      reason: input.reason,
      approver: input.approver ?? null,
      offlineAt: input.voidedAt && doneOffline(new Date(input.voidedAt), new Date()) ? new Date(input.voidedAt) : null,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
      deviceId: device.id,
    });

    // Its credit note, signed in its commit (SET-08), goes to ZIMRA now.
    const fiscal = await fiscaliseAfterPosting({ companyId: session.user.companyId, saleId: sale.id, assigned });

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
      fiscal,
    }, 201);
  } catch (error) {
    const refused = tillRuleResponse(error);
    if (refused) return refused;
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to void sale", 400);
  }
}
