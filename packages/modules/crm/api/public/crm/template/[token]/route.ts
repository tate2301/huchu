import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { blockSchema } from "@corelithzw/module-documents/blocks";
import { z } from "zod";

/**
 * Public: a block template, for rendering at /f/[token].
 *
 * No auth — the token is the capability, same as the intake forms this
 * generalises. Only forms are servable: a quote layout has a public token in
 * the schema but publishing one would put a price list on the open web.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const template = await prisma.crmTemplate.findFirst({
    where: { publicToken: token, isActive: true, kind: "FORM" },
    select: {
      id: true,
      companyId: true,
      name: true,
      kind: true,
      attributes: true,
      blocks: true,
      company: { select: { name: true } },
    },
  });

  if (!template) {
    return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
  }

  const blocks = z.array(blockSchema).safeParse(template.blocks);
  if (!blocks.success) {
    return NextResponse.json({ ok: false, error: "Form is misconfigured" }, { status: 500 });
  }

  // Counted here rather than on submit so the funnel has both ends. Opens are
  // the denominator of every question worth asking about a form.
  await prisma.$transaction([
    prisma.crmTemplate.update({
      where: { id: template.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    }),
    prisma.crmTemplateEvent.create({
      data: {
        companyId: template.companyId,
        templateId: template.id,
        type: "VIEW",
        source: "public",
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    form: {
      name: template.name,
      attributes: template.attributes,
      blocks: blocks.data,
      companyName: template.company.name,
    },
  });
}
