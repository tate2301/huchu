import type { Prisma, PrismaClient } from "@prisma/client"

type Db = PrismaClient | Prisma.TransactionClient

type LedgerEntry = {
  id: string
  goldShiftAllocationId: string | null
  goldPourId: string | null
  buyerReceiptId: string | null
  parserWarning: string | null
}

/**
 * Wipes everything an import produced — allocations, auto/bare pours,
 * receipts, inventory events, accounting events, exceptions, attendance
 * for those shifts, and the shift reports. Used by:
 *   - POST /api/gold/imports/[id]/commit (recommit cleanup)
 *   - POST /api/gold/imports/[id]/rollback (back out a committed import)
 *   - POST /api/gold/imports/[id]/reset-failed (only failed rows)
 *
 * The caller decides what to do with the entries afterwards (reset to
 * PENDING, reset only failed, etc.).
 */
export async function purgeImportArtifacts(
  tx: Prisma.TransactionClient,
  input: {
    importId: string
    /** Restrict to a subset of entries (e.g. only FAILED rows). Default: all. */
    entries?: LedgerEntry[]
    /** Default: read all entries from DB. */
    fetchAllEntries?: boolean
  },
): Promise<{
  removedAllocations: number
  removedPours: number
  removedReceipts: number
  removedShiftReports: number
}> {
  const entries =
    input.entries ??
    ((await tx.goldLedgerEntry.findMany({
      where: { importId: input.importId },
      select: {
        id: true,
        goldShiftAllocationId: true,
        goldPourId: true,
        buyerReceiptId: true,
        parserWarning: true,
      },
    })) as LedgerEntry[])

  const priorAllocationIds = entries
    .filter((e) => !!e.goldShiftAllocationId)
    .map((e) => e.goldShiftAllocationId!)
  const priorPourIdsFromEntries = entries
    .filter((e) => !!e.goldPourId)
    .map((e) => e.goldPourId!)
  const priorReceiptIds = entries
    .filter((e) => !!e.buyerReceiptId)
    .map((e) => e.buyerReceiptId!)
  const allEntryIds = entries.map((e) => e.id)

  if (
    priorAllocationIds.length === 0 &&
    priorPourIdsFromEntries.length === 0 &&
    priorReceiptIds.length === 0
  ) {
    return {
      removedAllocations: 0,
      removedPours: 0,
      removedReceipts: 0,
      removedShiftReports: 0,
    }
  }

  // Allocation-linked auto-pours.
  const allocationPours = await tx.goldPour.findMany({
    where: { goldShiftAllocationId: { in: priorAllocationIds } },
    select: { id: true },
  })
  const allPourIds = Array.from(
    new Set([
      ...priorPourIdsFromEntries,
      ...allocationPours.map((p) => p.id),
    ]),
  )

  // Receipts touching those pours (FIFO sales might link to pours not
  // directly referenced by an entry).
  const relatedReceipts = await tx.buyerReceipt.findMany({
    where: { goldPourId: { in: allPourIds } },
    select: { id: true },
  })
  const allReceiptIds = Array.from(
    new Set([...priorReceiptIds, ...relatedReceipts.map((r) => r.id)]),
  )

  const allocationExpenses = await tx.goldShiftExpense.findMany({
    where: { allocationId: { in: priorAllocationIds } },
    select: { id: true },
  })
  const expenseIds = allocationExpenses.map((e) => e.id)

  const allocationRows = await tx.goldShiftAllocation.findMany({
    where: { id: { in: priorAllocationIds } },
    select: {
      id: true,
      shiftReportId: true,
      siteId: true,
      date: true,
      shift: true,
    },
  })
  const shiftReportIds = allocationRows.map((a) => a.shiftReportId)

  // Order: child rows first, parents last.
  await tx.goldInventoryEvent.deleteMany({
    where: {
      OR: [
        { sourceType: "POUR", sourceId: { in: allPourIds } },
        { sourceType: "RECEIPT", sourceId: { in: allReceiptIds } },
        {
          sourceType: "SHIFT_ALLOCATION",
          sourceId: { in: priorAllocationIds },
        },
      ],
    },
  })

  const accountingSourceIds = [
    ...priorAllocationIds,
    ...allPourIds,
    ...allReceiptIds,
    ...expenseIds,
  ]
  if (accountingSourceIds.length > 0) {
    await tx.accountingIntegrationEvent.deleteMany({
      where: { sourceId: { in: accountingSourceIds } },
    })
  }

  await tx.goldException.deleteMany({
    where: {
      OR: [
        {
          entityType: "GoldShiftAllocation",
          entityId: { in: priorAllocationIds },
        },
        { entityType: "GoldPour", entityId: { in: allPourIds } },
        { entityType: "BuyerReceipt", entityId: { in: allReceiptIds } },
        { entityType: "GoldLedgerEntry", entityId: { in: allEntryIds } },
      ],
    },
  })

  if (allReceiptIds.length > 0) {
    await tx.buyerReceipt.deleteMany({ where: { id: { in: allReceiptIds } } })
  }

  if (priorAllocationIds.length > 0) {
    await tx.employeePayment.deleteMany({
      where: { goldShiftAllocationId: { in: priorAllocationIds } },
    })
    await tx.goldShiftWorkerShare.deleteMany({
      where: { allocationId: { in: priorAllocationIds } },
    })
    await tx.goldShiftExpense.deleteMany({
      where: { allocationId: { in: priorAllocationIds } },
    })
  }

  if (allPourIds.length > 0) {
    await tx.goldPour.deleteMany({ where: { id: { in: allPourIds } } })
  }

  if (priorAllocationIds.length > 0) {
    await tx.goldShiftAllocation.deleteMany({
      where: { id: { in: priorAllocationIds } },
    })
  }

  // Attendance was created with a per-row shift name like
  // "LEDGER-{lineNo}". Use the allocation rows we collected — same
  // (siteId, date, shift) tuple.
  for (const a of allocationRows) {
    await tx.attendance.deleteMany({
      where: { siteId: a.siteId, date: a.date, shift: a.shift },
    })
  }

  if (shiftReportIds.length > 0) {
    await tx.shiftReport.deleteMany({
      where: { id: { in: shiftReportIds } },
    })
  }

  return {
    removedAllocations: priorAllocationIds.length,
    removedPours: allPourIds.length,
    removedReceipts: allReceiptIds.length,
    removedShiftReports: shiftReportIds.length,
  }
}

export async function resetEntriesAfterPurge(
  tx: Prisma.TransactionClient,
  importId: string,
  options?: { onlyEntryIds?: string[] },
) {
  const entryFilter: Prisma.GoldLedgerEntryWhereInput = options?.onlyEntryIds
    ? { id: { in: options.onlyEntryIds } }
    : { importId }

  // Rows with no parser warning go back to PENDING.
  await tx.goldLedgerEntry.updateMany({
    where: { ...entryFilter, parserWarning: null },
    data: {
      status: "PENDING",
      goldShiftAllocationId: null,
      goldPourId: null,
      buyerReceiptId: null,
      errorMessage: null,
    },
  })

  // Rows with a parser warning land back at ANOMALY with the warning
  // restored so the inline anomaly detail in the wizard never goes blank.
  await tx.goldLedgerEntry.updateMany({
    where: { ...entryFilter, NOT: { parserWarning: null } },
    data: {
      status: "ANOMALY",
      goldShiftAllocationId: null,
      goldPourId: null,
      buyerReceiptId: null,
    },
  })
  const parserAnomalyRows = await tx.goldLedgerEntry.findMany({
    where: { ...entryFilter, NOT: { parserWarning: null } },
    select: { id: true, parserWarning: true },
  })
  for (const row of parserAnomalyRows) {
    await tx.goldLedgerEntry.update({
      where: { id: row.id },
      data: { errorMessage: row.parserWarning },
    })
  }
}
