import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { retailPermissionDenial } from "@/lib/retail/permission-matrix";
import { UploadValidationError, uploadFileToBlob } from "@/lib/uploads/upload-file";
import { requireRetailSession } from "../../_helpers";

const NOT_A_SLIP = "That file is not a photo or a PDF.";

/**
 * The deposit slip's photo (FLR-07): a jpg, png or PDF up to 8 MB, kept with
 * the day once it closes. Answers `{ url }`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const denied = retailPermissionDenial(session, "retail.end-of-day", "create");
  if (denied) return errorResponse(denied, 403);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errorResponse(NOT_A_SLIP, 400);
  try {
    const uploaded = await uploadFileToBlob({ file, context: "retail-deposit-slip", companyId: session.user.companyId });
    return successResponse({ url: uploaded.url });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return errorResponse(/limit/.test(error.message) ? "The slip is over 8 MB. Take a smaller photo." : NOT_A_SLIP, 400);
    }
    console.error("[API] POST /api/v2/retail/end-of-day/slip error:", error);
    return errorResponse("The slip did not upload. Try again.");
  }
}
