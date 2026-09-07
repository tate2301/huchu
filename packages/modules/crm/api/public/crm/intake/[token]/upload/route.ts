import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { checkRateLimit } from "@corelithzw/platform/auth-core/rate-limit";
import { uploadFileToBlob, UploadValidationError } from "@corelithzw/platform/uploads/upload-file";

export const runtime = "nodejs";

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Public: upload a photo attached to an intake submission. Rate-limited per
 * token+IP. Returns the blob URL to include in the subsequent submit.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const limit = checkRateLimit({ key: `crm-intake-upload:${token}:${clientIp(request)}`, limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const form = await prisma.crmIntakeForm.findFirst({
    where: { publicToken: token, isActive: true, allowPhotos: true },
    select: { companyId: true },
  });
  if (!form) {
    return NextResponse.json({ ok: false, error: "Form not found or photos disabled" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const uploaded = await uploadFileToBlob({ file, context: "crm-intake-photo", companyId: form.companyId });
    return NextResponse.json({ ok: true, url: uploaded.url });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[API] POST /api/public/crm/intake/[token]/upload error:", error);
    return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
  }
}
