import { NextRequest, NextResponse } from "next/server"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { uploadFileToBlob, UploadValidationError } from "@/lib/uploads/upload-file"

/**
 * The upload half of the profile board's "Change photo".
 *
 * Mechanically this is `app/api/uploads/passport-photo/route.ts` with a
 * different upload context — same multipart field name, same `uploadFileToBlob`,
 * same `{ url }` back — because that is how every file in this repo reaches blob
 * storage and a second mechanism would be a second thing to get wrong. It sits
 * beside the profile rather than under `/api/uploads` because it is scoped to
 * the signed-in user's own record: there is no id in the path and none is
 * accepted, so this endpoint cannot be pointed at anybody else.
 *
 * It does not write `User.image`. The client PATCHes the returned url to
 * `/api/preferences/profile` along with whatever else the form changed, so an
 * abandoned form leaves an orphaned blob and not a changed avatar.
 */
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
      context: "user-avatar",
      companyId: sessionResult.session.user.companyId,
    })

    return successResponse({ url: uploaded.url }, 201)
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return errorResponse(error.message, error.status)
    }

    console.error("[API] POST /api/preferences/profile/photo error:", error)
    return errorResponse("Failed to upload profile photo")
  }
}
