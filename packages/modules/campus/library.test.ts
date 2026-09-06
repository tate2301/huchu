/**
 * The library: lending, returning, renewing, reserving and fines.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  borrowingRefusal,
  DEFAULT_LENDING_POLICY,
  daysOverdue,
  issueLoan,
  LibraryError,
  loanRegister,
  outstandingFines,
  overdueFine,
  renewLoan,
  reserveBook,
  returnLoan,
} from "./library";

let companyId: string;
let bookId: string;
let copyOneId: string;
let copyTwoId: string;
let readerId: string;
let otherReaderId: string;

function at(iso: string) {
  return new Date(`${iso}T10:00:00.000Z`);
}

let counter = 0;
async function makeReader() {
  counter += 1;
  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `L${String(counter).padStart(4, "0")}`,
      firstName: `Reader${counter}`,
      lastName: `Test${counter}`,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return student.id;
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Library Test ${stamp}`, slug: `library-test-${stamp}` },
  });
  companyId = company.id;
});

beforeEach(async () => {
  await prisma.schoolBookReservation.deleteMany({ where: { companyId } });
  await prisma.schoolBookLoan.deleteMany({ where: { companyId } });
  await prisma.schoolBookCopy.deleteMany({ where: { companyId } });
  await prisma.schoolBook.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });

  const book = await prisma.schoolBook.create({
    data: { companyId, title: "Things Fall Apart", author: "Chinua Achebe" },
    select: { id: true },
  });
  bookId = book.id;
  copyOneId = (
    await prisma.schoolBookCopy.create({
      data: { companyId, bookId, copyCode: "ACC-0001" },
    })
  ).id;
  copyTwoId = (
    await prisma.schoolBookCopy.create({
      data: { companyId, bookId, copyCode: "ACC-0002" },
    })
  ).id;

  readerId = await makeReader();
  otherReaderId = await makeReader();
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("fines", () => {
  it("charges nothing for a book back on time or early", () => {
    expect(overdueFine(at("2026-03-10"), at("2026-03-10"))).toBe(0);
    expect(overdueFine(at("2026-03-10"), at("2026-03-08"))).toBe(0);
  });

  it("charges by the whole day", () => {
    expect(daysOverdue(at("2026-03-10"), at("2026-03-13"))).toBe(3);
    expect(overdueFine(at("2026-03-10"), at("2026-03-13"))).toBe(0.15);
  });

  it("caps the fine, so a book forgotten over a holiday is not worth more than it cost", () => {
    expect(overdueFine(at("2026-01-01"), at("2026-12-01"))).toBe(
      DEFAULT_LENDING_POLICY.maxFine,
    );
  });
});

describe("borrowingRefusal", () => {
  it("stops a reader who owes money, and says how much", () => {
    // The only lever a school library has. A system that lends anyway is one
    // where the fines are decoration.
    expect(
      borrowingRefusal({ name: "R Chirwa", openLoans: 0, unpaidFines: 1.5 }),
    ).toContain("1.50");
  });

  it("stops a reader at the limit, with a different fix", () => {
    // Bring one back, versus pay what you owe. Different sentences because
    // they are different actions.
    expect(
      borrowingRefusal({ name: "R Chirwa", openLoans: 3, unpaidFines: 0 }),
    ).toContain("the limit is 3");
  });

  it("lets an ordinary reader through", () => {
    expect(
      borrowingRefusal({ name: "R Chirwa", openLoans: 1, unpaidFines: 0 }),
    ).toBeNull();
  });
});

describe("issueLoan", () => {
  it("lends a copy and sets the due date from the policy", async () => {
    const loan = await issueLoan({
      companyId,
      copyId: copyOneId,
      studentId: readerId,
      at: at("2026-03-01"),
    });
    expect(loan.dueAt).toEqual(at("2026-03-15"));
  });

  it("refuses a copy that is already out, with the title in the message", async () => {
    await issueLoan({ companyId, copyId: copyOneId, studentId: readerId });
    await expect(
      issueLoan({ companyId, copyId: copyOneId, studentId: otherReaderId }),
    ).rejects.toThrow(LibraryError);
  });

  it("refuses two live loans of one copy — MIGRATION WITNESS", async () => {
    // Past the service layer: the check exists for the message, the partial
    // index is what survives two librarians at one desk.
    // `borrowedAt` is set explicitly: it defaults to now, and a fixed `dueAt`
    // in the past trips the dates CHECK instead — which would make this pass
    // for the wrong reason and stop witnessing the index at all.
    const data = {
      companyId,
      copyId: copyOneId,
      borrowedAt: at("2026-03-01"),
      dueAt: at("2026-03-15"),
    };
    await prisma.schoolBookLoan.create({ data: { ...data, studentId: readerId } });
    await expect(
      prisma.schoolBookLoan.create({
        data: { ...data, studentId: otherReaderId },
      }),
      // Matched on the column Prisma names, not the index — Prisma 7 reports
      // "Unique constraint failed on the fields: (`copyId`)" and never the name.
    ).rejects.toThrow(/copyId/);
  });

  it("lends the same copy again once it is back", async () => {
    const first = await issueLoan({ companyId, copyId: copyOneId, studentId: readerId });
    await returnLoan({ companyId, loanId: first.id });
    const second = await issueLoan({
      companyId,
      copyId: copyOneId,
      studentId: otherReaderId,
    });
    expect(second.copyId).toBe(copyOneId);
  });

  it("refuses a withdrawn copy", async () => {
    await prisma.schoolBookCopy.update({
      where: { id: copyOneId },
      data: { isWithdrawn: true },
    });
    await expect(
      issueLoan({ companyId, copyId: copyOneId, studentId: readerId }),
    ).rejects.toThrow(/withdrawn/);
  });

  it("refuses a reader with an unpaid fine", async () => {
    const loan = await issueLoan({
      companyId,
      copyId: copyOneId,
      studentId: readerId,
      at: at("2026-01-01"),
    });
    await returnLoan({ companyId, loanId: loan.id, at: at("2026-02-01") });

    await expect(
      issueLoan({ companyId, copyId: copyTwoId, studentId: readerId }),
    ).rejects.toThrow(/owes/);
  });

  it("refuses a due date before the loan — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolBookLoan.create({
        data: {
          companyId,
          copyId: copyOneId,
          studentId: readerId,
          borrowedAt: at("2026-03-10"),
          dueAt: at("2026-03-01"),
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses a paid fine that was never charged — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolBookLoan.create({
        data: {
          companyId,
          copyId: copyOneId,
          studentId: readerId,
          borrowedAt: at("2026-03-01"),
          dueAt: at("2026-03-15"),
          finePaidAt: at("2026-03-20"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("returnLoan", () => {
  it("stores nothing rather than a zero fine for a book back on time", async () => {
    // A fine of nothing is not a fine, and storing it would put a zero-value
    // line on somebody's fee account.
    const loan = await issueLoan({
      companyId,
      copyId: copyOneId,
      studentId: readerId,
      at: at("2026-03-01"),
    });
    const returned = await returnLoan({
      companyId,
      loanId: loan.id,
      at: at("2026-03-10"),
    });
    expect(returned.fine).toBe(0);

    const row = await prisma.schoolBookLoan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(row.fineAmount).toBeNull();
  });

  it("charges for the days it was late", async () => {
    const loan = await issueLoan({
      companyId,
      copyId: copyOneId,
      studentId: readerId,
      at: at("2026-03-01"),
    });
    const returned = await returnLoan({
      companyId,
      loanId: loan.id,
      at: at("2026-03-25"),
    });
    expect(returned.fine).toBe(0.5);
  });

  it("refuses a second return", async () => {
    const loan = await issueLoan({ companyId, copyId: copyOneId, studentId: readerId });
    await returnLoan({ companyId, loanId: loan.id });
    await expect(returnLoan({ companyId, loanId: loan.id })).rejects.toThrow(
      /already back/,
    );
  });

  it("puts a returned copy aside for the reader at the front of the queue", async () => {
    // Reservations are against the title, so a returned twin satisfies a reader
    // who wanted the book.
    const loan = await issueLoan({ companyId, copyId: copyOneId, studentId: readerId });
    await reserveBook({ companyId, bookId, studentId: otherReaderId });

    const returned = await returnLoan({ companyId, loanId: loan.id });
    expect(returned.reservationReady).not.toBeNull();

    const reservation = await prisma.schoolBookReservation.findFirstOrThrow({
      where: { studentId: otherReaderId },
    });
    expect(reservation.readyAt).not.toBeNull();
  });
});

describe("renewLoan", () => {
  it("extends the due date and counts the renewal", async () => {
    const loan = await issueLoan({
      companyId,
      copyId: copyOneId,
      studentId: readerId,
      at: at("2026-03-01"),
    });
    const renewed = await renewLoan({
      companyId,
      loanId: loan.id,
      at: at("2026-03-14"),
    });
    expect(renewed.renewals).toBe(1);
    expect(renewed.dueAt).toEqual(at("2026-03-28"));
  });

  it("refuses past the renewal limit", async () => {
    const loan = await issueLoan({ companyId, copyId: copyOneId, studentId: readerId });
    await renewLoan({ companyId, loanId: loan.id });
    await renewLoan({ companyId, loanId: loan.id });
    await expect(renewLoan({ companyId, loanId: loan.id })).rejects.toThrow(
      /the limit is 2/,
    );
  });

  it("refuses while somebody is waiting for the title", async () => {
    // A renewal that keeps a book from a reader in the queue is how a
    // reservation list becomes meaningless.
    const loan = await issueLoan({ companyId, copyId: copyOneId, studentId: readerId });
    await reserveBook({ companyId, bookId, studentId: otherReaderId });
    await expect(renewLoan({ companyId, loanId: loan.id })).rejects.toThrow(
      /waiting for this title/,
    );
  });
});

describe("reserveBook", () => {
  it("refuses to put one reader in the queue twice", async () => {
    await reserveBook({ companyId, bookId, studentId: readerId });
    await expect(reserveBook({ companyId, bookId, studentId: readerId })).rejects.toThrow(
      /already in the queue/,
    );
  });

  it("refuses two open reservations for one reader and title — MIGRATION WITNESS", async () => {
    await prisma.schoolBookReservation.create({
      data: { companyId, bookId, studentId: readerId },
    });
    await expect(
      prisma.schoolBookReservation.create({
        data: { companyId, bookId, studentId: readerId },
      }),
    ).rejects.toThrow();
  });
});

describe("loanRegister", () => {
  it("narrows to what is late, and shows what it would cost today", async () => {
    await issueLoan({
      companyId,
      copyId: copyOneId,
      studentId: readerId,
      at: at("2026-03-01"),
    });
    await issueLoan({
      companyId,
      copyId: copyTwoId,
      studentId: otherReaderId,
      at: at("2026-03-20"),
    });

    const overdue = await loanRegister({
      companyId,
      overdueOnly: true,
      at: at("2026-03-20"),
    });
    expect(overdue).toHaveLength(1);
    expect(overdue[0].isOverdue).toBe(true);
    expect(overdue[0].fineIfReturnedToday).toBeGreaterThan(0);
  });
});

describe("outstandingFines", () => {
  it("adds up what a reader owes", async () => {
    const loan = await issueLoan({
      companyId,
      copyId: copyOneId,
      studentId: readerId,
      at: at("2026-03-01"),
    });
    await returnLoan({ companyId, loanId: loan.id, at: at("2026-03-25") });

    const owed = await outstandingFines({ companyId, studentId: readerId });
    expect(owed.total).toBe(0.5);
    expect(owed.loans).toHaveLength(1);
  });
});
