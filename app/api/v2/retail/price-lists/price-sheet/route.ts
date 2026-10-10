import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { esc, renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { prisma } from "@/lib/prisma";
import { auditExportDownloaded } from "@/lib/retail/audit";
import { parsePriceListBody, priceListActor } from "@/lib/retail/price-lists/routes";
import { priceListIdsInput, priceSheetLists } from "@/lib/retail/price-lists/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { RECORD_DOCUMENT_CSS } from "@/lib/retail/record-pdf";
import { requireRetailSession } from "../../_helpers";

const SHEET_CSS = `${RECORD_DOCUMENT_CSS}
  .pl-section + .pl-section { break-before: page; }
  .pl-section h2 { font-size: 15px; margin: 0 0 8px; }
`;

const CURRENCY: Record<string, string> = { USD: "US$", ZWG: "ZiG" };

/**
 * Bulk "Print price sheet" (PRD-05): one A4 section per list, its products
 * by category with the price and, above one, the quantity it starts at.
 * `retail.prices:view`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.prices", "view");
  if (gate) return gate;

  const parsed = await parsePriceListBody(request, priceListIdsInput);
  if ("response" in parsed) return parsed.response;
  const companyId = session.user.companyId;
  try {
    const lists = await priceSheetLists(companyId, parsed.data.ids);
    if (lists.length === 0) return errorResponse("Price list not found", 404);

    const content = lists
      .map((list) => {
        const byCategory = new Map<string, typeof list.rows>();
        for (const row of list.rows) byCategory.set(row.category, [...(byCategory.get(row.category) ?? []), row]);
        const tables = [...byCategory.entries()]
          .map(
            ([category, rows]) => `<table class="rd-table"><caption>${esc(category)}</caption>
              <thead><tr><th>Product</th><th>Code</th><th class="num">From</th><th class="num">Price</th></tr></thead>
              <tbody>${rows
                .map(
                  (row) =>
                    `<tr><td>${esc(row.name)}</td><td>${esc(row.code)}</td><td class="num">${row.minQuantity > 1 ? esc(row.minQuantity) : ""}</td><td class="num">${esc(`${CURRENCY[list.currency] ?? list.currency}${row.price}`)}</td></tr>`,
                )
                .join("")}</tbody></table>`,
          )
          .join("");
        return `<section class="pl-section"><h2>${esc(list.name)}</h2>${tables || `<p class="rd-note">No products on it yet.</p>`}</section>`;
      })
      .join("");

    const [template, branding] = await Promise.all([
      resolveTemplate({ companyId, documentType: "REPORT_TABLE", targetType: "LIST", sourceKey: "ui.list.retail.retail-price-lists" }),
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
      title: lists.length === 1 ? lists[0]!.name : "Price sheet",
      subtitle: lists.length === 1 ? "Price sheet" : lists.map((list) => list.name).join(", "),
      content,
      css: SHEET_CSS,
    });
    const pdf = await renderPdfFromHtml({ html, template: schema });
    await auditExportDownloaded(prisma, {
      actor: priceListActor(session),
      key: "retail-price-lists:price-sheet",
      format: "pdf",
      rows: lists.reduce((sum, list) => sum + list.rows.length, 0),
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="price-sheet.pdf"` },
    });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/price-lists/price-sheet error:", error);
    return errorResponse("The price sheet could not be made");
  }
}
