import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { parseIntakeFormConfig } from "../../../../../intake-schema";

/**
 * Public: fetch an active intake form's definition for rendering at /f/[token].
 * No auth — the token is the capability.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const form = await prisma.crmIntakeForm.findFirst({
    where: { publicToken: token, isActive: true },
    select: {
      name: true,
      headline: true,
      description: true,
      successMessage: true,
      allowPhotos: true,
      maxPhotos: true,
      fields: true,
      services: true,
      company: { select: { name: true } },
    },
  });

  if (!form) {
    return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
  }

  let config;
  try {
    config = parseIntakeFormConfig(form.fields, form.services);
  } catch {
    return NextResponse.json({ ok: false, error: "Form is misconfigured" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    form: {
      name: form.name,
      headline: form.headline,
      description: form.description,
      successMessage: form.successMessage,
      allowPhotos: form.allowPhotos,
      maxPhotos: form.maxPhotos,
      companyName: form.company.name,
      fields: config.fields,
      services: config.services,
    },
  });
}
