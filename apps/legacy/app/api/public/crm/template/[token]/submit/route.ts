import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { blockSchema, fieldBlocks, validateAnswers } from "@/lib/crm/blocks";

const submitSchema = z.object({
  answers: z.record(z.string().max(60), z.unknown()),
});

/**
 * Public: somebody filled a form in.
 *
 * Required questions are checked here rather than only in the browser, because
 * the browser is not where the guarantee lives — anybody can post to this URL,
 * and a form that only validates client-side collects half-empty rows the
 * moment somebody tries.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const template = await prisma.crmTemplate.findFirst({
    where: { publicToken: token, isActive: true, kind: "FORM" },
    select: { id: true, companyId: true, name: true, blocks: true, attributes: true },
  });

  if (!template) {
    return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
  }

  let body: z.infer<typeof submitSchema>;
  try {
    body = submitSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed submission" }, { status: 400 });
  }

  const blocks = z.array(blockSchema).safeParse(template.blocks);
  if (!blocks.success) {
    return NextResponse.json({ ok: false, error: "Form is misconfigured" }, { status: 500 });
  }

  // Every question is checked against what the builder said it was — a number
  // is a number, a select is one of its own options, a date parses. Checking
  // only that a required answer is non-empty let "banana" through as a
  // quantity, and these answers are read back as record values.
  const questions = fieldBlocks(blocks.data);
  const { values: answers, problems } = validateAnswers(questions, body.answers);

  if (problems.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: problems.map((problem) => `${problem.label}: ${problem.message}`).join("; "),
        problems,
      },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.crmTemplateEvent.create({
      data: {
        companyId: template.companyId,
        templateId: template.id,
        type: "SUBMIT",
        source: "public",
        payload: answers as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.crmTemplate.update({
      where: { id: template.id },
      data: { submitCount: { increment: 1 }, lastSubmitAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
