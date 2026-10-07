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
import { requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { RECORD_DOCUMENT_CSS, recordPdfType } from "@/lib/retail/record-pdf";
import { requireRetailSession } from "../../../../_helpers";

const pathSchema = z.object({ type: z.string().min(1).max(60), id: z.string().uuid() });

/**
 * A record as a PDF (⋯ › "Export as PDF"; a shift's "Print X-report" with
 * `?as=x-report`). Each type's renderer and read check are in
 * `lib/retail/record-pdf.ts`. A shift is readable by cash control, or by the
 * cashier whose shift it is.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const path = pathSchema.safeParse(await params);
  if (!path.success) return errorResponse("Record not found", 404);
  const spec = recordPdfType(path.data.type);
  if (!spec) return errorResponse("Record not found", 404);

  const seesEveryDrawer = readsEveryCashier(session.user.role);
  const ownShift = path.data.type === "RetailShift" && !seesEveryDrawer;
  const gate = ownShift
    ? requireRetailPermission(session, "retail.sell", "open-shift")
    : requireRetailPermission(session, spec.read[0], spec.read[1]);
  if (gate) return gate;

  const companyId = session.user.companyId;
  const variant = request.nextUrl.searchParams.get("as");
  try {
    const document = await spec.render(
      { companyId, userId: session.user.id, role: retailRoleKey(session), seesEveryDrawer },
      path.data.id,
      variant,
    );
    if (!document) return errorResponse("Record not found", 404);
    if (document === "refused") return errorResponse("An X-report is only for a shift that is still open.", 409);

    const [template, branding] = await Promise.all([
      resolveTemplate({
        companyId,
        documentType: "REPORT_TABLE",
        targetType: "LIST",
        sourceKey: `ui.record.retail.${path.data.type}`,
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

    await auditExportDownloaded(prisma, {
      actor: { companyId, userId: session.user.id, userName: session.user.name, userRole: session.user.role },
      key: `record:${path.data.type}`,
      format: "pdf",
      rows: 1,
    });

    const fileName = document.ref.replace(/[^A-Za-z0-9._-]+/g, "-");
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${variant === "x-report" ? "inline" : "attachment"}; filename="${fileName}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/records/[type]/[id]/pdf error:", error);
    return errorResponse("The PDF could not be made");
  }
}
