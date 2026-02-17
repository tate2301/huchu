import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { uploadFileToBlob, UploadValidationError } from "@/lib/uploads/upload-file"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return errorResponse("No file provided", 400)
    }

    const uploaded = await uploadFileToBlob({
      file,
      context: "employee-passport",
      companyId: sessionResult.session.user.companyId,
    })

    return successResponse({ url: uploaded.url }, 201)
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return errorResponse(error.message, error.status)
    }

    console.error("[API] POST /api/uploads/passport-photo error:", error)
    return errorResponse("Failed to upload passport photo")
  }
}
