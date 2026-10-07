import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { retailPermissionDenial } from "@/lib/retail/permission-matrix";
import { UploadStorageMissing, UploadValidationError, uploadFileToBlob } from "@/lib/uploads/upload-file";
import { requireRetailSession } from "../../_helpers";

const NOT_A_SLIP = "That file is not a photo or a PDF.";
const NO_STORAGE = "Photos cannot be kept on this server yet. Close the day without the slip.";

/**
 * The deposit slip's photo (FLR-07): a jpg, png or PDF up to 8 MB, kept with
 * the day once it closes. Answers `{ url }`; 503 when the server has no file
 * storage set up.
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
    // A server with no file storage says so, rather than asking for a retry that cannot work.
    if (error instanceof UploadStorageMissing) return errorResponse(NO_STORAGE, 503);
    console.error("[API] POST /api/v2/retail/end-of-day/slip error:", error);
    return errorResponse("The slip did not upload. Try again.");
  }
}
