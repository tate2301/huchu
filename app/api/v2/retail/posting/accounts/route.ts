import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { AccountAddRefused, addPostingAccount } from "@/lib/retail/posting-settings";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * "New account" on Posting to the books (W-65): `{ codeAndName: "1012 Cash
 * on hand, rand", type: "ASSET" }` adds a ledger account to the chart and
 * answers it as every account field lists it. The page's account fields add
 * through their lookup (`/lookup/account`), which calls the same service.
 * 400 for a field that does not read, 409 when the code is taken.
 */

const bodySchema = z.object({
  codeAndName: z.string(),
  type: z.string(),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.posting", "update");
  if (gate) return gate;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("Send { codeAndName, type }", 400);

  try {
    const account = await addPostingAccount(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      body.data,
    );
    return successResponse({ data: account }, 201);
  } catch (error) {
    if (error instanceof AccountAddRefused) {
      if (error.status === 409) return NextResponse.json({ error: error.message, code: "ACCOUNT_CODE_TAKEN" }, { status: 409 });
      return fieldErrorResponse("Validation failed", error.fieldErrors);
    }
    console.error("[API] POST /api/v2/retail/posting/accounts error:", error);
    return errorResponse("The account was not added. Try again.");
  }
}
