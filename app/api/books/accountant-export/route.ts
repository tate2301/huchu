import { NextRequest, NextResponse } from "next/server";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { accountantExport, accountantWorkbook, yearToDate } from "@/lib/books/core/accountant-export";
import { dayOf } from "@/lib/books/format";
import { prisma } from "@/lib/prisma";
import { writePlatformAuditEvent } from "@/lib/audit/platform";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The accountant export (Management › Company › Accountant export, and Trial
 * balance's "Export for your accountant"): the trial balance, the general
 * ledger and the three statements as one workbook. Core, so it needs no Books
 * screens; the owner, a manager or the accountant downloads it.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const companyId = sessionResult.session.user.companyId;
    const params = new URL(request.url).searchParams;
    const settings = await prisma.accountingSettings.findUnique({ where: { companyId }, select: { fiscalYearStartMonth: true } });
    const fallback = yearToDate(dayOf(new Date()), settings?.fiscalYearStartMonth ?? 1);
    const from = DAY.test(params.get("from") ?? "") ? params.get("from")! : fallback.from;
    const to = DAY.test(params.get("to") ?? "") ? params.get("to")! : fallback.to;
    if (from > to) return errorResponse("The first day comes after the last", 400);
    const data = await accountantExport(companyId, { from, to });
    const body = await accountantWorkbook(data);
    // Year end's "Send the year to your accountant" reads this.
    await writePlatformAuditEvent({ companyId, actorId: sessionResult.session.user.id, eventType: "books.accountant-export.downloaded", entityType: "Company", entityId: companyId, payload: { from, to, accounts: data.trialBalance.rows.length, debit: data.trialBalance.debit, credit: data.trialBalance.credit } });
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="books-${from}-to-${to}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/books/accountant-export error:", error);
    return errorResponse("The export was not made");
  }
}
