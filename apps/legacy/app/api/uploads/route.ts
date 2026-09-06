import { NextRequest, NextResponse } from "next/server"
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import {
  isUploadContext,
  uploadContextValues,
} from "@/lib/uploads/policies"
import {
  uploadFileToBlob,
  UploadValidationError,
} from "@/lib/uploads/upload-file"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult

    const formData = await request.formData()
    const context = formData.get("context")
    if (typeof context !== "string" || context.length === 0) {
      return errorResponse("Upload context is required", 400, {
        supportedContexts: uploadContextValues,
      })
    }

    if (!isUploadContext(context)) {
      return errorResponse("Unsupported upload context", 400, {
        supportedContexts: uploadContextValues,
      })
    }

    const file = formData.get("file")
    if (!file || typeof file === "string") {
      return errorResponse("No file provided", 400)
    }

    const uploaded = await uploadFileToBlob({
      file,
      context,
      companyId: sessionResult.session.user.companyId,
    })

    return successResponse(uploaded, 201)
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return errorResponse(error.message, error.status)
    }

    console.error("[API] POST /api/uploads error:", error)
    return errorResponse("Failed to upload file")
  }
}
