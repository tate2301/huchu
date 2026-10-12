import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { MessageRefusal, previewMessage, reminderSourceFor } from "@/lib/retail/messages/preview";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

/**
 * What the Message customers sheet shows (CUS-06):
 * `?purpose=offer|reminder&audience=&ids=a,b&about=layby:<ids>&picked=1` →
 * `{ data: { total, reach, sub, note, primary, options, body, hint, later } }`.
 * 400 for an audience that is not one of the choices.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const params = request.nextUrl.searchParams;
  const purpose = params.get("purpose") === "reminder" ? "reminder" : "offer";
  const about = params.get("about");
  try {
    const grant = purpose === "offer" ? (["retail.customers", "update"] as const) : reminderSourceFor(about).source.requires;
    const gate = requireRetailPermission(session, grant[0], grant[1]);
    if (gate) return gate;

    const ids = (params.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 500);
    const data = await previewMessage(session.user.companyId, {
      purpose,
      audience: params.get("audience") || null,
      ids,
      about,
      picked: params.get("picked") === "1",
    });
    return successResponse({ data });
  } catch (error) {
    if (error instanceof MessageRefusal) return errorResponse(error.message, error.status);
    throw error;
  }
}
