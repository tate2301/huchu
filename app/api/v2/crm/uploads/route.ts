import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import type { UploadContext } from "@/lib/uploads/policies";
import { uploadFileToBlob, UploadValidationError } from "@/lib/uploads/upload-file";

export const runtime = "nodejs";

/**
 * The upload contexts a signed-in CRM user may file into. An attachment by
 * default; a receipt when the form says so, so the evidence behind the money
 * lands in a folder of its own. Anything else — a school document, an employee
 * passport — belongs to another module's route and is refused here.
 */
const CRM_UPLOAD_CONTEXTS = ["crm-attachment", "crm-receipt"] as const satisfies readonly UploadContext[];

type CrmUploadContext = (typeof CRM_UPLOAD_CONTEXTS)[number];

function crmUploadContext(value: FormDataEntryValue | null): CrmUploadContext | null {
  if (value === null) return "crm-attachment";
  return CRM_UPLOAD_CONTEXTS.find((context) => context === value) ?? null;
}

/**
 * Authenticated CRM upload: lead and client documents, photos, and receipts.
 * Public intake photo uploads use /api/public/crm/intake/[token]/upload.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return errorResponse("No file provided", 400);
    }
    const context = crmUploadContext(formData.get("context"));
    if (!context) return errorResponse("That is not somewhere a file can go", 400);

    const uploaded = await uploadFileToBlob({
      file,
      context,
      companyId: sessionResult.session.user.companyId,
    });
    return successResponse(uploaded, 201);
  } catch (error) {
    if (error instanceof UploadValidationError) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/crm/uploads error:", error);
    return errorResponse("Failed to upload file");
  }
}
