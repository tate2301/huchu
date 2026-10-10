import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { receiveInput, receiveTransfer } from "@/lib/retail/stock/transfer-changes";

import { requireRetailSession } from "../../../../_helpers";
import { isId, NOT_FOUND, refusalResponse, transferActor } from "../respond";

/**
 * Receive a transfer (30-stock 5.15, W-24 step 3). `retail.transfers:update`.
 * `{ lines: [{ id, received }], short: "STILL_COMING" | "LOST" }` →
 * `{ data, message }`: "TRF-0008 received at Borrowdale. 2 × Ice 2kg bag
 * written off.". 409 "TRF-0008 has already been received."; a figure beyond
 * what is on the way "Only 10 were sent." under `lines.<i>`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.transfers", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);
  const parsed = receiveInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [head, index] = issue.path;
      const key = head === "lines" && typeof index === "number" ? `lines.${index}` : String(head ?? "lines");
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check what came.", fieldErrors);
  }

  try {
    const data = await receiveTransfer(transferActor(session), id, parsed.data);
    return successResponse({ data, message: data.message });
  } catch (error) {
    return refusalResponse(error, "POST /api/v2/retail/stock/transfers/[id]/receive", "That was not received. Nothing moved; try again.");
  }
}
