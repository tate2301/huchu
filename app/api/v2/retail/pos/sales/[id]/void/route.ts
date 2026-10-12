import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { successResponse } from "@/lib/api-response";
import { requirePosDevice } from "@/lib/retail/devices";
import { reversalActorOf, reversalResponse } from "@/lib/retail/floor/reversal";
import { voidInput, voidSale } from "@/lib/retail/floor/voids";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { doneOffline } from "@/lib/retail/till-rules";
import { requireRetailSession } from "../../../../_helpers";

/**
 * A void at the till's History (FLR-02): the back office's body and service,
 * on a paired till (SET-04), the cash back out of this till's drawer.
 */
const tillVoidSchema = voidInput.extend({
  periodOverrideReason: z.string().max(500).optional().nullable(),
  /** When the till voided it, set only by the offline queue. See the refund route beside this one. */
  voidedAt: z.string().datetime().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "void");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  try {
    const input = tillVoidSchema.parse(await request.json().catch(() => null));
    const voidedAt = input.voidedAt ? new Date(input.voidedAt) : null;
    // The manager's PIN rides in the body (`approver: input.approver`); the service asks the till rules.
    const voided = await voidSale({
      actor: reversalActorOf(session),
      saleId: path.data.id,
      body: input,
      device: { id: device.id, registerId: device.registerId },
      offlineAt: voidedAt && doneOffline(voidedAt, new Date()) ? voidedAt : null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });
    const { sale } = voided;
    return successResponse(
      {
        id: sale.id,
        saleNo: sale.saleNo,
        voidNo: voided.voidNo,
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
        approvedByName: sale.approvedByName,
        notes: sale.notes,
        accountingStatus: voided.accounting.accountingStatus,
        accountingError: voided.accounting.accountingError,
        fiscal: voided.fiscal,
      },
      201,
    );
  } catch (error) {
    return reversalResponse(error, "POST /api/v2/retail/pos/sales/[id]/void");
  }
}
