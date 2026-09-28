import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/auth-core/rate-limit";
import { uploadFileToBlob, UploadValidationError } from "@/lib/uploads/upload-file";
import { parseIntakeFormConfig } from "@/lib/crm/intake-schema";

export const runtime = "nodejs";

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Public: upload a file for an intake submission. Rate-limited per token+IP.
 * Returns the blob URL to include in the subsequent submit.
 *
 * Two things get uploaded here and they are held to different rules. The
 * photos section (`allowPhotos`) takes images under the photo policy. An
 * Upload question — named by `?question=<key>` — takes whatever that policy
 * allows for answers, and only if the form really asks that question: a key
 * nobody asked about is not a licence to store a stranger's file.
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

  const question = request.nextUrl.searchParams.get("question");

  const form = await prisma.crmIntakeForm.findFirst({
    where: { publicToken: token, isActive: true },
    select: { companyId: true, allowPhotos: true, fields: true, services: true },
  });
  if (!form) {
    return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
  }

  if (question) {
    const asked = parseIntakeFormConfig(form.fields, form.services).fields.some(
      (field) => field.key === question && field.type === "file",
    );
    if (!asked) {
      return NextResponse.json({ ok: false, error: "This form does not ask for that file" }, { status: 404 });
    }
  } else if (!form.allowPhotos) {
    return NextResponse.json({ ok: false, error: "This form does not take photos" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const uploaded = await uploadFileToBlob({
      file,
      context: question ? "crm-intake-answer" : "crm-intake-photo",
      companyId: form.companyId,
    });
    return NextResponse.json({ ok: true, url: uploaded.url });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[API] POST /api/public/crm/intake/[token]/upload error:", error);
    return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
  }
}
