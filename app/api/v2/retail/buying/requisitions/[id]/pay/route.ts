import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { paySchema, requisitionIssues } from "@/lib/retail/buying/requisition-input";
import { loadRequisitionView } from "@/lib/retail/buying/requisition-view";
import { CANNOT_CHANGE, payOut } from "@/lib/retail/buying/requisitions";
import { listMoneyAccounts } from "@/lib/retail/buying/money-accounts";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** What Pay out reads live: each money account's kind and balance, for the From hint and How's default. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "update")) return errorResponse(CANNOT_CHANGE, 403);
  const accounts = await listMoneyAccounts(session.user.companyId);
  return successResponse({
    data: { accounts: accounts.map((account) => ({ id: account.id, name: account.name, kind: account.kind, currency: account.currency, balance: Number(account.balance.toString()) })) },
  });
}

/** Pay an approved requisition out of a money account (W-31, W-32 "Paid out"). Never a till drawer (C-33). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "update")) return errorResponse(CANNOT_CHANGE, 403);
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = paySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", requisitionIssues(parsed.error));

  const actor = buyingActor(session);
  try {
    const done = await payOut(actor, path.data.id, parsed.data, { requestUrl: request.url });
    const data = await loadRequisitionView(actor, path.data.id);
    return successResponse({ data, accountingStatus: done.accountingStatus, message: done.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/requisitions/[id]/pay");
  }
}
