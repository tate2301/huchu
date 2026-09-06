import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  issueLoan,
  LibraryError,
  overdueFine,
  renewLoan,
  reserveBook,
  returnLoan,
} from "@/lib/schools/library";

const querySchema = z.object({
  /** Borrower, title or accession number — whatever is on the slip in hand. */
  search: z.string().trim().max(120).optional(),
  /** The Monday-morning view: what is out and late. */
  overdueOnly: z.coerce.boolean().optional(),
  studentId: z.string().uuid().optional(),
  /** The year group the borrower is in, so a form teacher can be handed a list. */
  classId: z.string().uuid().optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("issue"),
    copyId: z.string().uuid(),
    studentId: z.string().uuid(),
  }),
  z.object({ action: z.literal("return"), loanId: z.string().uuid() }),
  z.object({ action: z.literal("renew"), loanId: z.string().uuid() }),
  z.object({
    action: z.literal("reserve"),
    bookId: z.string().uuid(),
    studentId: z.string().uuid(),
  }),
  z.object({ action: z.literal("pay-fine"), loanId: z.string().uuid() }),
]);

/**
 * What is out, as its own list.
 *
 * `/api/v2/schools/library` hands back the catalogue and the register together,
 * because the issue desk needs both to draw one screen. The loans screen needs
 * only the second half, and asking for the whole catalogue to show forty
 * overdue slips is 300 titles and their copies down the wire for nothing.
 *
 * So this is the register on its own, paginated, and narrowable the three ways
 * somebody actually asks for it: by borrower, by year group, and by late. The
 * summary rides along because the band above the table counts the whole
 * register, not the page of it in view — a "38 late" that changed when you
 * turned the page would be a lie.
 *
 * Overdue and the fine are computed against now rather than read: a loan goes
 * late by the passing of a day, not by anybody doing anything, and the stored
 * fine is only decided when the book is actually back.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = querySchema.parse({
      search: searchParams.get("search") ?? undefined,
      overdueOnly: searchParams.get("overdueOnly") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
    });

    const at = new Date();
    const where: Prisma.SchoolBookLoanWhereInput = {
      companyId,
      // Out and not back. A returned loan belongs in a history, not on a
      // screen headed "what is out".
      returnedAt: null,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.classId ? { student: { currentClassId: query.classId } } : {}),
      ...(query.overdueOnly ? { dueAt: { lt: at } } : {}),
    };

    if (query.search) {
      const contains = { contains: query.search, mode: "insensitive" as const };
      where.OR = [
        { student: { firstName: contains } },
        { student: { lastName: contains } },
        { student: { studentNo: contains } },
        { copy: { copyCode: contains } },
        { copy: { book: { title: contains } } },
      ];
    }

    const [records, total, out, late, register] = await Promise.all([
      prisma.schoolBookLoan.findMany({
        where,
        select: {
          id: true,
          borrowedAt: true,
          dueAt: true,
          renewals: true,
          copy: {
            select: {
              id: true,
              copyCode: true,
              book: { select: { id: true, title: true, author: true } },
            },
          },
          student: {
            select: {
              id: true,
              studentNo: true,
              firstName: true,
              lastName: true,
              currentClass: { select: { id: true, name: true } },
            },
          },
        },
        // Soonest due first, which puts the most overdue at the top — the order
        // somebody works the list in.
        orderBy: { dueAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.schoolBookLoan.count({ where }),
      // The whole register, not the page and not the filters. The band says
      // "Out", and it means every book that has not come back — reusing the
      // filtered `where` here made Out equal Late on the default overdue view
      // and quietly rewrote the headline every time somebody typed in search.
      prisma.schoolBookLoan.count({
        where: { companyId, returnedAt: null },
      }),
      // Counted against the whole register rather than the filtered page, so
      // the band's numbers hold still while somebody pages through.
      prisma.schoolBookLoan.count({
        where: { companyId, returnedAt: null, dueAt: { lt: at } },
      }),
      prisma.schoolBookLoan.findMany({
        where: { companyId, returnedAt: null, dueAt: { lt: at } },
        select: { dueAt: true },
      }),
    ]);

    const loans = records.map((loan) => ({
      ...loan,
      isOverdue: loan.dueAt.getTime() < at.getTime(),
      // What it *would* cost if it came back today. Shown, not stored.
      fineIfReturnedToday: overdueFine(loan.dueAt, at),
    }));

    return successResponse({
      ...paginationResponse(loans, total, page, limit),
      summary: {
        out,
        late,
        finesIfBackToday: register.reduce(
          (sum, loan) => sum + overdueFine(loan.dueAt, at),
          0,
        ),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/library/loans error:", error);
    return errorResponse("Failed to fetch what is out");
  }
}

/**
 * The issue desk: lend, take back, renew, reserve, settle a fine.
 *
 * One route with an action, rather than five, because they are five buttons on
 * one screen operated by one person against one counter, and five routes would
 * be five copies of the same guard.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `edit` on academics: lending is a librarian's daily work, not a
    // structural change, but it does write against a child's record.
    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = bodySchema.parse(await request.json());

    switch (validated.action) {
      case "issue": {
        const loan = await issueLoan({
          companyId,
          copyId: validated.copyId,
          studentId: validated.studentId,
          issuedById: session.user.id,
        });
        return successResponse(loan, 201);
      }
      case "return": {
        const returned = await returnLoan({
          companyId,
          loanId: validated.loanId,
          returnedById: session.user.id,
        });
        return successResponse(returned);
      }
      case "renew": {
        const renewed = await renewLoan({ companyId, loanId: validated.loanId });
        return successResponse(renewed);
      }
      case "reserve": {
        const reservation = await reserveBook({
          companyId,
          bookId: validated.bookId,
          studentId: validated.studentId,
        });
        return successResponse(reservation, 201);
      }
      case "pay-fine": {
        const loan = await prisma.schoolBookLoan.findFirst({
          where: { id: validated.loanId, companyId },
          select: { id: true, fineAmount: true, finePaidAt: true },
        });
        if (!loan) return errorResponse("Loan not found", 404);
        if (!loan.fineAmount) return errorResponse("There is no fine on that loan", 400);
        if (loan.finePaidAt) return errorResponse("That fine is already settled", 409);

        const paid = await prisma.schoolBookLoan.update({
          where: { id: loan.id },
          data: { finePaidAt: new Date() },
          select: { id: true, finePaidAt: true },
        });
        return successResponse(paid);
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof LibraryError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/library/loans error:", error);
    return errorResponse("Failed at the issue desk");
  }
}
