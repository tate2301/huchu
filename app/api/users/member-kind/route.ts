import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { appendUserManagementEvent } from "@/lib/platform/user-management-events";

import { canMutateUserManagement } from "../_helpers";

/**
 * Staff or outside accountant (Books, design/books/spec/books.md Roles): the
 * owner marks a finance officer as an accountant from outside the business,
 * with their firm and the last day of their access. Only a finance officer
 * can be one; changing their role back to anything else makes them staff.
 */
const schema = z.discriminatedUnion("memberKind", [
  z.object({ userId: z.string().uuid(), memberKind: z.literal("STAFF") }),
  z.object({
    userId: z.string().uuid(),
    memberKind: z.literal("OUTSIDE_ACCOUNTANT"),
    firmName: z.string().trim().min(1, "Name their firm.").max(120),
    accessEndsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the last day of their access."),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!canMutateUserManagement(session)) return errorResponse("Only the owner can make someone an outside accountant.", 403);

    const body = schema.parse(await request.json());
    const existing = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, companyId: true, role: true, email: true, memberKind: true } });
    if (!existing || existing.companyId !== session.user.companyId) return errorResponse("User not found for this organization.", 404);
    if (body.memberKind === "OUTSIDE_ACCOUNTANT" && existing.role !== "FINANCE_OFFICER") {
      return errorResponse("Only the accountant (a finance officer) can be an outside accountant.", 409);
    }

    const data =
      body.memberKind === "STAFF"
        ? { memberKind: "STAFF" as const, firmName: null, accessEndsOn: null }
        : { memberKind: "OUTSIDE_ACCOUNTANT" as const, firmName: body.firmName, accessEndsOn: new Date(`${body.accessEndsOn}T00:00:00.000Z`) };
    const updated = await prisma.user.update({ where: { id: existing.id }, data, select: { id: true, memberKind: true, firmName: true, accessEndsOn: true } });

    await appendUserManagementEvent({
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      eventType: "USER_CHANGE_MEMBER_KIND",
      message:
        body.memberKind === "STAFF"
          ? `${existing.email} is staff again`
          : `${existing.email} is an outside accountant from ${body.firmName} until ${body.accessEndsOn}`,
      payload: { userId: existing.id, before: existing.memberKind, after: body.memberKind },
    });

    return successResponse({ ...updated, accessEndsOn: updated.accessEndsOn ? updated.accessEndsOn.toISOString().slice(0, 10) : null });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Validation failed", 400, error.issues);
    console.error("[API] POST /api/users/member-kind error:", error);
    return errorResponse("Nothing was changed");
  }
}
