import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { connectFiscalDevice, FiscalRefused } from "@/lib/retail/fiscal-settings";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import { checkSettingsChanges } from "@/lib/retail/settings-pages";
import { fiscalPage } from "@/lib/retail/settings-pages/fiscal";
import { readSettings } from "@/lib/retail/settings";
import { requireRetailSession } from "../../_helpers";
import { fiscalRefusal } from "../_respond";

/**
 * "Connect" on Setup › Fiscal device (W-06, C-14: a real action keeps its own
 * endpoint). The owner (`retail.fiscal:update`) registers the saved device
 * with ZIMRA with its activation key; the page sends `{ changes: {
 * activationKey } }` once the device's numbers are saved, and gets the page's
 * values back. ZIMRA refusing, or not answering, is a 502 with its words.
 */

const bodySchema = z.object({ changes: z.object({ activationKey: z.unknown() }).strict() });

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.fiscal", "update");
  if (gate) return gate;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("Send the activation key as { changes: { activationKey } }", 400);
  const checked = checkSettingsChanges(fiscalPage, body.data.changes);
  if (!checked.ok) return fieldErrorResponse("Validation failed", checked.fieldErrors);
  const activationKey = String(checked.values.activationKey ?? "");
  if (!activationKey) return fieldErrorResponse("Validation failed", { activationKey: "Type the activation key ZIMRA sent." });

  try {
    await connectFiscalDevice(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      activationKey,
    );
    const page = await readSettings(
      session.user.companyId,
      "fiscal",
      canRetailSessionDo(session, fiscalPage.change[0], fiscalPage.change[1]),
    );
    return successResponse({ values: page!.values, lastChanged: page!.lastChanged });
  } catch (error) {
    if (error instanceof FiscalRefused) return fiscalRefusal(error);
    console.error("[API] POST /api/v2/retail/fiscal/connect error:", error);
    return errorResponse("The device was not connected. Try again.");
  }
}
