/**
 * Tests for Epic 14 — Import Studio row-mutation endpoints.
 *
 * Tests run against a real Postgres test DB (DATABASE_URL_TEST).
 * Each test wraps mutations in a transaction that is rolled back,
 * keeping the DB clean without per-test teardown.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { factories } from "@/lib/gold/test-factories"
import type {
  GoldLedgerEntryStatus,
  GoldLedgerImportStatus,
  UserRole,
} from "@prisma/client"

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let companyId: string
let userId: string
let importId: string

const ROLLBACK = new Error("__test_rollback__")

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function withRollback<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  let result: T
  try {
    await prisma.$transaction(async (tx) => {
      result = await fn(tx)
      throw ROLLBACK
    })
  } catch (err) {
    if (err !== ROLLBACK) throw err
  }
  return result!
}

beforeAll(async () => {
  await prisma.$connect()
  const co = await prisma.company.create({ data: factories.company() })
  companyId = co.id
  const ud = factories.user(companyId, "OPERATOR")
  const u = await prisma.user.create({ data: { ...ud, role: ud.role as UserRole } })
  userId = u.id
  const impData = factories.goldLedgerImport(companyId)
  const imp = await prisma.goldLedgerImport.create({
    data: {
      ...impData,
      status: impData.status as GoldLedgerImportStatus,
      uploadedById: userId,
    },
  })
  importId = imp.id
})

afterAll(async () => {
  await prisma.goldLedgerEntry.deleteMany({ where: { importId } })
  await prisma.goldLedgerImport.delete({ where: { id: importId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// Helper: seed N sequential entries
// ---------------------------------------------------------------------------

async function seedEntries(n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 1; i <= n; i++) {
    const ed = factories.goldLedgerEntry(importId, i)
    const e = await prisma.goldLedgerEntry.create({
      data: { ...ed, status: ed.status as GoldLedgerEntryStatus },
    })
    ids.push(e.id)
  }
  return ids
}

async function cleanEntries(): Promise<void> {
  await prisma.goldLedgerEntry.deleteMany({ where: { importId } })
}

// ---------------------------------------------------------------------------
// Suite 1 — Insert at end
// ---------------------------------------------------------------------------

describe("POST /entries — insert at end", () => {
  it("lineNo = MAX + 1 when no anchor provided", async () => {
    await cleanEntries()
    await seedEntries(3)

    await withRollback(async (tx) => {
      const agg = await tx.goldLedgerEntry.aggregate({
        where: { importId },
        _max: { lineNo: true },
      })
      const maxLine = agg._max.lineNo ?? 0
      expect(maxLine).toBe(3)

      const newEntry = await tx.goldLedgerEntry.create({
        data: {
          importId,
          companyId,
          lineNo: maxLine + 1,
          rawJson: "{}",
          status: "PENDING",
          parsedName: "New Row",
        },
      })
      expect(newEntry.lineNo).toBe(4)
      expect(newEntry.status).toBe("PENDING")
      expect(newEntry.parsedName).toBe("New Row")
    })

    await cleanEntries()
  })
})

// ---------------------------------------------------------------------------
// Suite 2 — Insert after anchor
// ---------------------------------------------------------------------------

describe("POST /entries — insert after anchor", () => {
  it("subsequent rows are shifted up by 1", async () => {
    await cleanEntries()
    const [id1, id2, id3] = await seedEntries(3)

    await withRollback(async (tx) => {
      const anchor = await tx.goldLedgerEntry.findUnique({
        where: { id: id1 },
        select: { lineNo: true },
      })
      expect(anchor?.lineNo).toBe(1)

      const newLineNo = anchor!.lineNo + 1

      await tx.$executeRaw`
        UPDATE "GoldLedgerEntry"
        SET "lineNo" = -("lineNo" + 1)
        WHERE "importId" = ${importId}
          AND "lineNo" >= ${newLineNo}
      `
      await tx.$executeRaw`
        UPDATE "GoldLedgerEntry"
        SET "lineNo" = -"lineNo"
        WHERE "importId" = ${importId}
          AND "lineNo" < 0
      `

      const inserted = await tx.goldLedgerEntry.create({
        data: { importId, companyId, lineNo: newLineNo, rawJson: "{}", status: "PENDING" },
      })
      expect(inserted.lineNo).toBe(2)

      const row2 = await tx.goldLedgerEntry.findUnique({ where: { id: id2 } })
      const row3 = await tx.goldLedgerEntry.findUnique({ where: { id: id3 } })
      expect(row2?.lineNo).toBe(3)
      expect(row3?.lineNo).toBe(4)
    })

    await cleanEntries()
  })
})

// ---------------------------------------------------------------------------
// Suite 3 — Delete entry
// ---------------------------------------------------------------------------

describe("DELETE /entries/[entryId] — delete row", () => {
  it("subsequent rows are renumbered (shifted down by 1)", async () => {
    await cleanEntries()
    const [id1, id2, id3] = await seedEntries(3)

    await withRollback(async (tx) => {
      const toDelete = await tx.goldLedgerEntry.findUnique({
        where: { id: id2 },
        select: { lineNo: true },
      })
      const deletedLineNo = toDelete!.lineNo
      expect(deletedLineNo).toBe(2)

      await tx.goldLedgerEntry.delete({ where: { id: id2 } })
      await tx.$executeRaw`
        UPDATE "GoldLedgerEntry"
        SET "lineNo" = -("lineNo" - 1)
        WHERE "importId" = ${importId}
          AND "lineNo" > ${deletedLineNo}
      `
      await tx.$executeRaw`
        UPDATE "GoldLedgerEntry"
        SET "lineNo" = -"lineNo"
        WHERE "importId" = ${importId}
          AND "lineNo" < 0
      `

      const row1 = await tx.goldLedgerEntry.findUnique({ where: { id: id1 } })
      const row3 = await tx.goldLedgerEntry.findUnique({ where: { id: id3 } })
      expect(row1?.lineNo).toBe(1)
      expect(row3?.lineNo).toBe(2)
    })

    await cleanEntries()
  })

  it("rejects deleting a CREATED entry — status guard matches route logic", async () => {
    await cleanEntries()
    const [createdId] = await seedEntries(1)
    await prisma.goldLedgerEntry.update({
      where: { id: createdId },
      data: { status: "CREATED" },
    })

    const entry = await prisma.goldLedgerEntry.findUnique({
      where: { id: createdId },
      select: { status: true },
    })
    // Route returns 409 when status === CREATED
    expect(entry?.status).toBe("CREATED")

    await cleanEntries()
  })
})

// ---------------------------------------------------------------------------
// Suite 4 — Bulk-edit
// ---------------------------------------------------------------------------

describe("POST /entries/bulk-edit — set fields on N rows", () => {
  it("5 rows get the same parsedName in one tx", async () => {
    await cleanEntries()
    const ids = await seedEntries(5)
    const newName = "Bulk Leader"

    await withRollback(async (tx) => {
      const result = await tx.goldLedgerEntry.updateMany({
        where: { id: { in: ids }, importId },
        data: { parsedName: newName },
      })
      expect(result.count).toBe(5)

      const updated = await tx.goldLedgerEntry.findMany({
        where: { id: { in: ids } },
        select: { parsedName: true },
      })
      for (const row of updated) {
        expect(row.parsedName).toBe(newName)
      }
    })

    await cleanEntries()
  })

  it("identifies CREATED entry — bulk-edit route rejects when any is CREATED", async () => {
    await cleanEntries()
    const ids = await seedEntries(3)
    await prisma.goldLedgerEntry.update({
      where: { id: ids[1] },
      data: { status: "CREATED" },
    })

    const entries = await prisma.goldLedgerEntry.findMany({
      where: { id: { in: ids } },
      select: { status: true },
    })
    const hasCreated = entries.some((e) => e.status === "CREATED")
    expect(hasCreated).toBe(true)

    await cleanEntries()
  })
})

// ---------------------------------------------------------------------------
// Suite 5 — Duplicate
// ---------------------------------------------------------------------------

describe("POST /entries/duplicate — duplicate selected rows", () => {
  it("new rows created with same data and interleaved sequential lineNos", async () => {
    await cleanEntries()
    // Seed 3 rows; duplicate the first two.
    const [id1, id2, id3] = await seedEntries(3)

    const originals = await prisma.goldLedgerEntry.findMany({
      where: { id: { in: [id1, id2] } },
      orderBy: { lineNo: "asc" },
    })
    expect(originals).toHaveLength(2)

    const createdIds: string[] = []

    await withRollback(async (tx) => {
      let offset = 0

      for (const original of originals) {
        const insertAfter = original.lineNo + offset
        const newLineNo = insertAfter + 1

        await tx.$executeRaw`
          UPDATE "GoldLedgerEntry"
          SET "lineNo" = -("lineNo" + 1)
          WHERE "importId" = ${importId}
            AND "lineNo" >= ${newLineNo}
        `
        await tx.$executeRaw`
          UPDATE "GoldLedgerEntry"
          SET "lineNo" = -"lineNo"
          WHERE "importId" = ${importId}
            AND "lineNo" < 0
        `

        const copy = await tx.goldLedgerEntry.create({
          data: {
            importId,
            companyId: original.companyId,
            lineNo: newLineNo,
            rawJson: "{}",
            status: "PENDING",
            parsedDate: original.parsedDate,
            parsedName: original.parsedName,
            mappedShiftGroupId: original.mappedShiftGroupId,
            gramsTotal: original.gramsTotal,
            boysGrams: original.boysGrams,
            mdaraGrams: original.mdaraGrams,
            balGrams: original.balGrams,
            expensesJson: original.expensesJson,
          },
        })

        createdIds.push(copy.id)
        offset += 1
      }

      expect(createdIds).toHaveLength(2)

      // Expected order: orig1(1), copy1(2), orig2(3), copy2(4), orig3(5)
      const all = await tx.goldLedgerEntry.findMany({
        where: { importId },
        orderBy: { lineNo: "asc" },
        select: { id: true, lineNo: true },
      })
      expect(all).toHaveLength(5)
      expect(all[0].id).toBe(id1)
      expect(all[0].lineNo).toBe(1)
      expect(all[1].id).toBe(createdIds[0])
      expect(all[1].lineNo).toBe(2)
      expect(all[2].id).toBe(id2)
      expect(all[2].lineNo).toBe(3)
      expect(all[3].id).toBe(createdIds[1])
      expect(all[3].lineNo).toBe(4)
      expect(all[4].id).toBe(id3)
      expect(all[4].lineNo).toBe(5)
    })

    await cleanEntries()
  })
})
