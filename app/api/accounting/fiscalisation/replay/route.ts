import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import {
  issueSchoolFeeReceiptFiscalisation,
  SCHOOL_FISCALISATION_FEATURE,
} from "@/lib/schools/fiscalisation";
import { hasFeature } from "@/lib/platform/features";
import { hasRole } from "@/lib/roles";

const schema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

/**
 * Drain the fiscal receipts that did not land.
 *
 * There is no worker and no cron: `issueFiscalDocument` writes its PENDING row
 * before it dials FDMS, and this endpoint is what turns those rows back into
 * attempts. S-2.7 widened it in two ways, both necessary or a school's receipts
 * would queue forever:
 *
 *   * it no longer filters on `invoiceId: { not: null }`, which excluded every
 *     school-sourced row by construction, and it re-issues each row through the
 *     issuer that matches its source;
 *   * it also sweeps posted school fee receipts that have **no** `FiscalReceipt`
 *     row at all. Fiscalisation happens after the receipt's transaction commits,
 *     so a process that dies in between leaves a receipt nothing would ever
 *     retry. That gap is the price of never letting a fiscal failure roll back a
 *     payment, and this is what closes it.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session.user.role, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to replay fiscal receipts", 403);
    }

    const body = await request.json().catch(() => ({}));
    const validated = schema.parse(body);
    const limit = validated.limit ?? 50;
    const companyId = session.user.companyId;

    const now = new Date();
    const candidates = await prisma.fiscalReceipt.findMany({
      where: {
        companyId,
        status: { in: ["FAILED", "PENDING"] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: [{ updatedAt: "asc" }],
      take: limit,
      select: {
        id: true,
        invoiceId: true,
        schoolReceiptId: true,
        creditNoteId: true,
        retailSaleId: true,
      },
    });

    // The never-attempted sweep, bounded by whatever the retry pass left of the
    // limit so one call cannot be made unboundedly expensive.
    const remaining = Math.max(limit - candidates.length, 0);
    const schoolsFiscalise =
      remaining > 0 && (await hasFeature(companyId, SCHOOL_FISCALISATION_FEATURE));
    const unattempted =
      schoolsFiscalise
        ? await prisma.schoolFeeReceipt.findMany({
            where: {
              companyId,
              status: "POSTED",
              fiscalReceipt: { is: null },
            },
            orderBy: [{ createdAt: "asc" }],
            take: remaining,
            select: { id: true },
          })
        : [];

    let queued = 0;
    let failed = 0;
    let skipped = 0;
    let deferred = 0;

    const attempt = async (run: () => Promise<{ status: string }>) => {
      try {
        const result = await run();
        if (result.status === "FAILED") failed += 1;
        else if (result.status === "SKIPPED") skipped += 1;
        else queued += 1;
      } catch {
        failed += 1;
      }
    };

    for (const receipt of candidates) {
      if (receipt.invoiceId) {
        await attempt(() =>
          issueFiscalReceipt(companyId, receipt.invoiceId!, session.user.id),
        );
      } else if (receipt.schoolReceiptId) {
        await attempt(async () => {
          const result = await issueSchoolFeeReceiptFiscalisation({
            companyId,
            receiptId: receipt.schoolReceiptId!,
          });
          return { status: result.fiscalStatus };
        });
      } else if (receipt.creditNoteId || receipt.retailSaleId) {
        // FD-0.4a widened `FiscalReceipt` to four sources, but only two of them
        // have an issuer yet: re-issuing needs the signing input rebuilt from
        // the source document, and those mappings are FD-4.1 (credit note) and
        // FD-5.1 (till sale). Counting these as `failed` would be a lie — no
        // attempt was made and nothing is wrong with the row — and counting
        // them as `skipped` would hide them among the schools-without-the-addon
        // sweep. They are named so that a drain which cannot yet drain
        // everything says so out loud rather than looking clean.
        deferred += 1;
      } else {
        // A row naming no source at all. `FiscalReceipt_one_source_check` makes
        // this impossible; it is counted rather than ignored so that a
        // constraint which has stopped holding shows up here instead of being
        // discovered by a chain that will not verify.
        failed += 1;
      }
    }

    for (const receipt of unattempted) {
      await attempt(async () => {
        const result = await issueSchoolFeeReceiptFiscalisation({
          companyId,
          receiptId: receipt.id,
        });
        return { status: result.fiscalStatus };
      });
    }

    return successResponse({
      processed: candidates.length + unattempted.length,
      queued,
      failed,
      // A school without the add-on: swept, correctly left alone, and not a
      // failure. Reported so the count reconciles.
      skipped,
      // Sources this build cannot re-issue yet (credit notes, till sales).
      deferred,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/fiscalisation/replay error:", error);
    return errorResponse("Failed to replay fiscal receipts");
  }
}
