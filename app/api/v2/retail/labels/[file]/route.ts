import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { hereLabels } from "@/lib/retail/labels/print";
import { renderLabelsPdf } from "@/lib/retail/labels/render";
import { labelFailure } from "@/lib/retail/labels/routes";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

type Context = { params: Promise<{ file: string }> };

const FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/i;

/**
 * "Print here" (PRD-06): the labels a POST to `/labels` printed here, as a
 * PDF, for the person who printed them and for 15 minutes.
 */
export async function GET(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  // Who prints labels (PRD-06, C-30): whoever may change catalogue items, or the
  // stock clerk, who adjusts stock on the shelf; anyone else hears the catalogue's refusal.
  const gate = canRetailSessionDo(session, "retail.adjustments", "create")
    ? null
    : requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  const match = FILE.exec((await context.params).file);
  const expired = "These labels are no longer here. Print them again.";
  if (!match) return errorResponse(expired, 404);
  try {
    const job = await hereLabels(session.user.companyId, session.user.id, match[1]!.toLowerCase());
    if (!job) return errorResponse(expired, 404);
    const pdf = await renderLabelsPdf(job.size, job.labels);
    return new NextResponse(pdf, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="shelf-labels.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return labelFailure(error, "GET /api/v2/retail/labels/[file]");
  }
}
