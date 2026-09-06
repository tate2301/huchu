import { NextRequest, NextResponse } from "next/server";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { canViewAnyPortalSubject } from "@/lib/schools/portal-identity";
import { revokePortalInvite } from "@/lib/schools/portal-invites";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "invite");
    if (denied) return errorResponse(denied, 403);

    if (!canViewAnyPortalSubject(session.user.role)) {
      return errorResponse("Portal invitations are managed by school staff", 403);
    }

    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid invitation id", 400);

    const revoked = await revokePortalInvite({
      companyId: session.user.companyId,
      inviteId: id,
    });

    // Already claimed or already revoked lands here too. There is nothing to
    // undo in either case, and saying which would confirm the token's state to
    // anyone who guessed the id.
    if (!revoked) {
      return errorResponse("No outstanding invitation to withdraw", 404);
    }

    return successResponse({ id, revoked: true });
  } catch (error) {
    console.error("[API] POST /api/v2/schools/portal-invites/[id]/revoke error:", error);
    return errorResponse("Failed to withdraw the invitation");
  }
}
