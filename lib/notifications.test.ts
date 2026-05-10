import { describe, it, expect, vi, beforeEach } from "vitest"
import { NotificationSeverity } from "@prisma/client"

const { mockUserFindMany, mockNotificationCreate, mockNotificationRecipientCreateMany, mockUserFindManyPreferences } =
  vi.hoisted(() => ({
    mockUserFindMany: vi.fn(),
    mockNotificationCreate: vi.fn(),
    mockNotificationRecipientCreateMany: vi.fn(),
    mockUserFindManyPreferences: vi.fn(),
  }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
    },
    notification: {
      create: mockNotificationCreate,
    },
    notificationRecipient: {
      createMany: mockNotificationRecipientCreateMany,
    },
    userNotificationPreference: {
      findMany: mockUserFindManyPreferences,
    },
  },
}))

import {
  emitGoldExceptionNotification,
  emitGoldImportFailedNotification,
  emitGoldDispatchReceiptedNotification,
} from "./notifications"

const MANAGER_IDS = ["mgr-1", "mgr-2"]

function setupManagers() {
  mockUserFindMany.mockImplementation(({ where }: { where: { role?: unknown; id?: { in: string[] } } }) => {
    if (where.role) {
      return Promise.resolve(MANAGER_IDS.map((id) => ({ id, isActive: true })))
    }
    if (where.id) {
      return Promise.resolve((where.id.in ?? []).map((id: string) => ({ id })))
    }
    return Promise.resolve([])
  })
  mockUserFindManyPreferences.mockResolvedValue([])
  mockNotificationCreate.mockResolvedValue({ id: "notif-1" })
  mockNotificationRecipientCreateMany.mockResolvedValue({ count: 2 })
}

describe("emitGoldExceptionNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupManagers()
  })

  it("does not notify for non-CRITICAL severity", async () => {
    await emitGoldExceptionNotification({
      companyId: "co-1",
      exceptionId: "exc-1",
      category: "NAME_UNMAPPED",
      severity: "WARN",
    })
    expect(mockNotificationCreate).not.toHaveBeenCalled()
  })

  it("creates CRITICAL notification targeting managers", async () => {
    await emitGoldExceptionNotification({
      companyId: "co-1",
      exceptionId: "exc-2",
      category: "IMPORT_FAILURE",
      severity: "CRITICAL",
      entityType: "GoldPour",
      entityId: "pour-1",
    })
    expect(mockNotificationCreate).toHaveBeenCalledOnce()
    const data = mockNotificationCreate.mock.calls[0][0].data
    expect(data.severity).toBe(NotificationSeverity.CRITICAL)
    expect(data.entityId).toBe("exc-2")
  })
})

describe("emitGoldImportFailedNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupManagers()
  })

  it("creates a WARNING notification", async () => {
    await emitGoldImportFailedNotification({
      companyId: "co-1",
      importId: "imp-1",
      rowsFailed: 3,
      uploaderId: "uploader-99",
    })
    expect(mockNotificationCreate).toHaveBeenCalledOnce()
    const data = mockNotificationCreate.mock.calls[0][0].data
    expect(data.severity).toBe(NotificationSeverity.WARNING)
    expect(data.entityId).toBe("imp-1")
  })
})

describe("emitGoldDispatchReceiptedNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupManagers()
  })

  it("creates an INFO notification for dispatch receipted", async () => {
    await emitGoldDispatchReceiptedNotification({
      companyId: "co-1",
      dispatchId: "dispatch-1",
      receiptId: "receipt-1",
      handedOverById: "mgr-1",
    })
    expect(mockNotificationCreate).toHaveBeenCalledOnce()
    const data = mockNotificationCreate.mock.calls[0][0].data
    expect(data.severity).toBe(NotificationSeverity.INFO)
    expect(data.entityId).toBe("dispatch-1")
  })
})
