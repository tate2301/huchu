// MIGRATION WITNESS: fails on schema before 20260510400001_add_import_workflow_data_model,
// passes after this migration.
//
// Must run against a real Postgres connection — no mocks.

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { factories } from "@/lib/gold/test-factories"
import type { GoldLedgerImportStatus, GoldLedgerEntryStatus, UserRole } from "@prisma/client"

let companyId: string
let userId: string
let importId: string

beforeAll(async () => {
  await prisma.$connect()

  const co = await prisma.company.create({ data: factories.company() })
  companyId = co.id

  const ud = factories.user(companyId, "MANAGER")
  const u = await prisma.user.create({ data: { ...ud, role: ud.role as UserRole } })
  userId = u.id

  const si = await prisma.site.create({ data: factories.site(companyId) })

  const impData = factories.goldLedgerImport(companyId)
  const imp = await prisma.goldLedgerImport.create({
    data: {
      ...impData,
      status: impData.status as GoldLedgerImportStatus,
      uploadedById: userId,
      siteId: si.id,
    },
  })
  importId = imp.id
})

afterAll(async () => {
  await prisma.goldImportSnapshot.deleteMany({ where: { importId } })
  await prisma.goldLedgerImportComment.deleteMany({ where: { importId } })
  await prisma.goldLedgerImportTag.deleteMany({ where: { importId } })
  await prisma.goldPeriodClose.deleteMany({ where: { companyId } })
  await prisma.goldLedgerImport.deleteMany({ where: { companyId } })
  await prisma.goldLedgerImportPreset.deleteMany({ where: { companyId } })
  await prisma.site.deleteMany({ where: { companyId } })
  await prisma.user.deleteMany({ where: { companyId } })
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.$disconnect()
})

describe("GoldLedgerImportPreset", () => {
  it("creates a preset and enforces @@unique([companyId, name])", async () => {
    const preset = await prisma.goldLedgerImportPreset.create({
      data: {
        companyId,
        name: "Mine Alpha — weekly v3",
        mappingJson: JSON.stringify({ date: "Date", grams: "Total(g)" }),
        createdById: userId,
      },
    })
    expect(preset.id).toBeTruthy()
    expect(preset.isDefault).toBe(false)

    await expect(
      prisma.goldLedgerImportPreset.create({
        data: {
          companyId,
          name: "Mine Alpha — weekly v3",
          mappingJson: "{}",
          createdById: userId,
        },
      }),
    ).rejects.toThrow()
  })
})

describe("GoldLedgerImportTag", () => {
  it("creates a tag on an import", async () => {
    const tag = await prisma.goldLedgerImportTag.create({
      data: { importId, label: "weekly-catchup" },
    })
    expect(tag.importId).toBe(importId)
    expect(tag.label).toBe("weekly-catchup")
  })

  it("enforces @@unique([importId, label])", async () => {
    await expect(
      prisma.goldLedgerImportTag.create({ data: { importId, label: "weekly-catchup" } }),
    ).rejects.toThrow()
  })

  it("cascade-deletes tags when import is deleted", async () => {
    const ud = factories.user(companyId)
    const tempUser = await prisma.user.create({ data: { ...ud, role: ud.role as UserRole } })
    const tempImpData = factories.goldLedgerImport(companyId)
    const tempImport = await prisma.goldLedgerImport.create({
      data: { ...tempImpData, status: tempImpData.status as GoldLedgerImportStatus, uploadedById: tempUser.id },
    })
    await prisma.goldLedgerImportTag.create({ data: { importId: tempImport.id, label: "seed" } })

    await prisma.goldLedgerImport.delete({ where: { id: tempImport.id } })

    const tags = await prisma.goldLedgerImportTag.findMany({ where: { importId: tempImport.id } })
    expect(tags).toHaveLength(0)
  })
})

describe("GoldLedgerImportComment", () => {
  it("creates a header comment (no ledgerEntryId)", async () => {
    const comment = await prisma.goldLedgerImportComment.create({
      data: { importId, body: "Looks good overall", createdById: userId },
    })
    expect(comment.ledgerEntryId).toBeNull()
    expect(comment.body).toBe("Looks good overall")
  })

  it("creates a row comment attached to a ledger entry", async () => {
    const entryData = factories.goldLedgerEntry(importId, 99)
    const entry = await prisma.goldLedgerEntry.create({
      data: { ...entryData, status: entryData.status as GoldLedgerEntryStatus, lineNo: 99 },
    })
    const comment = await prisma.goldLedgerImportComment.create({
      data: {
        importId,
        ledgerEntryId: entry.id,
        body: "Check this row",
        createdById: userId,
      },
    })
    expect(comment.ledgerEntryId).toBe(entry.id)
  })
})

describe("GoldImportSnapshot", () => {
  it("creates a pre-rollback snapshot", async () => {
    const snap = await prisma.goldImportSnapshot.create({
      data: {
        importId,
        reason: "pre-rollback",
        payloadJson: JSON.stringify({ rows: 5 }),
        takenById: userId,
      },
    })
    expect(snap.importId).toBe(importId)
    expect(snap.reason).toBe("pre-rollback")
  })
})

describe("GoldPeriodClose", () => {
  it("creates a period close and enforces @@unique([companyId, siteId, periodStart])", async () => {
    const periodStart = new Date("2026-01-01T00:00:00.000Z")
    const periodEnd = new Date("2026-02-01T00:00:00.000Z")

    const si = await prisma.site.create({ data: factories.site(companyId) })

    const close = await prisma.goldPeriodClose.create({
      data: { companyId, siteId: si.id, periodStart, periodEnd, closedById: userId },
    })
    expect(close.companyId).toBe(companyId)
    expect(close.siteId).toBe(si.id)

    // Second record with same (companyId, siteId, periodStart) must be rejected
    await expect(
      prisma.goldPeriodClose.create({
        data: { companyId, siteId: si.id, periodStart, periodEnd, closedById: userId },
      }),
    ).rejects.toThrow()
  })
})

describe("GoldLedgerImport — archivedAt", () => {
  it("sets archivedAt without breaking the join to entries", async () => {
    await prisma.goldLedgerImport.update({
      where: { id: importId },
      data: { archivedAt: new Date() },
    })
    const imp = await prisma.goldLedgerImport.findUnique({
      where: { id: importId },
      include: { entries: true },
    })
    expect(imp).not.toBeNull()
    expect(imp!.archivedAt).toBeInstanceOf(Date)
  })
})
