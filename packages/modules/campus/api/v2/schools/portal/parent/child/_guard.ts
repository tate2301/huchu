import { errorResponse } from "@corelithzw/platform/api-response";
import {
  consentDeniedMessage,
  getGuardianChildLink,
  guardianMaySee,
  resolvePortalGuardian,
  type GuardianConsentKind,
} from "../../../../../../portal-identity";

/**
 * The three questions every one of a parent's child screens has to answer before
 * it returns anything: who is asking, is this their child, and may they be told
 * this about them.
 *
 * Written once because the answer must not vary. Three inline copies is how the
 * fees route ends up honouring `canReceiveFinancials` and the attendance route
 * forgets — and the flag exists precisely because a school has told one parent
 * they may not see the money.
 */
export type ChildScope =
  | { ok: true; guardianId: string; studentId: string }
  | { ok: false; response: ReturnType<typeof errorResponse> };

export async function scopeToChild(input: {
  companyId: string;
  userId: string;
  role?: string | null;
  studentId: string | null;
  needs: GuardianConsentKind | null;
}): Promise<ChildScope> {
  if (!input.studentId) {
    return { ok: false, response: errorResponse("childId is required", 400) };
  }

  const resolution = await resolvePortalGuardian(
    { companyId: input.companyId, userId: input.userId, role: input.role, requestedId: null },
    { select: { id: true } },
  );
  const guardian = resolution.subject;
  if (!guardian) {
    return {
      ok: false,
      response: errorResponse("This account is not linked to a family", 403),
    };
  }

  const link = await getGuardianChildLink({
    companyId: input.companyId,
    guardianId: guardian.id,
    studentId: input.studentId,
  });
  // Not-linked and not-found are the same answer on purpose: a parent probing ids
  // learns nothing about which children exist.
  if (!link) {
    return { ok: false, response: errorResponse("Not your child", 403) };
  }

  if (input.needs && !guardianMaySee(link, input.needs)) {
    return { ok: false, response: errorResponse(consentDeniedMessage(input.needs), 403) };
  }

  return { ok: true, guardianId: guardian.id, studentId: input.studentId };
}
