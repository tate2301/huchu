import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { previewAccountingSeedPack, runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { requireOnSharedRoute } from "@/lib/retail/permissions";
import { guardBooks } from "@/lib/books/core";

const schema = z.object({
  mode: z.enum(["DRY_RUN", "APPLY"]).optional(),
  fxRates: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    // The chart, rules and opening balances: the owner or the accountant (books-final §2.2).
    const { refused: notAllowed } = await guardBooks(sessionResult.session, "setup");
    if (notAllowed) return notAllowed;
    const { session } = sessionResult;

    // A shop's Posting to the books row: the owner and the bookkeeper set the
    // accounts up; the manager does not reach the books.
    const refused = requireOnSharedRoute(
      session,
      "retail.posting",
      "update",
      ["SUPERADMIN", "MANAGER"],
      "Insufficient permissions to run accounting foundation pack",
    );
    if (refused) return refused;

    const body = await request.json().catch(() => ({}));
    const validated = schema.parse(body);
    const mode = validated.mode ?? "DRY_RUN";

    const result =
      mode === "APPLY"
        ? await runAccountingSeedPack({
            companyId: session.user.companyId,
            actorId: session.user.id,
            actorEmail: session.user.email,
            mode,
            fxRates: validated.fxRates,
          })
        : await previewAccountingSeedPack({
            companyId: session.user.companyId,
            actorId: session.user.id,
            actorEmail: session.user.email,
            fxRates: validated.fxRates,
          });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/setup/seed-pack error:", error);
    return errorResponse("Failed to run accounting foundation pack");
  }
}
