import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { changeZigRate, ZigRateRefused } from "@/lib/retail/payment-settings";
import { RATE_RBZ_DAILY } from "@/lib/retail/payment-words";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import { rbzRateAvailable } from "@/lib/retail/rbz-rate";
import { checkSettingsChanges } from "@/lib/retail/settings-pages";
import { paymentsPage, ZIG_RATE_FIELDS } from "@/lib/retail/settings-pages/payments";
import { readSettings } from "@/lib/retail/settings";
import { requireRetailSession } from "../../_helpers";

/**
 * The ZiG rate (W-05, C-14: a real action keeps its own endpoint). Owners and
 * managers (`retail.zig-rate:update`) set today's rate by hand and choose how
 * it is updated; the Payments page sends `{ changes: { zigRate?, zigSource? } }`
 * here and answers with the page's values, as its settings `PATCH` does.
 */

const bodySchema = z.object({ changes: z.record(z.string(), z.unknown()) });

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.zig-rate", "update");
  if (gate) return gate;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("Send the changed fields as { changes }", 400);

  const other = Object.keys(body.data.changes).filter((field) => !ZIG_RATE_FIELDS.includes(field));
  if (other.length > 0) {
    return fieldErrorResponse(
      "Validation failed",
      Object.fromEntries(other.map((field) => [field, "Only the ZiG rate is changed here."])),
    );
  }
  const checked = checkSettingsChanges(paymentsPage, body.data.changes);
  if (!checked.ok) return fieldErrorResponse("Validation failed", checked.fieldErrors);
  const { zigRate, zigSource } = checked.values as { zigRate?: string; zigSource?: string };
  if (zigSource === RATE_RBZ_DAILY && !rbzRateAvailable()) {
    return fieldErrorResponse("Validation failed", { zigSource: "The RBZ rate is not connected yet." });
  }

  try {
    await changeZigRate(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      {
        rate: zigRate?.trim() || undefined,
        source: zigSource === undefined ? undefined : zigSource === RATE_RBZ_DAILY ? "RBZ_DAILY" : "MANUAL",
      },
    );
    const page = await readSettings(
      session.user.companyId,
      "payments",
      canRetailSessionDo(session, paymentsPage.change[0], paymentsPage.change[1]),
    );
    return successResponse({ values: page!.values, lastChanged: page!.lastChanged });
  } catch (error) {
    if (error instanceof ZigRateRefused) return fieldErrorResponse("Validation failed", { [error.field]: error.message });
    console.error("[API] POST /api/v2/retail/payments/zig-rate error:", error);
    return errorResponse("The rate was not saved. Try again.");
  }
}
