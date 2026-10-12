import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { successResponse } from "@/lib/api-response";
import { requirePosDevice } from "@/lib/retail/devices";
import { refundInput, refundSale } from "@/lib/retail/floor/refunds";
import { reversalActorOf, reversalResponse } from "@/lib/retail/floor/reversal";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { doneOffline } from "@/lib/retail/till-rules";
import { requireRetailSession } from "../../../../_helpers";

/**
 * A refund at the till's History (FLR-02): the back office's body and
 * service, on a paired till (SET-04), the money out of this till's drawer.
 */
const tillRefundSchema = refundInput.extend({
  periodOverrideReason: z.string().max(500).optional().nullable(),
  /**
   * When the till refunded it, set only by the offline queue. Done offline
   * (more than a minute before it arrives), it is judged leniently: what the
   * rules would refuse now goes in, marked for a manager to look at.
   */
  refundedAt: z.string().datetime().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "refund");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  try {
    const input = tillRefundSchema.parse(await request.json().catch(() => null));
    const refundedAt = input.refundedAt ? new Date(input.refundedAt) : null;
    // The manager's PIN rides in the body (`approver: input.approver`); the service asks the till rules.
    const refund = await refundSale({
      actor: reversalActorOf(session),
      saleId: path.data.id,
      body: input,
      device: { id: device.id, registerId: device.registerId },
      offlineAt: refundedAt && doneOffline(refundedAt, new Date()) ? refundedAt : null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });
    const { sale } = refund;
    return successResponse(
      {
        id: sale.id,
        saleNo: sale.saleNo,
        saleType: sale.saleType,
        status: sale.status,
        shiftId: sale.shiftId,
        siteId: sale.siteId,
        sourceSaleId: sale.sourceSaleId,
        totalAmount: sale.totalAmount,
        depositAmount: sale.depositAmount,
        tenderedAmount: sale.tenderedAmount,
        postedAt: sale.postedAt ?? sale.createdAt,
        lines: sale.lines,
        payments: sale.payments,
        overrideReason: sale.overrideReason,
        // The manager whose PIN let it through, or whose own right did; null when nobody had to.
        approvedByName: sale.approvedByName,
        notes: sale.notes,
        // As the back office's toast reads it (refundDoneSentence): "RFD-0045 done. US$42.00 back on the card."
        value: refund.value,
        currency: refund.currency,
        to: refund.to,
        tender: refund.tender,
        till: refund.till,
        voucherCode: refund.voucherCode,
        accountingStatus: refund.accounting.accountingStatus,
        accountingError: refund.accounting.accountingError,
        fiscal: refund.fiscal,
      },
      201,
    );
  } catch (error) {
    return reversalResponse(error, "POST /api/v2/retail/pos/sales/[id]/refund");
  }
}
