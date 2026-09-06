-- The library: titles, copies, loans, reservations and overdue fines.
--
-- A title is not a copy. Three copies of the same book are one `SchoolBook` and
-- three `SchoolBookCopy` rows, because a loan is of the physical copy — the one
-- with the barcode — and a school that lends "the title" cannot say which of
-- them is missing.

CREATE TABLE "SchoolBook" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publisher" TEXT,
    "category" TEXT,
    "shelfMark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolBook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolBook_companyId_title_idx" ON "SchoolBook" ("companyId", "title");
CREATE INDEX "SchoolBook_companyId_isbn_idx" ON "SchoolBook" ("companyId", "isbn");

CREATE TABLE "SchoolBookCopy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "copyCode" TEXT NOT NULL,
    "condition" TEXT,
    "isWithdrawn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolBookCopy_pkey" PRIMARY KEY ("id")
);

-- The accession number is what is written on the spine, and two books with the
-- same one is a library that cannot be stock-checked.
CREATE UNIQUE INDEX "SchoolBookCopy_companyId_copyCode_key"
    ON "SchoolBookCopy" ("companyId", "copyCode");
CREATE INDEX "SchoolBookCopy_companyId_bookId_idx"
    ON "SchoolBookCopy" ("companyId", "bookId");

CREATE TABLE "SchoolBookLoan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "renewals" INTEGER NOT NULL DEFAULT 0,
    "fineAmount" DECIMAL(10,2),
    "finePaidAt" TIMESTAMP(3),
    "feeInvoiceId" TEXT,
    "issuedById" TEXT,
    "returnedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolBookLoan_pkey" PRIMARY KEY ("id")
);

-- One copy can be in one pair of hands. Partial, because the same copy is lent
-- again next week and last term's returned loans must not block it — the same
-- shape as the live-bed index in the boarding migration, and for the same
-- reason: a check in the handler cannot survive two librarians at one desk.
CREATE UNIQUE INDEX "SchoolBookLoan_live_copy_key"
    ON "SchoolBookLoan" ("copyId")
    WHERE "returnedAt" IS NULL;

CREATE INDEX "SchoolBookLoan_companyId_studentId_borrowedAt_idx"
    ON "SchoolBookLoan" ("companyId", "studentId", "borrowedAt");
CREATE INDEX "SchoolBookLoan_companyId_dueAt_idx"
    ON "SchoolBookLoan" ("companyId", "dueAt");
CREATE INDEX "SchoolBookLoan_companyId_returnedAt_idx"
    ON "SchoolBookLoan" ("companyId", "returnedAt");

-- Due before borrowed is a loan that is overdue the moment it is issued.
ALTER TABLE "SchoolBookLoan"
    ADD CONSTRAINT "SchoolBookLoan_dates_check" CHECK ("dueAt" >= "borrowedAt");

ALTER TABLE "SchoolBookLoan"
    ADD CONSTRAINT "SchoolBookLoan_renewals_check" CHECK ("renewals" >= 0);

ALTER TABLE "SchoolBookLoan"
    ADD CONSTRAINT "SchoolBookLoan_fine_check"
    CHECK ("fineAmount" IS NULL OR "fineAmount" >= 0);

-- A fine cannot be paid before it is charged, and a payment against no fine is
-- money the school cannot account for.
ALTER TABLE "SchoolBookLoan"
    ADD CONSTRAINT "SchoolBookLoan_fine_paid_check"
    CHECK ("finePaidAt" IS NULL OR "fineAmount" IS NOT NULL);

CREATE TABLE "SchoolBookReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolBookReservation_pkey" PRIMARY KEY ("id")
);

-- One open reservation per reader per title. Reserving the same book twice puts
-- one person in the queue twice.
CREATE UNIQUE INDEX "SchoolBookReservation_open_key"
    ON "SchoolBookReservation" ("companyId", "bookId", "studentId")
    WHERE "closedAt" IS NULL;

CREATE INDEX "SchoolBookReservation_companyId_bookId_reservedAt_idx"
    ON "SchoolBookReservation" ("companyId", "bookId", "reservedAt");
CREATE INDEX "SchoolBookReservation_companyId_studentId_idx"
    ON "SchoolBookReservation" ("companyId", "studentId");

ALTER TABLE "SchoolBook" ADD CONSTRAINT "SchoolBook_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolBookCopy" ADD CONSTRAINT "SchoolBookCopy_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolBookCopy" ADD CONSTRAINT "SchoolBookCopy_bookId_fkey"
    FOREIGN KEY ("bookId") REFERENCES "SchoolBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolBookLoan" ADD CONSTRAINT "SchoolBookLoan_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolBookLoan" ADD CONSTRAINT "SchoolBookLoan_copyId_fkey"
    FOREIGN KEY ("copyId") REFERENCES "SchoolBookCopy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolBookLoan" ADD CONSTRAINT "SchoolBookLoan_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolBookReservation" ADD CONSTRAINT "SchoolBookReservation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolBookReservation" ADD CONSTRAINT "SchoolBookReservation_bookId_fkey"
    FOREIGN KEY ("bookId") REFERENCES "SchoolBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolBookReservation" ADD CONSTRAINT "SchoolBookReservation_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
