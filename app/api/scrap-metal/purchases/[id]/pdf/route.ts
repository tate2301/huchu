import { NextRequest, NextResponse } from "next/server";
import { errorResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { renderDocumentSync } from "@/lib/documents/service";
import { hasFeature } from "@/lib/platform/features";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const forceDownload = searchParams.get("download") === "1";

    const enabled = await hasFeature(session.user.companyId, "scrap-metal.purchases");
    if (!enabled) {
      return errorResponse("Feature disabled for this export source", 403);
    }

    const purchase = await prisma.scrapMetalPurchase.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });
    if (!purchase || purchase.companyId !== session.user.companyId) {
      return errorResponse("Inbound ticket not found", 404);
    }

    const rendered = await renderDocumentSync(session.user.companyId, {
      target: "RECORD",
      sourceKey: "scrap-metal.purchase-ticket",
      recordId: id,
      format: "pdf",
      mode: "SYNC",
    });

    await prisma.scrapMetalPurchase.update({
      where: { id },
      data: {
        lastPrintedAt: new Date(),
        printCount: { increment: 1 },
        printedById: session.user.id,
      },
    });

    return new Response(new Uint8Array(rendered.data), {
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${rendered.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/purchases/[id]/pdf error:", error);
    return errorResponse("Failed to render inbound ticket PDF");
  }
}
