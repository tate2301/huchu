import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  borrowingRefusal,
  DEFAULT_LENDING_POLICY,
  issueLoan,
  LibraryError,
  loanRegister,
  outstandingFines,
  renewLoan,
  reserveBook,
  returnLoan,
} from "@corelithzw/module-campus/library";
import { resolvePortalStudent } from "@corelithzw/module-campus/portal-identity";

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
});

/**
 * Never a `studentId`. A pupil borrows as themselves or not at all, so the
 * only thing the body carries is which book and which loan — and the loan is
 * checked against their own record before anything is written.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("borrow"), bookId: z.string().uuid() }),
  z.object({ action: z.literal("return"), loanId: z.string().uuid() }),
  z.object({ action: z.literal("renew"), loanId: z.string().uuid() }),
  z.object({ action: z.literal("reserve"), bookId: z.string().uuid() }),
]);

/** The pupil whose library this is, or a response saying it is nobody's. */
async function readerFor(session: { user: { id: string; companyId: string; role?: string | null } }) {
  const resolution = await resolvePortalStudent(
    {
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
    },
    { select: { id: true, firstName: true, lastName: true } },
  );
  return resolution.subject;
}

/**
 * The library as one pupil sees it.
 *
 * `/api/v2/schools/library` answers the librarian's question — the whole loan
 * register, behind an `schools.academics` grant a child does not hold, and
 * scoped by a `studentId` the caller supplies. This answers the reader's:
 * what I have out, what it costs me if I keep it, and what is on the shelf.
 *
 * Availability is counted from copies rather than read off the title, because
 * a library lends the copy with the barcode. "Three copies, two out" is the
 * only honest answer to "can I take this home today".
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      search: searchParams.get("search") ?? undefined,
    });

    const student = await readerFor(session);
    if (!student) return errorResponse("You are not a student here", 403);

    const [books, loans, fines, reservations] = await Promise.all([
      prisma.schoolBook.findMany({
        where: {
          companyId,
          ...(query.search
            ? {
                OR: [
                  { title: { contains: query.search, mode: "insensitive" as const } },
                  { author: { contains: query.search, mode: "insensitive" as const } },
                  { isbn: { contains: query.search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          author: true,
          category: true,
          shelfMark: true,
          copies: {
            where: { isWithdrawn: false },
            select: {
              id: true,
              // Only the live loan, and only enough of it to say whether the
              // copy is on the shelf. Who else has it out is not this reader's
              // business.
              loans: { where: { returnedAt: null }, select: { studentId: true } },
            },
          },
          reservations: {
            where: { closedAt: null },
            select: { id: true, studentId: true, readyAt: true },
          },
        },
        orderBy: { title: "asc" },
        take: 120,
      }),
      loanRegister({ companyId, studentId: student.id }),
      outstandingFines({ companyId, studentId: student.id }),
      prisma.schoolBookReservation.findMany({
        where: { companyId, studentId: student.id, closedAt: null },
        select: {
          id: true,
          reservedAt: true,
          readyAt: true,
          book: { select: { id: true, title: true, author: true } },
        },
        orderBy: { reservedAt: "asc" },
      }),
    ]);

    const policy = DEFAULT_LENDING_POLICY;
    // One definition of the rule. The screen words the refusal for a child;
    // whether it applies is decided here, by the same function the issue desk
    // calls.
    const refusal = borrowingRefusal(
      {
        name: `${student.firstName} ${student.lastName}`,
        openLoans: loans.length,
        unpaidFines: fines.total,
      },
      policy,
    );

    return successResponse({
      policy,
      canBorrow: refusal === null,
      loans: loans.map((loan) => ({
        id: loan.id,
        borrowedAt: loan.borrowedAt,
        dueAt: loan.dueAt,
        renewals: loan.renewals,
        isOverdue: loan.isOverdue,
        fineIfReturnedToday: loan.fineIfReturnedToday,
        copyCode: loan.copy.copyCode,
        book: loan.copy.book,
      })),
      fines,
      reservations,
      books: books.map((book) => {
        const total = book.copies.length;
        const out = book.copies.filter((copy) => copy.loans.length > 0).length;
        return {
          id: book.id,
          title: book.title,
          author: book.author,
          category: book.category,
          shelfMark: book.shelfMark,
          copies: total,
          available: total - out,
          waiting: book.reservations.length,
          haveItOut: book.copies.some((copy) =>
            copy.loans.some((loan) => loan.studentId === student.id),
          ),
          reservedByMe: book.reservations.some(
            (reservation) => reservation.studentId === student.id,
          ),
        };
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal/student/me/library error:", error);
    return errorResponse("Failed to fetch the library");
  }
}

/**
 * The four things a reader does: take one out, bring it back, keep it longer,
 * join the queue.
 *
 * Every rule — the loan limit, the unpaid fine, the renewal cap, the reader
 * waiting for the title — is the library service's, not this handler's. A
 * phone that decided its own limits would be a second set of rules to keep in
 * step with the issue desk.
 *
 * Settling a fine is deliberately absent: taking money needs the payment
 * primitive (S-7.3), and a button that marked a fine paid without one would be
 * a child clearing their own debt.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const student = await readerFor(session);
    if (!student) return errorResponse("You are not a student here", 403);

    const validated = bodySchema.parse(await request.json());

    switch (validated.action) {
      case "borrow": {
        // The reader picks a title; the library picks the copy. A phone has no
        // barcode in front of it, and asking a child which accession number
        // they want is asking them a question about the catalogue.
        const copy = await prisma.schoolBookCopy.findFirst({
          where: {
            companyId,
            bookId: validated.bookId,
            isWithdrawn: false,
            loans: { none: { returnedAt: null } },
          },
          select: { id: true },
          orderBy: { copyCode: "asc" },
        });
        if (!copy) return errorResponse("Every copy of that book is out", 409);

        const loan = await issueLoan({
          companyId,
          copyId: copy.id,
          studentId: student.id,
          issuedById: session.user.id,
        });
        return successResponse(loan, 201);
      }
      case "return":
      case "renew": {
        // The loan has to be this reader's before either verb touches it.
        // `returnLoan` and `renewLoan` take an id and trust it, which is right
        // at a desk where a librarian is holding the book and wrong here.
        const loan = await prisma.schoolBookLoan.findFirst({
          where: { id: validated.loanId, companyId, studentId: student.id },
          select: { id: true },
        });
        if (!loan) return errorResponse("That book is not out to you", 404);

        if (validated.action === "return") {
          const returned = await returnLoan({
            companyId,
            loanId: loan.id,
            returnedById: session.user.id,
          });
          return successResponse(returned);
        }
        const renewed = await renewLoan({ companyId, loanId: loan.id });
        return successResponse(renewed);
      }
      case "reserve": {
        const reservation = await reserveBook({
          companyId,
          bookId: validated.bookId,
          studentId: student.id,
        });
        return successResponse(reservation, 201);
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof LibraryError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/portal/student/me/library error:", error);
    return errorResponse("Failed at the library");
  }
}
