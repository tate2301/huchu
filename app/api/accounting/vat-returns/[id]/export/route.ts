import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { parseVatReturnPayload } from "@/lib/accounting/vat-return";

type RouteParams = { params: Promise<{ id: string }> };

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) =>
    headers
      .map((header) => {
        const value = String(row[header] ?? "");
        if (value.includes(",") || value.includes("\"")) {
          return `"${value.replace(/"/g, "\"\"")}"`;
        }
        return value;
      })
      .join(","),
  );
  return [headers.join(","), ...body].join("\n");
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") ?? "json";

    const vatReturn = await prisma.vatReturn.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!vatReturn || vatReturn.companyId !== session.user.companyId) {
      return errorResponse("VAT return not found", 404);
    }

    const payload = parseVatReturnPayload(vatReturn);

    if (format === "csv") {
      const csv = toCsv(
        vatReturn.lines.map((line) => ({
          code: line.code,
          name: line.name,
          rate: line.rate,
          taxableAmount: line.taxableAmount,
          outputTax: line.outputTax,
          inputTax: line.inputTax,
          adjustments: line.adjustments,
          netTax: line.netTax,
        })),
      );
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="vat-return-${id}.csv"`,
        },
      });
    }

    if (format === "vat7-csv") {
      const boxes = (payload.vat7Boxes ?? {}) as Record<string, number>;
      const schedules = (payload.schedules ?? {}) as Record<string, unknown>;
      const boxRows = Object.entries(boxes).map(([key, value]) => ({ section: "BOX", key, value }));
      const scheduleRows: Array<{ section: string; key: string; value: string | number }> = [];
      for (const [scheduleKey, list] of Object.entries(schedules)) {
        if (!Array.isArray(list)) continue;
        list.forEach((item, index) => {
          const taxAmount =
            item && typeof item === "object" && "taxAmount" in item
              ? Number((item as Record<string, unknown>).taxAmount ?? 0)
              : 0;
          scheduleRows.push({ section: "SCHEDULE", key: `${scheduleKey}[${index}]`, value: taxAmount });
        });
      }
      const csv = toCsv([...boxRows, ...scheduleRows]);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="vat7-return-${id}.csv"`,
        },
      });
    }

    if (format === "vat7-json") {
      return successResponse({
        id: payload.id,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        status: payload.status,
        filingCategory: payload.filingCategory ?? null,
        returnDueDate: payload.returnDueDate ?? null,
        paymentDueDate: payload.paymentDueDate ?? null,
        boxes: payload.vat7Boxes ?? {},
        schedules: payload.schedules ?? {},
      });
    }

    return successResponse(payload);
  } catch (error) {
    console.error("[API] GET /api/accounting/vat-returns/[id]/export error:", error);
    return errorResponse("Failed to export VAT return");
  }
}
