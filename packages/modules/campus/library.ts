import { prisma } from "@corelithzw/db/client";
import {
  borrowingRefusal,
  DEFAULT_LENDING_POLICY,
  dueDateFor,
  overdueFine,
  type LendingPolicy,
} from "./library-rules";

export {
  borrowingRefusal,
  DEFAULT_LENDING_POLICY,
  daysOverdue,
  dueDateFor,
  overdueFine,
  type LendingPolicy,
} from "./library-rules";

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

/** Out and not back. */
const OUT = { returnedAt: null };

/**
 * Issue a copy to a reader.
 *
 * Two rules are checked here for the sentence, and one is a **partial unique
 * index**: a copy already out cannot be lent again. The index is the thing that
 * holds when two librarians share a desk and a barcode scanner each — the check
 * below only decides which message they see.
 *
 * An unpaid fine blocks a loan. It is the only lever a school library has, and
 * a system that lends anyway is one where the fines are decoration.
 */
export async function issueLoan(input: {
  companyId: string;
  copyId: string;
  studentId: string;
  policy?: LendingPolicy;
  issuedById?: string | null;
  at?: Date;
}) {
  const policy = input.policy ?? DEFAULT_LENDING_POLICY;
  const at = input.at ?? new Date();

  const [copy, student] = await Promise.all([
    prisma.schoolBookCopy.findFirst({
      where: { id: input.copyId, companyId: input.companyId },
      select: {
        id: true,
        copyCode: true,
        isWithdrawn: true,
        book: { select: { id: true, title: true } },
      },
    }),
    prisma.schoolStudent.findFirst({
      where: { id: input.studentId, companyId: input.companyId },
      select: { id: true, firstName: true, lastName: true, status: true },
    }),
  ]);

  if (!copy) throw new LibraryError("That copy is not in this library");
  if (copy.isWithdrawn) throw new LibraryError(`${copy.copyCode} has been withdrawn`);
  if (!student) throw new LibraryError("Student not found");
  if (student.status !== "ACTIVE") {
    throw new LibraryError(
      `${student.firstName} ${student.lastName} is not an active student`,
    );
  }

  const openLoans = await prisma.schoolBookLoan.findMany({
    where: { companyId: input.companyId, studentId: student.id, ...OUT },
    select: { id: true },
  });
  const unpaid = await prisma.schoolBookLoan.aggregate({
    where: {
      companyId: input.companyId,
      studentId: student.id,
      fineAmount: { gt: 0 },
      finePaidAt: null,
    },
    _sum: { fineAmount: true },
  });

  const refusal = borrowingRefusal(
    {
      name: `${student.firstName} ${student.lastName}`,
      openLoans: openLoans.length,
      unpaidFines: Number(unpaid._sum.fineAmount ?? 0),
    },
    policy,
  );
  if (refusal) throw new LibraryError(refusal);

  try {
    return await prisma.schoolBookLoan.create({
      data: {
        companyId: input.companyId,
        copyId: copy.id,
        studentId: student.id,
        borrowedAt: at,
        dueAt: dueDateFor(at, policy),
        issuedById: input.issuedById ?? null,
      },
      select: { id: true, dueAt: true, copyId: true, studentId: true },
    });
  } catch (error) {
    // The index fired: somebody else scanned this copy between the check above
    // and this write.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new LibraryError(
        `${copy.book.title} (${copy.copyCode}) is already out — it was issued a moment ago`,
      );
    }
    throw error;
  }
}

/**
 * Take a book back, and work out what is owed.
 *
 * The fine is calculated and stored at return, not computed on read: a school
 * that changes its rate in March should not silently re-price every fine it
 * charged in February.
 *
 * Returning also satisfies the oldest open reservation for the title, which is
 * why reservations are held against the *book* and not a copy — a returned twin
 * satisfies a reader who wanted the book.
 */
export async function returnLoan(input: {
  companyId: string;
  loanId: string;
  policy?: LendingPolicy;
  returnedById?: string | null;
  at?: Date;
}) {
  const policy = input.policy ?? DEFAULT_LENDING_POLICY;
  const at = input.at ?? new Date();

  return prisma.$transaction(async (tx) => {
    const loan = await tx.schoolBookLoan.findFirst({
      where: { id: input.loanId, companyId: input.companyId },
      select: {
        id: true,
        dueAt: true,
        returnedAt: true,
        copy: { select: { id: true, bookId: true } },
      },
    });
    if (!loan) throw new LibraryError("Loan not found");
    if (loan.returnedAt) throw new LibraryError("That book is already back");

    const fine = overdueFine(loan.dueAt, at, policy);

    const returned = await tx.schoolBookLoan.update({
      where: { id: loan.id },
      data: {
        returnedAt: at,
        // Zero is stored as null: a fine of nothing is not a fine, and storing
        // it would put a zero-value line on somebody's fee account.
        fineAmount: fine > 0 ? fine : null,
        returnedById: input.returnedById ?? null,
      },
      select: { id: true, returnedAt: true, fineAmount: true },
    });

    const waiting = await tx.schoolBookReservation.findFirst({
      where: {
        companyId: input.companyId,
        bookId: loan.copy.bookId,
        closedAt: null,
        readyAt: null,
      },
      orderBy: { reservedAt: "asc" },
      select: { id: true },
    });
    if (waiting) {
      await tx.schoolBookReservation.update({
        where: { id: waiting.id },
        data: { readyAt: at },
      });
    }

    return {
      id: returned.id,
      fine: returned.fineAmount === null ? 0 : Number(returned.fineAmount),
      reservationReady: waiting?.id ?? null,
    };
  });
}

/**
 * Extend a loan.
 *
 * Refused when somebody is waiting for the title — a renewal that keeps a book
 * from a reader in the queue is how a library's reservation list becomes
 * meaningless — and refused past the school's renewal limit.
 */
export async function renewLoan(input: {
  companyId: string;
  loanId: string;
  policy?: LendingPolicy;
  at?: Date;
}) {
  const policy = input.policy ?? DEFAULT_LENDING_POLICY;
  const at = input.at ?? new Date();

  const loan = await prisma.schoolBookLoan.findFirst({
    where: { id: input.loanId, companyId: input.companyId },
    select: {
      id: true,
      renewals: true,
      returnedAt: true,
      copy: { select: { bookId: true } },
    },
  });
  if (!loan) throw new LibraryError("Loan not found");
  if (loan.returnedAt) throw new LibraryError("That book is already back");
  if (loan.renewals >= policy.renewalLimit) {
    throw new LibraryError(
      `This has been renewed ${loan.renewals} times — the limit is ${policy.renewalLimit}`,
    );
  }

  const waiting = await prisma.schoolBookReservation.count({
    where: { companyId: input.companyId, bookId: loan.copy.bookId, closedAt: null },
  });
  if (waiting > 0) {
    throw new LibraryError(
      `${waiting} ${waiting === 1 ? "reader is" : "readers are"} waiting for this title`,
    );
  }

  return prisma.schoolBookLoan.update({
    where: { id: loan.id },
    data: { dueAt: dueDateFor(at, policy), renewals: { increment: 1 } },
    select: { id: true, dueAt: true, renewals: true },
  });
}

/** Put a reader in the queue for a title. */
export async function reserveBook(input: {
  companyId: string;
  bookId: string;
  studentId: string;
}) {
  const existing = await prisma.schoolBookReservation.findFirst({
    where: {
      companyId: input.companyId,
      bookId: input.bookId,
      studentId: input.studentId,
      closedAt: null,
    },
    select: { id: true },
  });
  if (existing) throw new LibraryError("You are already in the queue for this title");

  return prisma.schoolBookReservation.create({
    data: {
      companyId: input.companyId,
      bookId: input.bookId,
      studentId: input.studentId,
    },
    select: { id: true, reservedAt: true },
  });
}

/**
 * What is out, and what is late.
 *
 * The overdue list is what a librarian opens on a Monday, so it leads and is
 * computed against today rather than stored — a loan becomes overdue by the
 * passage of time, not by anybody doing anything.
 */
export async function loanRegister(input: {
  companyId: string;
  studentId?: string;
  overdueOnly?: boolean;
  at?: Date;
}) {
  const at = input.at ?? new Date();

  const loans = await prisma.schoolBookLoan.findMany({
    where: {
      companyId: input.companyId,
      ...(input.studentId ? { studentId: input.studentId } : {}),
      ...OUT,
      ...(input.overdueOnly ? { dueAt: { lt: at } } : {}),
    },
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
    orderBy: { dueAt: "asc" },
    take: 500,
  });

  return loans.map((loan) => ({
    ...loan,
    isOverdue: loan.dueAt.getTime() < at.getTime(),
    // What it *would* cost if it came back today. Shown, not stored — the
    // stored figure is decided at return.
    fineIfReturnedToday: overdueFine(loan.dueAt, at),
  }));
}

/** What a reader owes, unpaid. */
export async function outstandingFines(input: {
  companyId: string;
  studentId: string;
}) {
  const loans = await prisma.schoolBookLoan.findMany({
    where: {
      companyId: input.companyId,
      studentId: input.studentId,
      fineAmount: { gt: 0 },
      finePaidAt: null,
    },
    select: {
      id: true,
      fineAmount: true,
      returnedAt: true,
      dueAt: true,
      copy: { select: { copyCode: true, book: { select: { title: true } } } },
    },
    orderBy: { returnedAt: "desc" },
  });

  return {
    total: loans.reduce((sum, loan) => sum + Number(loan.fineAmount ?? 0), 0),
    loans: loans.map((loan) => ({
      ...loan,
      fineAmount: Number(loan.fineAmount ?? 0),
    })),
  };
}
