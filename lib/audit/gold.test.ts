import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockFindFirst, mockCreate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformAuditEvent: {
      findFirst: mockFindFirst,
      create: mockCreate,
    },
  },
}))

import { writeGoldAuditEvent } from "./gold"

describe("writeGoldAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a PlatformAuditEvent with prevEventHash from the last event", async () => {
    const existingHash = "abc123existinghash"
    mockFindFirst.mockResolvedValue({ eventHash: existingHash })
    mockCreate.mockResolvedValue({ id: "evt-1" })

    await writeGoldAuditEvent({
      companyId: "company-1",
      actorId: "user-1",
      eventType: "gold.import.committed",
      entityType: "GoldLedgerImport",
      entityId: "import-1",
      payload: { rowsCreated: 10 },
    })

    expect(mockCreate).toHaveBeenCalledOnce()
    const created = mockCreate.mock.calls[0][0].data
    expect(created.companyId).toBe("company-1")
    expect(created.actor).toBe("user-1")
    expect(created.eventType).toBe("gold.import.committed")
    expect(created.entityType).toBe("GoldLedgerImport")
    expect(created.entityId).toBe("import-1")
    expect(created.prevEventHash).toBe(existingHash)
    expect(typeof created.eventHash).toBe("string")
    expect(created.eventHash.length).toBe(64)
  })

  it("sets prevEventHash to null when no prior event exists", async () => {
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: "evt-2" })

    await writeGoldAuditEvent({
      companyId: "company-2",
      actorId: "user-2",
      eventType: "gold.import.rolled-back",
    })

    const created = mockCreate.mock.calls[0][0].data
    expect(created.prevEventHash).toBeNull()
    expect(typeof created.eventHash).toBe("string")
    expect(created.eventHash.length).toBe(64)
  })

  it("produces distinct eventHash values for distinct calls", async () => {
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: "evt-3" })

    await writeGoldAuditEvent({ companyId: "c", actorId: "u", eventType: "gold.period.closed" })
    const hash1 = mockCreate.mock.calls[0][0].data.eventHash

    mockCreate.mockClear()
    await writeGoldAuditEvent({ companyId: "c", actorId: "u", eventType: "gold.period.closed" })
    const hash2 = mockCreate.mock.calls[0][0].data.eventHash

    expect(hash1).not.toBe(hash2)
  })

  it("silently catches and logs errors without throwing", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB down"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      writeGoldAuditEvent({ companyId: "c", actorId: "u", eventType: "gold.correction.created" }),
    ).resolves.toBeUndefined()

    consoleSpy.mockRestore()
  })
})
