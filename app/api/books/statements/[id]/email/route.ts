import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { renderDocumentSync } from "@/lib/documents/service";
import { sendEmail } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200).optional(),
  message: z.string().max(2000).optional(),
  from: z.string().optional(),
  toPeriod: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = sendEmailSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("A valid recipient email address is required", 400);
    }

    const { to, subject: customSubject, message: customMessage, from, toPeriod } = parsed.data;

    const [customer, branding] = await Promise.all([
      prisma.customer.findFirst({
        where: { id, companyId: session.user.companyId },
        select: { id: true, name: true, email: true },
      }),
      getDocumentBranding(session.user.companyId),
    ]);

    if (!customer) {
      return errorResponse("Customer not found", 404);
    }

    const rendered = await renderDocumentSync(session.user.companyId, {
      target: "RECORD",
      sourceKey: "accounting.sales.statement",
      recordId: id,
      format: "pdf",
      mode: "SYNC",
      filters: from || toPeriod ? { from: from ?? "", to: toPeriod ?? "" } : undefined,
    });

    const companyName = branding.displayName || "Accounts";
    const subject =
      customSubject?.trim() || `Statement of Account — ${customer.name} [${companyName}]`;

    const greeting = `Dear ${customer.name},`;
    const defaultNote =
      "Please find attached your latest statement of account. If you have any questions or require any clarification regarding these entries, please do not hesitate to contact our accounts department.";
    const userMessage = customMessage?.trim() ? `<p>${customMessage.replace(/\n/g, "<br/>")}</p>` : "";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
        <p>${greeting}</p>
        ${userMessage || `<p>${defaultNote}</p>`}
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; font-weight: 600; color: #0f172a;">Attached Document</p>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">${rendered.fileName} (PDF)</p>
        </div>
        <p style="color: #64748b; font-size: 13px; margin-top: 24px;">Thank you for your business.<br/>${companyName}</p>
      </div>
    `.trim();

    const text = `
${greeting}

${customMessage?.trim() || defaultNote}

Attachment: ${rendered.fileName}

Thank you for your business.
${companyName}
    `.trim();

    await sendEmail({
      to,
      subject,
      html,
      text,
      sender: {
        name: companyName,
        replyTo: branding.email || session.user.email,
      },
      attachments: [
        {
          filename: rendered.fileName,
          content: Buffer.from(rendered.data),
        },
      ],
    });

    return successResponse({
      success: true,
      to,
      subject,
      fileName: rendered.fileName,
    });
  } catch (error) {
    console.error("[API] POST /api/books/statements/[id]/email error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to email the statement",
      500,
    );
  }
}
