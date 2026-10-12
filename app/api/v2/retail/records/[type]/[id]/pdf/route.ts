import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-response";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { prisma } from "@/lib/prisma";
import { auditExportDownloaded } from "@/lib/retail/audit";
import { readsEveryCashier } from "@/lib/retail/own-rows";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { checkDocumentToken, LINK_RUN_OUT } from "@/lib/retail/buying/documents";
import { RECORD_DOCUMENT_CSS, recordPdfType, type RecordDocument } from "@/lib/retail/record-pdf";
import { requireRetailSession } from "../../../../_helpers";

const pathSchema = z.object({ type: z.string().min(1).max(60), id: z.string().uuid() });

/**
 * A record as a PDF (⋯ › "Export as PDF"; a shift's "Print X-report" with
 * `?as=x-report`). Each type's renderer and read check are in
 * `lib/retail/record-pdf.ts`. A shift is readable by cash control, or by the
 * cashier whose shift it is.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const path = pathSchema.safeParse(await params);
  if (!path.success) return errorResponse("Record not found", 404);
  const spec = recordPdfType(path.data.type);
  if (!spec) return errorResponse("Record not found", 404);
  const print = request.nextUrl.searchParams.get("print") === "1";

  // A purchase order's link in a message: no sign-in, a signed token for 30 days.
  const token = request.nextUrl.searchParams.get("token");
  if (token && path.data.type === "RetailPurchaseOrder") {
    const checked = checkDocumentToken(path.data.id, token);
    if (checked === "expired") return errorResponse(LINK_RUN_OUT, 410);
    if (checked !== "ok") return errorResponse("Record not found", 404);
    const order = await prisma.retailPurchaseOrder.findUnique({ where: { id: path.data.id }, select: { companyId: true } });
    if (!order) return errorResponse("Record not found", 404);
    try {
      const document = await spec.render({ companyId: order.companyId, userId: "", role: null, seesEveryDrawer: false }, path.data.id, null);
      if (!document || document === "refused") return errorResponse("Record not found", 404);
      return await pdfAnswer(order.companyId, path.data.type, document, true);
    } catch (error) {
      console.error("[API] GET /api/v2/retail/records/[type]/[id]/pdf (token) error:", error);
      return errorResponse("The PDF could not be made");
    }
  }

  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const seesEveryDrawer = readsEveryCashier(session.user.role);
  const ownShift = path.data.type === "RetailShift" && !seesEveryDrawer;
  const gate = ownShift
    ? requireRetailPermission(session, "retail.sell", "open-shift")
    : spec.alsoRead && canRetailSessionDo(session, spec.alsoRead[0], spec.alsoRead[1])
      ? null
      : requireRetailPermission(session, spec.read[0], spec.read[1]);
  if (gate) return gate;

  // `?sign=1`: "Print for signing" (a requisition with boxes to sign), opened to print.
  const variant = request.nextUrl.searchParams.get("as") ?? (request.nextUrl.searchParams.get("sign") === "1" ? "sign" : null);
  // The X-report is a till action: cash control, or the cashier selling at the till; the bookkeeper reads the record only.
  if (variant === "x-report" && !canRetailSessionDo(session, "retail.sell", "open-shift")) {
    const xGate = requireRetailPermission(session, "retail.cash-control", "update");
    if (xGate) return xGate;
  }

  const companyId = session.user.companyId;
  try {
    const document = await spec.render(
      { companyId, userId: session.user.id, role: retailRoleKey(session), seesEveryDrawer },
      path.data.id,
      variant,
    );
    if (!document) return errorResponse("Record not found", 404);
    if (document === "refused") return errorResponse("An X-report is only for a shift that is still open.", 409);

    const answer = await pdfAnswer(companyId, path.data.type, document, variant === "x-report" || variant === "sign" || print);
    await auditExportDownloaded(prisma, {
      actor: { companyId, userId: session.user.id, userName: session.user.name, userRole: session.user.role },
      key: `record:${path.data.type}`,
      format: "pdf",
      rows: 1,
    });
    return answer;
  } catch (error) {
    console.error("[API] GET /api/v2/retail/records/[type]/[id]/pdf error:", error);
    return errorResponse("The PDF could not be made");
  }
}

/** The document in the company's template, as a PDF: inline to print or read, else a download. */
async function pdfAnswer(companyId: string, type: string, document: RecordDocument, inline: boolean): Promise<NextResponse> {
  const [template, branding] = await Promise.all([
    resolveTemplate({
      companyId,
      documentType: "REPORT_TABLE",
      targetType: "LIST",
      sourceKey: `ui.record.retail.${type}`,
    }),
    getDocumentBranding(companyId),
  ]);
  const schema = {
    ...template.templateSchema,
    page: { ...template.templateSchema.page, orientation: "portrait" as const },
    labels: { ...template.templateSchema.labels, documentTitle: undefined },
  };
  const html = renderDocumentShell({
    branding,
    template: schema,
    title: document.title,
    subtitle: document.subtitle,
    content: document.content,
    css: RECORD_DOCUMENT_CSS,
  });
  const pdf = await renderPdfFromHtml({ html, template: schema });
  const fileName = document.ref.replace(/[^A-Za-z0-9._-]+/g, "-");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}.pdf"`,
    },
  });
}
