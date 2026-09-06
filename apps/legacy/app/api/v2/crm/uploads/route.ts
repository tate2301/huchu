import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { uploadFileToBlob, UploadValidationError } from "@/lib/uploads/upload-file";

export const runtime = "nodejs";

/**
 * Authenticated CRM attachment upload (lead/client documents and photos).
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

    const uploaded = await uploadFileToBlob({
      file,
      context: "crm-attachment",
      companyId: sessionResult.session.user.companyId,
    });
    return successResponse(uploaded, 201);
  } catch (error) {
    if (error instanceof UploadValidationError) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/crm/uploads error:", error);
    return errorResponse("Failed to upload file");
  }
}
