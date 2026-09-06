import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { hasFeature } from "@corelithzw/platform/features";
import {
  inspectSchoolFeeReceiptFiscalisation,
  issueSchoolFeeReceiptFiscalisation,
  SCHOOL_FISCALISATION_FEATURE,
} from "@/lib/schools/fiscalisation";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * S-2.7 — re-send a receipt to ZIMRA, and see why one has not landed.
 *
 * Fiscalisation runs by itself when the receipt is taken. This exists for the
 * afternoon the FDMS endpoint is down: without it a bursar's only recourse is
 * `/api/accounting/fiscalisation/replay`, which is SUPERADMIN and MANAGER only
 * and is not a screen anybody at a school would think to look for.
 *
 * `GET` answers "what is stopping this" without sending anything — the ordinary
 * answer for a newly provisioned school is the four ZIMRA identity fields on
 * `AccountingSettings`, which `provisionSchool` creates empty. `POST` sends.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const [enabled, receipt] = await Promise.all([
      hasFeature(companyId, SCHOOL_FISCALISATION_FEATURE),
      prisma.schoolFeeReceipt.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          receiptNo: true,
          status: true,
          fiscalReceipt: {
            select: {
              id: true,
              status: true,
              fiscalNumber: true,
              providerReference: true,
              qrCodeData: true,
              attemptCount: true,
              nextRetryAt: true,
              lastSyncedAt: true,
              lastError: true,
            },
          },
        },
      }),
    ]);
    if (!receipt) return errorResponse("Fee receipt not found", 404);

    const inspection = enabled
      ? await inspectSchoolFeeReceiptFiscalisation({ companyId, receiptId: id })
      : null;

    return successResponse({
      receiptId: receipt.id,
      receiptNo: receipt.receiptNo,
      receiptStatus: receipt.status,
      enabled,
      ready: inspection?.ok ?? false,
      blockedBy: inspection && !inspection.ok ? inspection.reason : null,
      missing: inspection && !inspection.ok ? (inspection.missing ?? []) : [],
      fiscalReceipt: receipt.fiscalReceipt,
    });
  } catch (error) {
    console.error(
      "[API] GET /api/v2/schools/fees/receipts/[id]/fiscalise error:",
      error,
    );
    return errorResponse("Failed to read fiscalisation status");
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Issuing a tax document, not taking a payment — the bursar's `issue`
    // action, the same one that puts an invoice in front of a family.
    const denied = schoolPermissionDenial(session, "schools.fees", "issue");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const receipt = await prisma.schoolFeeReceipt.findFirst({
      where: { id, companyId },
      select: { id: true, receiptNo: true },
    });
    if (!receipt) return errorResponse("Fee receipt not found", 404);

    if (!(await hasFeature(companyId, SCHOOL_FISCALISATION_FEATURE))) {
      return errorResponse(
        "Fiscalisation is not enabled for this school",
        403,
      );
    }

    // Unlike the automatic path this one is asked for, so a failure is an
    // answer rather than a footnote: the bursar pressed a button and is owed a
    // sentence about why nothing was sent.
    const result = await issueSchoolFeeReceiptFiscalisation({
      companyId,
      receiptId: id,
    });

    // Sending a tax document to the revenue authority is a privileged act and
    // is recorded whichever way it went — a failed submission is exactly the
    // thing somebody later needs to prove was attempted.
    await writeSchoolAuditEvent(prisma, {
      companyId,
      actorId: session.user.id,
      eventType: "schools.fee.receipt.fiscalised",
      entityType: "SchoolFeeReceipt",
      entityId: receipt.id,
      payload: {
        receiptNo: receipt.receiptNo,
        fiscalStatus: result.fiscalStatus,
        fiscalNumber: result.fiscalNumber,
        providerReference: result.providerReference,
        fiscalError: result.fiscalError,
      },
    });

    if (result.fiscalStatus === "FAILED") {
      return errorResponse(
        result.fiscalError ?? "Failed to fiscalise fee receipt",
        400,
        result.missing,
      );
    }

    return successResponse(result);
  } catch (error) {
    console.error(
      "[API] POST /api/v2/schools/fees/receipts/[id]/fiscalise error:",
      error,
    );
    return errorResponse("Failed to fiscalise fee receipt");
  }
}
