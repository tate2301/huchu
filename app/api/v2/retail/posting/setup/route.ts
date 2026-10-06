import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { setupPreview } from "@/lib/retail/posting-settings";
import { requireRetailSession } from "../../_helpers";

/**
 * "Set up the accounts" on Posting to the books (W-65): `DRY_RUN` lists what
 * the Zimbabwe retail pack would add — accounts, VAT codes, tender and role
 * accounts, the ZiG and rand rates — and `APPLY` adds them. Owners and the
 * bookkeeper.
 */

/** A rate field, optional: blank adds no rate. Its error names its own money. */
const rate = (money: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) > 0),
      `Type how many ${money} make US$1, as a number.`,
    )
    .optional();

const bodySchema = z.object(
  {
    mode: z.enum(["DRY_RUN", "APPLY"], { error: "Say whether to list what it would add or to add it." }),
    fxRates: z.object({ ZWG: rate("ZiG"), ZAR: rate("rand") }).optional(),
  },
  { error: "Say whether to list what it would add or to add it." },
);

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.posting", "update");
  if (gate) return gate;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    const fieldErrors = Object.fromEntries(
      body.error.issues.map((issue) => [String(issue.path.at(-1) ?? "mode"), issue.message]),
    );
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the rates.", fieldErrors);
  }

  const fxRates = Object.fromEntries(
    Object.entries(body.data.fxRates ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  try {
    const result = await runAccountingSeedPack({
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorEmail: session.user.email,
      mode: body.data.mode,
      fxRates,
    });
    return successResponse({ ...result, groups: setupPreview(result) });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/posting/setup error:", error);
    return errorResponse("The accounts were not set up. Try again.");
  }
}
