import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { recordInventoryEvent } from "@/lib/gold/inventory"
import { linkFifoSale } from "@/lib/gold/fifo-link"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { reserveIdentifier } from "@/lib/id-generator"
import { captureAccountingEvent } from "@/lib/accounting/integration"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const companyId = session.user.companyId
    const userId = session.user.id
    const { id } = await params

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      include: { entries: { orderBy: { lineNo: "asc" } } },
    })
    if (!importRecord || importRecord.companyId !== companyId) {
      return errorResponse("Import not found", 404)
    }
    if (importRecord.status === "COMMITTED") {
      return errorResponse("Already committed", 409)
    }
    if (!importRecord.siteId) {
      return errorResponse("Pick a site before committing", 400)
    }

    const siteId = importRecord.siteId

    // Validate site is active and belongs to company.
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { companyId: true, isActive: true },
    })
    if (!site || site.companyId !== companyId || !site.isActive) {
      return errorResponse("Invalid site", 403)
    }

    let rowsCreated = 0
    let rowsSkipped = 0
    let rowsAnomaly = 0
    let rowsFailed = 0
    let allocationsCreated = 0
    let poursCreated = 0
    let salesCreated = 0
    let totalSaleGrams = 0
    let totalDeficitGrams = 0

    // Production rows: process anything not yet anchored to an allocation.
    // PENDING (fresh), ANOMALY (parser warnings — still saveable, just flagged),
    // FAILED (previous-attempt remnants from a bug we've since fixed).
    // Once a row has goldShiftAllocationId it's done — we don't re-create.
    const productionEntries = importRecord.entries.filter(
      (e) =>
        e.gramsTotal != null &&
        e.gramsTotal > 0 &&
        e.mappedShiftGroupId &&
        e.parsedDate &&
        !e.goldShiftAllocationId &&
        (e.status === "PENDING" || e.status === "ANOMALY" || e.status === "FAILED"),
    )

    for (const entry of productionEntries) {
      const shiftName = `LEDGER-${entry.lineNo}`
      try {
        await prisma.$transaction(async (tx) => {
          const group = await tx.shiftGroup.findUnique({
            where: { id: entry.mappedShiftGroupId! },
            include: {
              leader: { select: { id: true, name: true, isActive: true } },
              members: {
                where: { isActive: true },
                include: { employee: { select: { id: true, isActive: true, name: true } } },
              },
            },
          })
          if (!group || !group.leader.isActive) {
            throw new Error("Mapped shift group is missing or leader inactive")
          }

          const presentEmployeeIds = new Set<string>([group.leader.id])
          for (const m of group.members) {
            if (m.employee.isActive) presentEmployeeIds.add(m.employee.id)
          }
          if (presentEmployeeIds.size === 0) {
            throw new Error("No active members in shift group")
          }

          // Create ShiftReport
          const shiftReport = await tx.shiftReport.create({
            data: {
              siteId,
              shiftGroupId: group.id,
              groupLeaderId: group.leaderEmployeeId,
              date: entry.parsedDate!,
              shift: shiftName,
              workType: "EXTRACTION",
              crewCount: presentEmployeeIds.size,
              status: "DRAFT",
              createdById: userId,
              handoverNotes: `Imported from ledger ${importRecord.fileName} line ${entry.lineNo}`,
            },
            select: { id: true },
          })

          // Attendance for everyone in the group → PRESENT
          await tx.attendance.createMany({
            data: Array.from(presentEmployeeIds).map((employeeId) => ({
              date: entry.parsedDate!,
              siteId,
              shift: shiftName,
              shiftGroupId: group.id,
              shiftLeaderId: group.leaderEmployeeId,
              shiftLeaderName: group.leader.name,
              employeeId,
              status: "PRESENT",
              notes: `Imported from ledger line ${entry.lineNo}`,
            })),
            skipDuplicates: true,
          })

          // Compute splits using ledger values
          const totalWeight = entry.gramsTotal!
          const expenses: Array<{ type: string; weight: number }> = entry.expensesJson
            ? JSON.parse(entry.expensesJson)
            : []
          const expenseTotal = expenses.reduce((s, e) => s + e.weight, 0)
          const netWeight = +(totalWeight - expenseTotal).toFixed(4)
          if (netWeight <= 0) {
            throw new Error("Net weight must be positive after expenses")
          }

          const boys = entry.boysGrams ?? netWeight / 2
          const mdara = entry.mdaraGrams ?? netWeight - boys
          // Slight rounding tolerance
          const splitMode =
            Math.abs(boys - netWeight / 2) < 0.001 ? "DEFAULT_50_50" : "OVERRIDE_WORKER_WEIGHT"

          // Valuation snapshot — soft-fail if no gold price is configured
          // (the user can post-import set a price; events still capture weights).
          const valuation = await snapshotGoldUsdValue({
            companyId,
            businessDate: entry.parsedDate!,
            grams: 1,
          })
          const goldPrice = valuation?.goldPriceUsdPerGram ?? 0
          const valuationDate = valuation?.valuationDate ?? null
          const totalWeightValueUsd = goldPrice ? +(totalWeight * goldPrice).toFixed(2) : null
          const netWeightValueUsd = goldPrice ? +(netWeight * goldPrice).toFixed(2) : null
          const workerShareValueUsd = goldPrice ? +(boys * goldPrice).toFixed(2) : null
          const companyShareValueUsd = goldPrice ? +(mdara * goldPrice).toFixed(2) : null
          const presentList = Array.from(presentEmployeeIds)
          const perWorkerWeight = +(boys / presentList.length).toFixed(4)
          const perWorkerValueUsd = goldPrice ? +(perWorkerWeight * goldPrice).toFixed(2) : null

          const allocation = await tx.goldShiftAllocation.create({
            data: {
              date: entry.parsedDate!,
              shift: shiftName,
              siteId,
              shiftReportId: shiftReport.id,
              totalWeight,
              netWeight,
              splitMode,
              workerShareOverrideWeight: splitMode === "OVERRIDE_WORKER_WEIGHT" ? boys : null,
              splitOverrideReason:
                splitMode === "OVERRIDE_WORKER_WEIGHT"
                  ? "Imported ledger override (Boys/Mdara from source)"
                  : null,
              workerShareWeight: boys,
              companyShareWeight: mdara,
              perWorkerWeight,
              goldPriceUsdPerGram: goldPrice || null,
              valuationDate,
              totalWeightValueUsd,
              netWeightValueUsd,
              workerShareValueUsd,
              companyShareValueUsd,
              perWorkerValueUsd,
              payCycleWeeks: 2,
              workflowStatus: "DRAFT",
              createdById: userId,
              expenses: { create: expenses.map((e) => ({ type: e.type, weight: e.weight })) },
              workerShares: {
                create: presentList.map((employeeId) => ({
                  employeeId,
                  shareWeight: perWorkerWeight,
                  shareValueUsd: perWorkerValueUsd,
                })),
              },
            },
            include: { expenses: true, workerShares: true },
          })

          // Auto-pour if witnesses available
          let createdPourId: string | null = null
          if (presentList.length >= 2) {
            const pourBarId = await reserveIdentifier(tx, {
              companyId,
              entity: "GOLD_POUR",
            })
            const pour = await tx.goldPour.create({
              data: {
                siteId,
                pourBarId,
                pourDate: entry.parsedDate!,
                grossWeight: totalWeight,
                goldPriceUsdPerGram: goldPrice || null,
                valuationDate,
                valueUsd: totalWeightValueUsd,
                witness1Id: presentList[0],
                witness2Id: presentList[1],
                storageLocation: "Vault",
                notes: `Auto pour from imported allocation (line ${entry.lineNo})`,
                createdById: userId,
                goldShiftAllocationId: allocation.id,
              },
              select: { id: true, pourBarId: true },
            })
            createdPourId = pour.id

            await recordInventoryEvent(tx, {
              companyId,
              siteId,
              eventDate: entry.parsedDate!,
              direction: "IN",
              grams: totalWeight,
              goldPriceUsdPerGram: goldPrice || null,
              valueUsd: totalWeightValueUsd,
              sourceType: "POUR",
              sourceId: pour.id,
              notes: `Imported pour ${pour.pourBarId} line ${entry.lineNo}`,
              createdById: userId,
              skipValuation: true,
            })
          }

          // Preserve anomaly flag if the parser noted a warning on this row
          // (e.g., Tot Exp mismatch). The allocation IS saved — we just keep
          // the row flagged ANOMALY with its original errorMessage so the
          // manager can review later.
          const hadParserWarning =
            entry.status === "ANOMALY" && !!entry.errorMessage
          await tx.goldLedgerEntry.update({
            where: { id: entry.id },
            data: {
              goldShiftAllocationId: allocation.id,
              status: hadParserWarning ? "ANOMALY" : "CREATED",
              // Keep the original parser warning visible.
            },
          })
          if (hadParserWarning) {
            await tx.goldException.create({
              data: {
                companyId,
                siteId,
                category: "EXPENSE_MISMATCH",
                severity: "WARNING",
                entityType: "GoldShiftAllocation",
                entityId: allocation.id,
                description: `Ledger line ${entry.lineNo} saved with parser warning: ${entry.errorMessage}`,
                metadata: JSON.stringify({
                  ledgerImportId: importRecord.id,
                  ledgerEntryId: entry.id,
                  parserWarning: entry.errorMessage,
                }),
                createdById: userId,
              },
            })
          }
          allocationsCreated += 1
          if (createdPourId) poursCreated += 1

          // Accounting events (Mdara, Boys, per-expense)
          const sharedPayload = {
            allocationId: allocation.id,
            siteId,
            shift: shiftName,
            date: allocation.date,
            goldPriceUsdPerGram: goldPrice,
            ledgerImportId: importRecord.id,
            ledgerLineNo: entry.lineNo,
          }
          if (mdara > 0 && goldPrice) {
            await captureAccountingEvent({
              companyId,
              sourceDomain: "gold",
              sourceAction: "shift-allocation-company-share",
              sourceType: "GOLD_SHIFT_ALLOCATION_COMPANY",
              sourceId: allocation.id,
              entryDate: allocation.date,
              description: `Mdara share — allocation ${allocation.id} (line ${entry.lineNo})`,
              amount: companyShareValueUsd ?? 0,
              netAmount: companyShareValueUsd,
              grossAmount: companyShareValueUsd,
              payload: { ...sharedPayload, shareWeight: mdara, shareValueUsd: companyShareValueUsd },
              createdById: userId,
              status: "PENDING",
            })
          }
          if (boys > 0 && goldPrice) {
            await captureAccountingEvent({
              companyId,
              sourceDomain: "gold",
              sourceAction: "shift-allocation-worker-share",
              sourceType: "GOLD_SHIFT_ALLOCATION_WORKER",
              sourceId: allocation.id,
              entryDate: allocation.date,
              description: `Boys share — allocation ${allocation.id} (line ${entry.lineNo})`,
              amount: workerShareValueUsd ?? 0,
              netAmount: workerShareValueUsd,
              grossAmount: workerShareValueUsd,
              payload: { ...sharedPayload, shareWeight: boys, shareValueUsd: workerShareValueUsd },
              createdById: userId,
              status: "PENDING",
            })
          }
          if (goldPrice) {
            for (const expense of allocation.expenses) {
              const expenseValueUsd = +(expense.weight * goldPrice).toFixed(2)
              await captureAccountingEvent({
                companyId,
                sourceDomain: "gold",
                sourceAction: "shift-expense",
                sourceType: "GOLD_SHIFT_EXPENSE",
                sourceId: expense.id,
                entryDate: allocation.date,
                description: `${expense.type} — allocation ${allocation.id} (line ${entry.lineNo})`,
                amount: expenseValueUsd,
                netAmount: expenseValueUsd,
                grossAmount: expenseValueUsd,
                payload: { ...sharedPayload, expenseId: expense.id, expenseType: expense.type, weight: expense.weight, valueUsd: expenseValueUsd },
                createdById: userId,
                status: "PENDING",
              })
            }
          }

          if (presentList.length < 2) {
            await tx.goldException.create({
              data: {
                companyId,
                siteId,
                category: "WITNESS_MISSING",
                severity: "WARNING",
                entityType: "GoldShiftAllocation",
                entityId: allocation.id,
                description: `No auto-pour for line ${entry.lineNo}: only ${presentList.length} present employee.`,
                createdById: userId,
              },
            })
          }
        })
        // Anomaly-saved rows count toward rowsCreated (we did create the
        // allocation) AND toward rowsAnomaly (so the wizard surfaces them
        // as "saved with warning"). The two are deliberately overlapping.
        const wasAnomaly =
          entry.status === "ANOMALY" && !!entry.errorMessage
        rowsCreated += 1
        if (wasAnomaly) rowsAnomaly += 1
      } catch (rowError) {
        const message = rowError instanceof Error ? rowError.message : String(rowError)
        await prisma.goldLedgerEntry.update({
          where: { id: entry.id },
          data: { status: "FAILED", errorMessage: message },
        })
        rowsFailed += 1
      }
    }

    // Sales pass — entries with negative bal
    const saleEntries = importRecord.entries.filter(
      (e) => e.balGrams != null && e.balGrams < 0 && e.parsedDate,
    )
    for (const entry of saleEntries) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const r = await linkFifoSale(tx, {
            companyId,
            siteId,
            saleGrams: Math.abs(entry.balGrams!),
            saleDate: entry.parsedDate!,
            paymentMethod: "CASH",
            sourceLabel: `ledger import line ${entry.lineNo}`,
            createdById: userId,
          })
          if (r.isAnomaly) {
            await tx.goldException.create({
              data: {
                companyId,
                siteId,
                category: "INVENTORY_DEFICIT",
                severity: "CRITICAL",
                entityType: "GoldLedgerEntry",
                entityId: entry.id,
                description: `Oversell: ledger line ${entry.lineNo} requested ${Math.abs(entry.balGrams!).toFixed(3)} g but only ${r.consumedGrams.toFixed(3)} g was on hand. Deficit ${r.remainingGrams.toFixed(3)} g.`,
                metadata: JSON.stringify({
                  saleGrams: Math.abs(entry.balGrams!),
                  consumedGrams: r.consumedGrams,
                  deficitGrams: r.remainingGrams,
                }),
                createdById: userId,
              },
            })
          }
          // Don't clobber an ANOMALY flag that the production pass put on
          // this same row (e.g., parser warning on a row that's both
          // production + sale). Promote PENDING/FAILED to CREATED only if
          // FIFO fully covered the sale.
          const currentEntry = await tx.goldLedgerEntry.findUnique({
            where: { id: entry.id },
            select: { status: true, errorMessage: true },
          })
          const stayAnomaly =
            r.isAnomaly || currentEntry?.status === "ANOMALY"
          await tx.goldLedgerEntry.update({
            where: { id: entry.id },
            data: {
              status: stayAnomaly ? "ANOMALY" : "CREATED",
              buyerReceiptId: r.receiptIds[0] ?? null,
              errorMessage: r.isAnomaly
                ? `Inventory deficit ${r.remainingGrams.toFixed(3)} g`
                : currentEntry?.errorMessage ?? null,
            },
          })
          return r
        })
        salesCreated += result.receiptIds.length
        totalSaleGrams += result.consumedGrams
        if (result.isAnomaly) {
          totalDeficitGrams += result.remainingGrams
          rowsAnomaly += 1
        } else {
          rowsCreated += 1
        }
      } catch (rowError) {
        const message = rowError instanceof Error ? rowError.message : String(rowError)
        await prisma.goldLedgerEntry.update({
          where: { id: entry.id },
          data: { status: "FAILED", errorMessage: message },
        })
        rowsFailed += 1
      }
    }

    rowsSkipped =
      importRecord.entries.length - rowsCreated - rowsAnomaly - rowsFailed

    const updated = await prisma.goldLedgerImport.update({
      where: { id },
      data: {
        rowsCreated,
        rowsSkipped,
        rowsAnomaly,
        rowsFailed,
        status: rowsFailed > 0 ? "FAILED" : "COMMITTED",
        committedAt: new Date(),
      },
    })

    return successResponse({
      ...updated,
      summary: {
        rowsCreated,
        rowsSkipped,
        rowsAnomaly,
        rowsFailed,
        allocationsCreated,
        poursCreated,
        salesCreated,
        totalSaleGrams: +totalSaleGrams.toFixed(3),
        totalDeficitGrams: +totalDeficitGrams.toFixed(3),
      },
    })
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/commit error:", error)
    return errorResponse("Failed to commit import")
  }
}
