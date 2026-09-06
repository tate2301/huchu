import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  normalizeOptionalNullableString,
  schoolLeaveRequestTypeSchema,
} from "../../../_helpers";

/**
 * A leave request before it is anybody's decision.
 *
 * Approve, check out and check in each have their own route because each is an
 * event with a person and a time against it. This one is the plain correction:
 * the window a parent gave over the phone was wrong, or the destination changed.
 * It stops once the child is out of the gate — after `CHECKED_OUT` the record is
 * a movement log, and editing history is not a correction.
 */
const updateLeaveRequestSchema = z
  .object({
    requestType: schoolLeaveRequestTypeSchema.optional(),
    startDateTime: z.string().datetime().optional(),
    endDateTime: z.string().datetime().optional(),
    destination: z.string().trim().min(1).max(300).optional(),
    guardianContact: z.string().trim().min(1).max(120).optional(),
    reason: z.string().trim().min(1).max(1200).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const EDITABLE = new Set(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid leave request ID", 400);

    const validated = updateLeaveRequestSchema.parse(await request.json());

    const existing = await prisma.schoolLeaveRequest.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, startDateTime: true, endDateTime: true },
    });
    if (!existing) return errorResponse("Leave request not found", 404);
    if (!EDITABLE.has(existing.status)) {
      return errorResponse(
        "This child is already out. A movement that has happened cannot be edited.",
        409,
      );
    }

    const startDateTime = validated.startDateTime
      ? new Date(validated.startDateTime)
      : existing.startDateTime;
    const endDateTime = validated.endDateTime
      ? new Date(validated.endDateTime)
      : existing.endDateTime;
    if (endDateTime <= startDateTime) {
      return errorResponse("endDateTime must be after startDateTime", 400);
    }

    const updated = await prisma.schoolLeaveRequest.update({
      where: { id: existing.id },
      data: {
        ...(validated.requestType !== undefined
          ? { requestType: validated.requestType }
          : {}),
        ...(validated.startDateTime !== undefined ? { startDateTime } : {}),
        ...(validated.endDateTime !== undefined ? { endDateTime } : {}),
        ...(validated.destination !== undefined
          ? { destination: validated.destination.trim() }
          : {}),
        ...(validated.guardianContact !== undefined
          ? { guardianContact: validated.guardianContact.trim() }
          : {}),
        ...(validated.reason !== undefined
          ? { reason: normalizeOptionalNullableString(validated.reason) }
          : {}),
      },
      include: {
        student: {
          select: { id: true, studentNo: true, firstName: true, lastName: true },
        },
        allocation: {
          select: {
            id: true,
            hostel: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/boarding/leave-requests/[id] error:", error);
    return errorResponse("Failed to update the leave request");
  }
}

/**
 * Calling off a leave request.
 *
 * Cancelling rather than deleting: a parent who withdrew a request the day
 * before is the answer to "why was she not signed out", and a deleted row
 * answers nothing. The one exception is a draft nobody ever submitted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "approve-leave");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid leave request ID", 400);

    const existing = await prisma.schoolLeaveRequest.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) return errorResponse("Leave request not found", 404);

    if (existing.status === "CHECKED_OUT") {
      return errorResponse(
        "This child is signed out. Check them back in rather than cancelling.",
        409,
      );
    }

    if (existing.status === "DRAFT") {
      await prisma.schoolLeaveRequest.delete({ where: { id: existing.id } });
      return successResponse({ id: existing.id, deleted: true });
    }

    const canceled = await prisma.schoolLeaveRequest.update({
      where: { id: existing.id },
      data: { status: "CANCELED" },
      select: { id: true, status: true },
    });
    return successResponse(canceled);
  } catch (error) {
    console.error(
      "[API] DELETE /api/v2/schools/boarding/leave-requests/[id] error:",
      error,
    );
    return errorResponse("Failed to cancel the leave request");
  }
}
