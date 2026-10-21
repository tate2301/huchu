import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { auditCsv, auditQuery, readAudit } from "@/lib/books/audit";
import { guardBooks } from "@/lib/books/core";
import { prisma } from "@/lib/prisma";

/** Books → Ledger → Audit trail: every change to a posted record, with who, why and what was kept. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = auditQuery.parse(Object.fromEntries(["q", "kind", "dates", "who", "page", "event"].map((key) => [key, params.get(key) ?? undefined])));
    const companyId = sessionResult.session.user.companyId;
    if (params.get("format") === "csv") {
      return new NextResponse(await auditCsv(prisma, companyId, query), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="audit-trail.csv"' } });
    }
    return successResponse(await readAudit(prisma, companyId, query));
  } catch (error) {
    console.error("[API] GET /api/books/audit error:", error);
    return errorResponse("Could not read the audit trail");
  }
}
