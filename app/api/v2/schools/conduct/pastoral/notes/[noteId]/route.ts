import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { openNote } from "@/lib/schools/pastoral";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * `Open` — one note, and the audit row that says it was opened.
 *
 * Two things are deliberate here.
 *
 * **A note this reader may not read answers exactly as a note that does not
 * exist.** Not 403. A 403 that distinguished "not for you" from "no such note"
 * would confirm the existence of a note to somebody who cannot read it, at a
 * URL they can guess — and the list already tells them how many are withheld,
 * which is the controlled way to know.
 *
 * **Opening writes an audit event.** Not drawn on any artboard; required by the
 * subject matter. A row-level access model nobody can audit is a claim rather
 * than a control, and "who read this note about this child, and when" is the
 * first question asked when a pastoral record is disputed.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ noteId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.pastoral", "view");
    if (denied) return errorResponse(denied, 403);

    const { noteId } = await context.params;
    const note = await openNote(
      { companyId: session.user.companyId, userId: session.user.id },
      noteId,
    );
    if (!note) return errorResponse("That note is not one you may read.", 404);
    return successResponse({ note });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/conduct/pastoral/notes/[id] error:", error);
    return errorResponse("Failed to open the note");
  }
}
