import { randomUUID } from "crypto"
import { put } from "@vercel/blob"
import { getUploadPolicy, type UploadContext } from "@/lib/uploads/policies"

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

const maxBytesToLabel = (maxBytes: number) => `${Math.floor(maxBytes / (1024 * 1024))}MB`

const sanitizePathSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

export class UploadValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "UploadValidationError"
    this.status = status
  }
}

export type UploadResult = {
  url: string
  pathname: string
  contentType: string
  size: number
  context: UploadContext
}

type UploadInput = {
  file: File
  context: UploadContext
  companyId: string
}

export async function uploadFileToBlob(input: UploadInput): Promise<UploadResult> {
  const policy = getUploadPolicy(input.context)
  const { file } = input

  if (file.size > policy.maxBytes) {
    throw new UploadValidationError(`File exceeds ${maxBytesToLabel(policy.maxBytes)} limit`)
  }

  if (!policy.allowedTypes.some((allowedType) => allowedType === file.type)) {
    throw new UploadValidationError("Unsupported file type")
  }

  const extension = extensionByMimeType[file.type]
  if (!extension) {
    throw new UploadValidationError("Unsupported file type")
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured")
  }

  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  const safeCompanyId = sanitizePathSegment(input.companyId) || "unknown-company"
  const pathname = `companies/${safeCompanyId}/${policy.folder}/${year}/${month}/${randomUUID()}.${extension}`

  const uploaded = await put(pathname, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  })

  return {
    url: uploaded.url,
    pathname: uploaded.pathname ?? pathname,
    contentType: file.type,
    size: file.size,
    context: input.context,
  }
}

