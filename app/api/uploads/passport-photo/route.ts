import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { promises as fs } from "fs"
import path from "path"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"

export const runtime = "nodejs"

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return errorResponse("No file provided", 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse("File exceeds 5MB limit", 400)
    }

    const extension = ALLOWED_TYPES[file.type]
    if (!extension) {
      return errorResponse("Unsupported file type. Use JPG, PNG, or WebP.", 400)
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "passport-photos")
    await fs.mkdir(uploadDir, { recursive: true })

    const filename = `${randomUUID()}.${extension}`
    const filePath = path.join(uploadDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    return successResponse({ url: `/uploads/passport-photos/${filename}` }, 201)
  } catch (error) {
    console.error("[API] POST /api/uploads/passport-photo error:", error)
    return errorResponse("Failed to upload passport photo")
  }
}
