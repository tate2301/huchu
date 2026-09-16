/**
 * Migration witness for the fee posting outcome columns.
 *
 * `CONTRIBUTING.md` requires a P0 migration to ship with a witness in the same
 * commit, and this one is P0 for the reason the finding gives: a school could
 * take money, hand over a receipt and have no journal entry and no query that
 * would ever surface the receipt again. The fix is only worth anything if the
 * columns are really in the database, so this reads `information_schema`,
 * `pg_enum` and `pg_indexes` rather than the schema file. A green `prisma
 * generate` says what the client thinks; it is not evidence the database
 * changed.
 *
 * It asserts storage, not behaviour: the four columns exist on all four fee
 * documents with the right types and default, the enum carries exactly the
 * vocabulary the posting engine answers in, Postgres refuses a value outside
 * it, and the unposted query has an index to read.
 *
 * Nothing here creates a tenant or writes a row, so it is safe to run
 * alongside the DB-backed fee suites.
 *
 * Prerequisites: a real Postgres DATABASE_URL_TEST with the migrations applied.
 */

import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  listUnpostedSchoolFeeDocuments,
  recordSchoolFeePosting,
} from "@/lib/schools/fee-posting-status";

/** The four fee documents that post to the ledger. */
const POSTING_TABLES: string[] = [
  "SchoolFeeInvoice",
  "SchoolFeeReceipt",
  "SchoolFeeWaiver",
  "SchoolFeeRefund",
];

/** Column, expected `data_type`, expected nullability. */
const POSTING_COLUMNS: Array<[column: string, dataType: string, nullable: string]> = [
  ["accountingStatus", "USER-DEFINED", "NO"],
  ["journalEntryId", "text", "YES"],
  ["accountingPostedAt", "timestamp without time zone", "YES"],
  ["accountingError", "text", "YES"],
];

/**
 * The posting engine's own vocabulary, plus NOT_REQUIRED for the documents that
 * are not meant to post at all. Asserted as present rather than exact for the
 * same reason retail's enums are: Postgres refuses to drop a label a row holds.
 */
const POSTING_STATUS_LABELS = ["NOT_REQUIRED", "POSTED", "PENDING", "FAILED"];

type ColumnFacts = {
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
};

async function columnFacts(table: string, column: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  return rows[0] ?? null;
}

const CASES: Array<[table: string, column: string, dataType: string, nullable: string]> =
  POSTING_TABLES.flatMap((table) =>
    POSTING_COLUMNS.map(
      ([column, dataType, nullable]): [string, string, string, string] => [
        table,
        column,
        dataType,
        nullable,
      ],
    ),
  );

describe("every fee document that posts can say whether it posted", () => {
  it("checks all four documents", () => {
    // A silent zero here would make every assertion below vacuously true.
    expect(CASES.length).toBe(16);
  });

  it.each(CASES)('"%s"."%s" is %s', async (table, column, dataType, nullable) => {
    const facts = await columnFacts(table, column);
    expect(facts, `no such column "${table}"."${column}"`).not.toBeNull();
    expect(facts?.data_type).toBe(dataType);
    expect(facts?.is_nullable).toBe(nullable);
  });

  it.each(POSTING_TABLES)('"%s"."accountingStatus" is the posting enum, defaulting to NOT_REQUIRED', async (table) => {
    const facts = await columnFacts(table, "accountingStatus");
    expect(facts?.udt_name).toBe("SchoolFeePostingStatus");
    // Creating a document must raise no alarm. The route moves the row to
    // PENDING in the transaction that moves the money; a default of PENDING
    // here would put every draft invoice on the unposted list.
    expect(facts?.column_default).toContain("NOT_REQUIRED");
  });

  it("SchoolFeePostingStatus carries the vocabulary the posting engine answers in", async () => {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'SchoolFeePostingStatus'
      ORDER BY e.enumsortorder
    `;
    const found = rows.map((row) => row.enumlabel);
    expect(found.length, "type SchoolFeePostingStatus does not exist").toBeGreaterThan(0);
    for (const label of POSTING_STATUS_LABELS) {
      expect(found, `SchoolFeePostingStatus is missing ${label}`).toContain(label);
    }
  });

  it("refuses a posting status outside the enum", async () => {
    // The point of an enum rather than a String column: a handler writing
    // "UNPOSTED" or "pending" would otherwise be stored and then silently
    // filtered out of every list, which is how this class of bug arrives.
    await expect(
      prisma.$queryRawUnsafe(`SELECT 'UNPOSTED'::"SchoolFeePostingStatus"`),
    ).rejects.toThrow();
  });
});

describe("the unposted query has an index to read", () => {
  it.each(POSTING_TABLES)('"%s" is indexed by companyId and accountingStatus', async (table) => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = ${table} AND indexname = ${`${table}_companyId_accountingStatus_idx`}
    `;
    expect(rows.length, `no unposted index on "${table}"`).toBe(1);
    expect(rows[0].indexdef).toContain("companyId");
    expect(rows[0].indexdef).toContain("accountingStatus");
  });
});

/**
 * The service against the real schema, without a tenant.
 *
 * A company id that matches nothing is enough to prove the queries name columns
 * that exist — the failure this catches is a `select` naming a field the
 * migration did not add, which no amount of mocking would show.
 */
describe("the unposted service reads and writes the columns the migration added", () => {
  const NO_SUCH_COMPANY = "00000000-0000-0000-0000-000000000000";

  it("returns nothing for a company with no fee documents", async () => {
    const rows = await listUnpostedSchoolFeeDocuments({ companyId: NO_SUCH_COMPANY });
    expect(rows).toEqual([]);
  });

  it("does not throw when the document it was asked to annotate is gone", async () => {
    // It runs after the money has committed, so throwing here would report a
    // receipt as failed while the school is holding the cash.
    await expect(
      recordSchoolFeePosting({
        companyId: NO_SUCH_COMPANY,
        document: "RECEIPT",
        documentId: "00000000-0000-0000-0000-000000000001",
        outcome: {
          accountingStatus: "FAILED",
          journalEntryId: null,
          accountingError: "No posting rule matched",
        },
      }),
    ).resolves.toBeUndefined();
  });
});
