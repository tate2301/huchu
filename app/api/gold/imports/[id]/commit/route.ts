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

    // Cleanup phase: re-running a commit replaces every record produced by
    // earlier runs of THIS import. Idempotent: deletes allocations, pours
    // (auto + bare), receipts, inventory events, accounting events,
    // exceptions, and attendance for those shifts; resets every entry to
    // PENDING with cleared FKs so the main passes start from scratch.
    const priorAllocationIds = importRecord.entries
      .filter((e) => !!e.goldShiftAllocationId)
      .map((e) => e.goldShiftAllocationId!)
    const priorPourIdsFromEntries = importRecord.entries
      .filter((e) => !!e.goldPourId)
      .map((e) => e.goldPourId!)
    const priorReceiptIds = importRecord.entries
      .filter((e) => !!e.buyerReceiptId)
      .map((e) => e.buyerReceiptId!)
    const allEntryIds = importRecord.entries.map((e) => e.id)

    if (
      priorAllocationIds.length > 0 ||
      priorPourIdsFromEntries.length > 0 ||
      priorReceiptIds.length > 0
    ) {
      await prisma.$transaction(async (tx) => {
        // Pull allocation-linked pours.
        const allocationPours = await tx.goldPour.findMany({
          where: { goldShiftAllocationId: { in: priorAllocationIds } },
          select: { id: true },
        })
        const allPourIds = Array.from(
          new Set([...priorPourIdsFromEntries, ...allocationPours.map((p) => p.id)]),
        )

        // Pull every receipt that touches our pours (FIFO sales might link
        // to pours not directly referenced by an entry).
        const relatedReceipts = await tx.buyerReceipt.findMany({
          where: { goldPourId: { in: allPourIds } },
          select: { id: true },
        })
        const allReceiptIds = Array.from(
          new Set([...priorReceiptIds, ...relatedReceipts.map((r) => r.id)]),
        )

        // Pull expense IDs (their accounting events use the expense ID as
        // sourceId).
        const allocationExpenses = await tx.goldShiftExpense.findMany({
          where: { allocationId: { in: priorAllocationIds } },
          select: { id: true },
        })
        const expenseIds = allocationExpenses.map((e) => e.id)

        // Pull allocation rows so we can find their shift reports + shift
        // names (needed to clean up Attendance for those shifts).
        const allocationRows = await tx.goldShiftAllocation.findMany({
          where: { id: { in: priorAllocationIds } },
          select: { id: true, shiftReportId: true, siteId: true, date: true, shift: true },
        })
        const shiftReportIds = allocationRows.map((a) => a.shiftReportId)

        // Order: child rows first, parents last (no cascade configured on
        // these FKs).
        await tx.goldInventoryEvent.deleteMany({
          where: {
            OR: [
              { sourceType: "POUR", sourceId: { in: allPourIds } },
              { sourceType: "RECEIPT", sourceId: { in: allReceiptIds } },
              { sourceType: "SHIFT_ALLOCATION", sourceId: { in: priorAllocationIds } },
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
              { entityType: "GoldShiftAllocation", entityId: { in: priorAllocationIds } },
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
          await tx.shiftReport.deleteMany({ where: { id: { in: shiftReportIds } } })
        }

        // Reset every entry so the main passes will reprocess from scratch.
        await tx.goldLedgerEntry.updateMany({
          where: { importId: id },
          data: {
            status: "PENDING",
            goldShiftAllocationId: null,
            goldPourId: null,
            buyerReceiptId: null,
            // Keep parser-level errorMessage if it was a parser warning;
            // clear post-commit messages.
            errorMessage: null,
          },
        })
      })
      // Re-fetch entries after reset so the in-memory collection reflects
      // the cleared state.
      const refreshed = await prisma.goldLedgerEntry.findMany({
        where: { importId: id },
        orderBy: { lineNo: "asc" },
      })
      importRecord.entries = refreshed
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
      // Soft-validation: collect warnings, decide flag-vs-fail at the end.
      const rowWarnings: string[] = []
      if (entry.errorMessage && entry.status === "ANOMALY") {
        rowWarnings.push(entry.errorMessage)
      }
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
          // Defensive: if the group is missing or the leader is inactive, we
          // can't credibly create a witnessed allocation. Save the row with
          // ANOMALY + a tracked exception and move on, rather than blowing
          // up the whole import.
          if (!group) {
            // Fallback: missing shift group means we can't create a
            // ShiftReport (FK requires it) and so we can't create the
            // allocation. But the gold output really did happen — save a
            // bare GoldPour using fallback witnesses (any 2 active
            // employees) so the row still produces a record.
            rowWarnings.push(
              "Mapped shift group not found — saved as bare pour without allocation",
            )
            const fallbackWitnesses = await tx.employee.findMany({
              where: { companyId, isActive: true },
              select: { id: true },
              take: 2,
            })
            let fallbackPourId: string | null = null
            if (
              fallbackWitnesses.length >= 2 &&
              entry.gramsTotal &&
              entry.gramsTotal > 0
            ) {
              const pourBarId = await reserveIdentifier(tx, {
                companyId,
                entity: "GOLD_POUR",
              })
              const valuation = await snapshotGoldUsdValue({
                companyId,
                businessDate: entry.parsedDate!,
                grams: entry.gramsTotal,
              })
              const pour = await tx.goldPour.create({
                data: {
                  siteId,
                  pourBarId,
                  pourDate: entry.parsedDate!,
                  grossWeight: entry.gramsTotal,
                  goldPriceUsdPerGram: valuation?.goldPriceUsdPerGram ?? null,
                  valuationDate: valuation?.valuationDate ?? null,
                  valueUsd: valuation?.valueUsd ?? null,
                  witness1Id: fallbackWitnesses[0].id,
                  witness2Id: fallbackWitnesses[1].id,
                  storageLocation: "Vault (unverified)",
                  notes: `Imported from ledger line ${entry.lineNo} — shift group ${entry.mappedShiftGroupId} not found. Witnesses are fallback employees; please reconcile.`,
                  createdById: userId,
                },
                select: { id: true, pourBarId: true },
              })
              fallbackPourId = pour.id
              await recordInventoryEvent(tx, {
                companyId,
                siteId,
                eventDate: entry.parsedDate!,
                direction: "IN",
                grams: entry.gramsTotal,
                goldPriceUsdPerGram: valuation?.goldPriceUsdPerGram ?? null,
                valueUsd: valuation?.valueUsd ?? null,
                sourceType: "POUR",
                sourceId: pour.id,
                notes: `Bare pour ${pour.pourBarId} (no allocation) line ${entry.lineNo}`,
                createdById: userId,
                skipValuation: true,
              })
              poursCreated += 1
            } else if (fallbackWitnesses.length < 2) {
              rowWarnings.push(
                "Could not save bare pour — fewer than 2 active employees in the company",
              )
            }
            await tx.goldLedgerEntry.update({
              where: { id: entry.id },
              data: {
                status: "ANOMALY",
                errorMessage: rowWarnings.join(" · "),
                goldPourId: fallbackPourId,
              },
            })
            await tx.goldException.create({
              data: {
                companyId,
                siteId,
                category: "NAME_UNMAPPED",
                severity: "WARNING",
                entityType: fallbackPourId ? "GoldPour" : "GoldLedgerEntry",
                entityId: fallbackPourId ?? entry.id,
                description: `Ledger line ${entry.lineNo}: shift group ${entry.mappedShiftGroupId} not found${fallbackPourId ? "; saved as bare pour" : ""}`,
                createdById: userId,
              },
            })
            return
          }
          if (!group.leader.isActive) {
            rowWarnings.push(`Group leader ${group.leader.name} is inactive`)
          }

          const presentEmployeeIds = new Set<string>([group.leader.id])
          for (const m of group.members) {
            if (m.employee.isActive) presentEmployeeIds.add(m.employee.id)
          }
          if (presentEmployeeIds.size === 0) {
            rowWarnings.push("No active members in shift group")
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
          const rawNetWeight = +(totalWeight - expenseTotal).toFixed(4)
          let netWeight = rawNetWeight
          if (rawNetWeight <= 0) {
            rowWarnings.push(
              `Expenses (${expenseTotal.toFixed(2)} g) ≥ gross (${totalWeight.toFixed(2)} g) — clamped net to 0.001 g`,
            )
            netWeight = 0.001
          }

          const boys = entry.boysGrams ?? netWeight / 2
          const mdaraRaw = entry.mdaraGrams ?? netWeight - boys
          // Don't allow negative company share — clamp to 0 with a warning.
          const mdara = mdaraRaw < 0 ? 0 : mdaraRaw
          if (mdaraRaw < 0) {
            rowWarnings.push(
              `Boys (${boys}) > net (${netWeight}) — Mdara share clamped to 0`,
            )
          }
          // Override mode whenever Boys ≠ exactly half of net (small tolerance).
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

          // Witness rule: a pour needs at least two people present.
          if (presentList.length < 2) {
            rowWarnings.push(
              `Only ${presentList.length} present employee — no auto-pour for this row`,
            )
          }

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

          // If we collected any warnings (parser-level or this-pass-level),
          // the row is saved but flagged ANOMALY. Otherwise CREATED.
          const isFlagged = rowWarnings.length > 0
          const flaggedMessage = rowWarnings.join(" · ")
          await tx.goldLedgerEntry.update({
            where: { id: entry.id },
            data: {
              goldShiftAllocationId: allocation.id,
              goldPourId: createdPourId,
              status: isFlagged ? "ANOMALY" : "CREATED",
              errorMessage: isFlagged ? flaggedMessage : null,
            },
          })
          if (isFlagged) {
            await tx.goldException.create({
              data: {
                companyId,
                siteId,
                category: "EXPENSE_MISMATCH",
                severity: "WARNING",
                entityType: "GoldShiftAllocation",
                entityId: allocation.id,
                description: `Ledger line ${entry.lineNo} saved with warnings: ${flaggedMessage}`,
                metadata: JSON.stringify({
                  ledgerImportId: importRecord.id,
                  ledgerEntryId: entry.id,
                  warnings: rowWarnings,
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

        })
        // Tally: rowWarnings non-empty means the row was saved-with-flag
        // (counts toward rowsAnomaly). Empty means clean save. The two
        // counters never overlap on a single row.
        if (rowWarnings.length > 0) rowsAnomaly += 1
        else rowsCreated += 1
      } catch (rowError) {
        // Real DB-level failure (Prisma error, FK violation, unique
        // conflict). Log the full stack and try a defensive fallback:
        // create a bare GoldPour so the gold output is at least recorded
        // and reconcilable later. Anomalies never block entry creation.
        const message =
          rowError instanceof Error ? rowError.message : String(rowError)
        console.error(
          `[Import] Production row ${entry.lineNo} failed:`,
          rowError,
        )
        try {
          await prisma.$transaction(async (tx) => {
            const fallbackWitnesses = await tx.employee.findMany({
              where: { companyId, isActive: true },
              select: { id: true },
              take: 2,
            })
            let fallbackPourId: string | null = null
            if (
              fallbackWitnesses.length >= 2 &&
              entry.gramsTotal &&
              entry.gramsTotal > 0
            ) {
              const pourBarId = await reserveIdentifier(tx, {
                companyId,
                entity: "GOLD_POUR",
              })
              const valuation = await snapshotGoldUsdValue({
                companyId,
                businessDate: entry.parsedDate!,
                grams: entry.gramsTotal,
              })
              const pour = await tx.goldPour.create({
                data: {
                  siteId,
                  pourBarId,
                  pourDate: entry.parsedDate!,
                  grossWeight: entry.gramsTotal,
                  goldPriceUsdPerGram: valuation?.goldPriceUsdPerGram ?? null,
                  valuationDate: valuation?.valuationDate ?? null,
                  valueUsd: valuation?.valueUsd ?? null,
                  witness1Id: fallbackWitnesses[0].id,
                  witness2Id: fallbackWitnesses[1].id,
                  storageLocation: "Vault (unverified)",
                  notes: `Imported from ledger line ${entry.lineNo} — full allocation path failed (${message.slice(0, 120)}). Saved as bare pour for reconciliation.`,
                  createdById: userId,
                },
                select: { id: true, pourBarId: true },
              })
              fallbackPourId = pour.id
              await recordInventoryEvent(tx, {
                companyId,
                siteId,
                eventDate: entry.parsedDate!,
                direction: "IN",
                grams: entry.gramsTotal,
                goldPriceUsdPerGram: valuation?.goldPriceUsdPerGram ?? null,
                valueUsd: valuation?.valueUsd ?? null,
                sourceType: "POUR",
                sourceId: pour.id,
                notes: `Bare pour ${pour.pourBarId} (catch-fallback) line ${entry.lineNo}`,
                createdById: userId,
                skipValuation: true,
              })
              poursCreated += 1
            }
            await tx.goldLedgerEntry.update({
              where: { id: entry.id },
              data: {
                status: "ANOMALY",
                goldPourId: fallbackPourId,
                errorMessage: `${message.slice(0, 400)}${fallbackPourId ? " — saved as bare pour" : " — could not save fallback pour"}`,
              },
            })
            await tx.goldException.create({
              data: {
                companyId,
                siteId,
                category: "IMPORT_FAILURE",
                severity: "CRITICAL",
                entityType: fallbackPourId ? "GoldPour" : "GoldLedgerEntry",
                entityId: fallbackPourId ?? entry.id,
                description: `Ledger line ${entry.lineNo} hit a hard error during commit: ${message.slice(0, 200)}${fallbackPourId ? "; saved as bare pour for reconciliation" : ""}`,
                metadata: JSON.stringify({
                  ledgerImportId: importRecord.id,
                  ledgerEntryId: entry.id,
                  errorMessage: message,
                }),
                createdById: userId,
              },
            })
          })
          rowsAnomaly += 1
        } catch (fallbackErr) {
          // If even the bare-pour fallback can't land, mark FAILED so the
          // operator sees the row needs manual intervention.
          console.error(
            `[Import] Production row ${entry.lineNo} fallback also failed:`,
            fallbackErr,
          )
          await prisma.goldLedgerEntry.update({
            where: { id: entry.id },
            data: {
              status: "FAILED",
              errorMessage: `${message.slice(0, 200)} (fallback also failed: ${
                fallbackErr instanceof Error
                  ? fallbackErr.message.slice(0, 200)
                  : String(fallbackErr).slice(0, 200)
              })`,
            },
          })
          rowsFailed += 1
        }
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
        const message =
          rowError instanceof Error ? rowError.message : String(rowError)
        console.error(
          `[Import] Sale row ${entry.lineNo} failed:`,
          rowError,
        )
        await prisma.goldLedgerEntry.update({
          where: { id: entry.id },
          data: { status: "FAILED", errorMessage: message.slice(0, 500) },
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
