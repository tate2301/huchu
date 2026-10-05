import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import { markActivityFailed } from "@/lib/activity/context";
import { readSettings, saveSettings, settingsHandler } from "@/lib/retail/settings";
import { SettingsRefused } from "@/lib/retail/settings/types";
import { requireRetailSession } from "../../_helpers";

/**
 * One settings page (00-foundations 4.10, C-14): `GET` reads every value the
 * page shows with whether this caller may change them and who last did;
 * `PATCH { changes }` saves the changed fields in one transaction with one
 * `RETAIL_SETTINGS.CHANGED`. A rule the store checks against the database
 * refuses with 409 `{ error, code }` (prices locked) or a field's 400.
 */

const patchSchema = z.object({ changes: z.record(z.string(), z.unknown()) });

export async function GET(request: NextRequest, { params }: { params: Promise<{ page: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { page: key } = await params;
  const handler = settingsHandler(key);
  if (!handler) return errorResponse("There is no such settings page", 404);

  const gate = requireRetailPermission(session, handler.page.read[0], handler.page.read[1]);
  if (gate) return gate;

  try {
    const canEdit = canRetailSessionDo(session, handler.page.change[0], handler.page.change[1]);
    return successResponse(await readSettings(session.user.companyId, key, canEdit));
  } catch (error) {
    console.error(`[API] GET /api/v2/retail/settings/${key} error:`, error);
    return errorResponse("These settings did not load");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ page: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { page: key } = await params;
  const handler = settingsHandler(key);
  if (!handler) return errorResponse("There is no such settings page", 404);

  const gate = requireRetailPermission(session, handler.page.change[0], handler.page.change[1]);
  if (gate) return gate;

  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("Send the changed fields as { changes }", 400);

  try {
    const saved = await saveSettings(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      key,
      body.data.changes,
    );
    if (!saved) return errorResponse("There is no such settings page", 404);
    if (!saved.ok) return fieldErrorResponse("Validation failed", saved.fieldErrors);
    return successResponse({ values: saved.values, lastChanged: saved.lastChanged });
  } catch (error) {
    if (error instanceof SettingsRefused) {
      if (error.refusal.status === 400) {
        return fieldErrorResponse("Validation failed", { [error.refusal.field]: error.message });
      }
      markActivityFailed();
      return NextResponse.json({ error: error.message, code: error.refusal.code }, { status: 409 });
    }
    console.error(`[API] PATCH /api/v2/retail/settings/${key} error:`, error);
    return errorResponse("Nothing was saved. Try again.");
  }
}
