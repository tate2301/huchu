// MIGRATION WITNESS: fails on current schema (GoldCompanyConfig table missing),
// passes after migration 20260510500001_add_gold_company_config_and_purchase_attachments
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getGoldConfig } from "@/lib/gold/config"
import { factories } from "@/lib/gold/test-factories"

let companyId: string

beforeAll(async () => {
  await prisma.$connect()
  const co = await prisma.company.create({ data: factories.company() })
  companyId = co.id
})

afterAll(async () => {
  await prisma.goldCompanyConfig.deleteMany({ where: { companyId } })
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.$disconnect()
})

describe("getGoldConfig", () => {
  it("returns defaults for a new company", async () => {
    const cfg = await getGoldConfig(prisma, companyId)
    expect(cfg.companyId).toBe(companyId)
    expect(cfg.defaultSplitMode).toBe("DEFAULT_50_50")
    expect(cfg.defaultPayCycleWeeks).toBe(2)
    expect(cfg.defaultStorageLocation).toBe("Vault A")
    expect(Number(cfg.defaultEstimatedPurity)).toBeCloseTo(92.5)
    expect(cfg.liveSpotPriceEnabled).toBe(false)
    expect(cfg.liveSpotPriceProvider).toBeNull()
    expect(cfg.importCommitCoSignThresholdRows).toBe(100)
    expect(Number(cfg.importCommitCoSignThresholdUsd)).toBeCloseTo(10000)
  })

  it("is idempotent — second call returns same row without error", async () => {
    const first = await getGoldConfig(prisma, companyId)
    const second = await getGoldConfig(prisma, companyId)
    expect(second.companyId).toBe(first.companyId)
    expect(second.createdAt).toEqual(first.createdAt)
  })

  it("persists manual updates", async () => {
    await prisma.goldCompanyConfig.update({
      where: { companyId },
      data: { defaultStorageLocation: "Vault B", defaultPayCycleWeeks: 4 },
    })
    const cfg = await getGoldConfig(prisma, companyId)
    expect(cfg.defaultStorageLocation).toBe("Vault B")
    expect(cfg.defaultPayCycleWeeks).toBe(4)
  })

  it("cascade delete: deleting company removes its config", async () => {
    const orphanCo = await prisma.company.create({ data: factories.company() })
    await getGoldConfig(prisma, orphanCo.id)
    await prisma.company.delete({ where: { id: orphanCo.id } })
    const cfg = await prisma.goldCompanyConfig.findUnique({ where: { companyId: orphanCo.id } })
    expect(cfg).toBeNull()
  })
})
