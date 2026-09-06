import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { checkRateLimit } from "@/lib/auth-core/rate-limit";
import { uploadFileToBlob, UploadValidationError } from "@/lib/uploads/upload-file";

export const runtime = "nodejs";

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Public: a file answering a question on a public form.
 *
 * The submit endpoint stores where an upload landed, not the file, so a file
 * question needs somewhere to put it first. Rate-limited per token and IP for
 * the same reason the intake photo endpoint is: a public URL that writes to
 * blob storage is a public URL that will be found.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const limit = checkRateLimit({
    key: `crm-template-upload:${token}:${clientIp(request)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const template = await prisma.crmTemplate.findFirst({
    where: { publicToken: token, isActive: true, kind: "FORM" },
    select: { companyId: true },
  });
  if (!template) {
    return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const uploaded = await uploadFileToBlob({
      file,
      context: "crm-template-upload",
      companyId: template.companyId,
    });
    return NextResponse.json({ ok: true, url: uploaded.url });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[API] POST /api/public/crm/template/[token]/upload error:", error);
    return NextResponse.json({ ok: false, error: "Failed to upload file" }, { status: 500 });
  }
}
