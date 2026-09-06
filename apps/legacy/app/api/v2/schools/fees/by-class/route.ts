import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { resolveBaseCurrency, toNumberOrZero } from "@/lib/schools/money";

/**
 * What each year group owes — and, now, what it was billed, what it has paid,
 * how old the arrears are and who has owed the longest.
 *
 * S-4.6. The year group is a route in this module, not a filter, and a route has
 * to be worth choosing before you take it. For students the line under a year
 * group is a headcount; for fees a headcount is the one thing a bursar already
 * knows. What decides which form they open is **how much is outstanding and how
 * much of it is late**, so that is what this answers.
 *
 * Grouped through the pupil's current class rather than a column on the invoice.
 * The class belongs to the child (S-1.5 moves it at roll-up) and copying it onto
 * every invoice would give two answers the first time somebody moved up mid-year.
 * The cost is a join; the benefit is one truth.
 *
 * Raw SQL for the same reason `GET /api/v2/schools/fees` is: a school that bills
 * in two currencies has no meaningful single total, so each row is divided by the
 * rate stamped on that document — not today's — and `Prisma.aggregate` cannot
 * express the division. Everything below stays `numeric` in the database, so no
 * money passes through a float on the way out.
 *
 * The three extra questions are three queries rather than one clever one. A
 * collection rate is per year group, an ageing profile is per invoice and
 * "who has owed the longest" is per pupil; folding them together would mean a
 * grouping that answers none of them properly.
 */

type Row = {
  id: string;
  code: string;
  name: string;
  level: number | null;
  students: bigint;
  billed: Prisma.Decimal | null;
  collected: Prisma.Decimal | null;
  outstanding: Prisma.Decimal | null;
  overdue: Prisma.Decimal | null;
  owing: bigint;
  invoices: bigint;
};

type AgeingRow = {
  current: Prisma.Decimal | null;
  days1: Prisma.Decimal | null;
  days31: Prisma.Decimal | null;
  days61: Prisma.Decimal | null;
  days90: Prisma.Decimal | null;
  accounts: bigint;
};

type ArrearsRow = {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
  streamName: string | null;
  amount: Prisma.Decimal | null;
  days: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const [rows, ageingRows, arrears, currency] = await Promise.all([
      prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT
          c."id",
          c."code",
          c."name",
          c."level",
          COUNT(DISTINCT s."id") AS "students",
          -- A draft is the school talking to itself and a voided bill was
          -- withdrawn; neither was ever billed to anybody.
          COALESCE(SUM(
            CASE WHEN i."status" IN ('ISSUED', 'PART_PAID', 'PAID', 'WRITEOFF')
                 THEN ROUND(i."totalAmount" / i."exchangeRate", 2)
                 ELSE 0 END
          ), 0) AS "billed",
          COALESCE(SUM(
            CASE WHEN i."status" IN ('ISSUED', 'PART_PAID', 'PAID', 'WRITEOFF')
                 THEN ROUND(i."paidAmount" / i."exchangeRate", 2)
                 ELSE 0 END
          ), 0) AS "collected",
          COALESCE(SUM(
            CASE WHEN i."status" IN ('ISSUED', 'PART_PAID')
                 THEN ROUND(i."balanceAmount" / i."exchangeRate", 2)
                 ELSE 0 END
          ), 0) AS "outstanding",
          COALESCE(SUM(
            CASE WHEN i."status" IN ('ISSUED', 'PART_PAID')
                  AND i."dueDate" < NOW()
                  AND i."balanceAmount" > 0
                 THEN ROUND(i."balanceAmount" / i."exchangeRate", 2)
                 ELSE 0 END
          ), 0) AS "overdue",
          -- Families, not invoices: "9 owing" is a list of conversations to have,
          -- where "23 invoices" counts the paperwork behind them.
          COUNT(DISTINCT CASE
            WHEN i."status" IN ('ISSUED', 'PART_PAID') AND i."balanceAmount" > 0
            THEN i."studentId" END) AS "owing",
          COUNT(i."id") AS "invoices"
        FROM "SchoolClass" c
        LEFT JOIN "SchoolStudent" s
          ON s."currentClassId" = c."id" AND s."companyId" = c."companyId"
        LEFT JOIN "SchoolFeeInvoice" i
          ON i."studentId" = s."id" AND i."companyId" = c."companyId"
        WHERE c."companyId" = ${companyId}
        GROUP BY c."id", c."code", c."name", c."level"
        ORDER BY c."level" ASC NULLS LAST, c."code" ASC
      `),
      // The ageing profile, measured from each bill's own due date. "Current"
      // is money that is owed but not yet late, which is the bucket a bursar
      // must not confuse with the rest.
      prisma.$queryRaw<AgeingRow[]>(Prisma.sql`
        SELECT
          COALESCE(SUM(CASE WHEN i."dueDate" >= NOW()
            THEN ROUND(i."balanceAmount" / i."exchangeRate", 2) ELSE 0 END), 0) AS "current",
          COALESCE(SUM(CASE WHEN i."dueDate" < NOW()
              AND i."dueDate" >= NOW() - INTERVAL '30 days'
            THEN ROUND(i."balanceAmount" / i."exchangeRate", 2) ELSE 0 END), 0) AS "days1",
          COALESCE(SUM(CASE WHEN i."dueDate" < NOW() - INTERVAL '30 days'
              AND i."dueDate" >= NOW() - INTERVAL '60 days'
            THEN ROUND(i."balanceAmount" / i."exchangeRate", 2) ELSE 0 END), 0) AS "days31",
          COALESCE(SUM(CASE WHEN i."dueDate" < NOW() - INTERVAL '60 days'
              AND i."dueDate" >= NOW() - INTERVAL '90 days'
            THEN ROUND(i."balanceAmount" / i."exchangeRate", 2) ELSE 0 END), 0) AS "days61",
          COALESCE(SUM(CASE WHEN i."dueDate" < NOW() - INTERVAL '90 days'
            THEN ROUND(i."balanceAmount" / i."exchangeRate", 2) ELSE 0 END), 0) AS "days90",
          COUNT(DISTINCT CASE WHEN i."dueDate" < NOW() THEN i."studentId" END) AS "accounts"
        FROM "SchoolFeeInvoice" i
        WHERE i."companyId" = ${companyId}
          AND i."status" IN ('ISSUED', 'PART_PAID')
          AND i."balanceAmount" > 0
      `),
      // Who to ring first. Ordered by how long they have owed rather than by
      // how much: an old small debt is a conversation nobody has had.
      prisma.$queryRaw<ArrearsRow[]>(Prisma.sql`
        SELECT
          s."id",
          s."firstName",
          s."lastName",
          c."name" AS "className",
          st."name" AS "streamName",
          COALESCE(SUM(ROUND(i."balanceAmount" / i."exchangeRate", 2)), 0) AS "amount",
          MAX(DATE_PART('day', NOW() - i."dueDate"))::int AS "days"
        FROM "SchoolFeeInvoice" i
        JOIN "SchoolStudent" s ON s."id" = i."studentId"
        LEFT JOIN "SchoolClass" c ON c."id" = s."currentClassId"
        LEFT JOIN "SchoolStream" st ON st."id" = s."currentStreamId"
        WHERE i."companyId" = ${companyId}
          AND i."status" IN ('ISSUED', 'PART_PAID')
          AND i."balanceAmount" > 0
          AND i."dueDate" < NOW()
        GROUP BY s."id", s."firstName", s."lastName", c."name", st."name"
        ORDER BY "days" DESC
        LIMIT 8
      `),
      resolveBaseCurrency(companyId),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      level: row.level,
      // `COUNT` comes back as bigint, which `JSON.stringify` refuses outright —
      // a 500 on a working query.
      students: Number(row.students),
      billed: toNumberOrZero(row.billed ?? 0),
      collected: toNumberOrZero(row.collected ?? 0),
      outstanding: toNumberOrZero(row.outstanding ?? 0),
      overdue: toNumberOrZero(row.overdue ?? 0),
      owing: Number(row.owing),
      invoices: Number(row.invoices),
    }));

    const ageing = ageingRows[0];

    return successResponse({
      currency,
      data,
      totals: {
        billed: data.reduce((sum, row) => sum + row.billed, 0),
        collected: data.reduce((sum, row) => sum + row.collected, 0),
        outstanding: data.reduce((sum, row) => sum + row.outstanding, 0),
      },
      ageing: {
        current: toNumberOrZero(ageing?.current ?? 0),
        days1to30: toNumberOrZero(ageing?.days1 ?? 0),
        days31to60: toNumberOrZero(ageing?.days31 ?? 0),
        days61to90: toNumberOrZero(ageing?.days61 ?? 0),
        over90: toNumberOrZero(ageing?.days90 ?? 0),
        accounts: Number(ageing?.accounts ?? 0),
      },
      longestOverdue: arrears.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        className: row.className,
        streamName: row.streamName,
        amount: toNumberOrZero(row.amount ?? 0),
        daysOverdue: row.days ?? 0,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/fees/by-class error:", error);
    return errorResponse("Failed to fetch fees by year group");
  }
}
