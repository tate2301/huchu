import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  hasRole,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { recordInventoryEvent } from "@/lib/gold/inventory"
import { reserveIdentifier } from "@/lib/id-generator"
import { captureAccountingEvent } from "@/lib/accounting/integration"
import { z } from "zod"

/**
 * Atomic single-shot manual shift-output flow:
 *   - Creates a ShiftReport for (siteId, date, shift)
 *   - Marks Attendance for every (employeeId, status) pair
 *   - Creates the GoldShiftAllocation with the supplied splits/expenses
 *   - Auto-creates a witnessed GoldPour (uses first 2 PRESENT/LATE
 *     employees; falls back to any 2 active employees company-wide)
 *   - Records an IN inventory event for the pour
 *   - Emits Mdara/Boys/expense accounting events (PENDING)
 *
 * Mirrors the import-commit production-row logic so the manual flow
 * lands the same shape of data.
 */
const attendanceItem = z.object({
  employeeId: z.string().uuid(),
  status: z.enum(["PRESENT", "LATE", "ABSENT"]),
})

const expenseItem = z.object({
  type: z.string().trim().min(1).max(50),
  weight: z.number().min(0),
})

const shiftOutputSchema = z.object({
  siteId: z.string().uuid(),
  date: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  shift: z.string().trim().min(1).max(64),
  shiftGroupId: z.string().uuid(),
  workType: z
    .enum(["EXTRACTION", "HAULING", "CRUSHING", "PROCESSING"])
    .default("EXTRACTION"),
  outputTonnes: z.number().min(0).optional(),
  attendance: z.array(attendanceItem).min(1),
  totalWeight: z.number().min(0),
  expenses: z.array(expenseItem).default([]),
  splitMode: z
    .enum(["DEFAULT_50_50", "OVERRIDE_WORKER_WEIGHT"])
    .default("DEFAULT_50_50"),
  workerShareOverrideWeight: z.number().min(0).optional(),
  splitOverrideReason: z.string().trim().max(500).optional(),
  payCycleWeeks: z.number().int().min(1).max(8).default(2),
  notes: z.string().trim().max(1000).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to create shift output", 403)
    }

    const companyId = session.user.companyId
    const userId = session.user.id

    const body = await request.json()
    const validated = shiftOutputSchema.parse(body)

    // Validate site
    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true, isActive: true },
    })
    if (!site || site.companyId !== companyId || !site.isActive) {
      return errorResponse("Invalid site", 403)
    }

    // Validate shift group
    const group = await prisma.shiftGroup.findUnique({
      where: { id: validated.shiftGroupId },
      include: {
        leader: { select: { id: true, name: true, isActive: true } },
      },
    })
    if (!group || group.companyId !== companyId) {
      return errorResponse("Invalid shift group", 403)
    }

    const presentList = validated.attendance
      .filter((a) => a.status === "PRESENT" || a.status === "LATE")
      .map((a) => a.employeeId)

    const dateObj = new Date(validated.date)

    const expenses = validated.expenses.filter((e) => e.weight > 0)
    const expenseTotal = expenses.reduce((s, e) => s + e.weight, 0)
    let netWeight = +(validated.totalWeight - expenseTotal).toFixed(4)
    const warnings: string[] = []
    if (netWeight <= 0) {
      warnings.push(
        `Expenses (${expenseTotal.toFixed(2)} g) ≥ gross (${validated.totalWeight.toFixed(2)} g) — net clamped to 0.001 g`,
      )
      netWeight = 0.001
    }

    let workerShare =
      validated.splitMode === "OVERRIDE_WORKER_WEIGHT"
        ? Math.max(
            0,
            Math.min(validated.workerShareOverrideWeight ?? netWeight / 2, netWeight),
          )
        : netWeight / 2
    let companyShare = +(netWeight - workerShare).toFixed(4)
    if (companyShare < 0) {
      warnings.push("Worker share clamped to net weight; company share = 0")
      companyShare = 0
      workerShare = netWeight
    }
    const perWorkerWeight =
      presentList.length > 0
        ? +(workerShare / presentList.length).toFixed(4)
        : workerShare

    const valuation = await snapshotGoldUsdValue({
      companyId,
      businessDate: dateObj,
      grams: 1,
    })
    const goldPrice = valuation?.goldPriceUsdPerGram ?? 0
    const valuationDate = valuation?.valuationDate ?? null
    const totalWeightValueUsd = goldPrice
      ? +(validated.totalWeight * goldPrice).toFixed(2)
      : null
    const netWeightValueUsd = goldPrice ? +(netWeight * goldPrice).toFixed(2) : null
    const workerShareValueUsd = goldPrice ? +(workerShare * goldPrice).toFixed(2) : null
    const companyShareValueUsd = goldPrice
      ? +(companyShare * goldPrice).toFixed(2)
      : null
    const perWorkerValueUsd = goldPrice
      ? +(perWorkerWeight * goldPrice).toFixed(2)
      : null

    // Pick witnesses: first two PRESENT/LATE employees, falling back to
    // any 2 active employees in the company.
    let witness1Id: string | null = presentList[0] ?? null
    let witness2Id: string | null = presentList[1] ?? null
    if (!witness1Id || !witness2Id) {
      const fallback = await prisma.employee.findMany({
        where: { companyId, isActive: true },
        select: { id: true },
        take: 4,
      })
      const fallbackIds = fallback.map((e) => e.id)
      if (!witness1Id) witness1Id = fallbackIds[0] ?? null
      if (!witness2Id) {
        witness2Id =
          fallbackIds.find((id) => id !== witness1Id) ?? null
      }
      if (witness1Id && witness2Id) {
        warnings.push("Witnesses are fallback employees — please reconcile")
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // ShiftReport (DRAFT). Multiple per (siteId, date, shift) are not
      // allowed at the allocation level (uniq @@unique([siteId,date,shift])
      // on GoldShiftAllocation), but ShiftReport itself has no such
      // constraint — we let it create.
      const shiftReport = await tx.shiftReport.create({
        data: {
          siteId: validated.siteId,
          shiftGroupId: group.id,
          groupLeaderId: group.leaderEmployeeId,
          date: dateObj,
          shift: validated.shift,
          workType: validated.workType,
          crewCount: presentList.length,
          outputTonnes: validated.outputTonnes ?? null,
          status: "DRAFT",
          createdById: userId,
          handoverNotes: validated.notes ?? null,
        },
        select: { id: true },
      })

      // Attendance for every employee (PRESENT/LATE/ABSENT all stored).
      if (validated.attendance.length > 0) {
        await tx.attendance.createMany({
          data: validated.attendance.map((a) => ({
            date: dateObj,
            siteId: validated.siteId,
            shift: validated.shift,
            shiftGroupId: group.id,
            shiftLeaderId: group.leaderEmployeeId,
            shiftLeaderName: group.leader.name,
            employeeId: a.employeeId,
            status: a.status,
            notes: "Manual shift-output entry",
          })),
          skipDuplicates: true,
        })
      }

      const allocation = await tx.goldShiftAllocation.create({
        data: {
          date: dateObj,
          shift: validated.shift,
          siteId: validated.siteId,
          shiftReportId: shiftReport.id,
          totalWeight: validated.totalWeight,
          netWeight,
          splitMode: validated.splitMode,
          workerShareOverrideWeight:
            validated.splitMode === "OVERRIDE_WORKER_WEIGHT"
              ? workerShare
              : null,
          splitOverrideReason:
            validated.splitMode === "OVERRIDE_WORKER_WEIGHT"
              ? validated.splitOverrideReason ?? "Manual override"
              : null,
          workerShareWeight: workerShare,
          companyShareWeight: companyShare,
          perWorkerWeight,
          goldPriceUsdPerGram: goldPrice || null,
          valuationDate,
          totalWeightValueUsd,
          netWeightValueUsd,
          workerShareValueUsd,
          companyShareValueUsd,
          perWorkerValueUsd,
          payCycleWeeks: validated.payCycleWeeks,
          workflowStatus: "DRAFT",
          createdById: userId,
          expenses: {
            create: expenses.map((e) => ({ type: e.type, weight: e.weight })),
          },
          workerShares:
            presentList.length > 0
              ? {
                  create: presentList.map((employeeId) => ({
                    employeeId,
                    shareWeight: perWorkerWeight,
                    shareValueUsd: perWorkerValueUsd,
                  })),
                }
              : undefined,
        },
        include: { expenses: true, workerShares: true },
      })

      // Auto-pour
      let pourId: string | null = null
      if (witness1Id && witness2Id) {
        const pourBarId = await reserveIdentifier(tx, {
          companyId,
          entity: "GOLD_POUR",
        })
        const pour = await tx.goldPour.create({
          data: {
            siteId: validated.siteId,
            pourBarId,
            pourDate: dateObj,
            grossWeight: validated.totalWeight,
            goldPriceUsdPerGram: goldPrice || null,
            valuationDate,
            valueUsd: totalWeightValueUsd,
            witness1Id,
            witness2Id,
            storageLocation: "Vault",
            notes: `Auto pour from manual shift output (allocation ${allocation.id})`,
            createdById: userId,
            goldShiftAllocationId: allocation.id,
          },
          select: { id: true, pourBarId: true },
        })
        pourId = pour.id
        await recordInventoryEvent(tx, {
          companyId,
          siteId: validated.siteId,
          eventDate: dateObj,
          direction: "IN",
          grams: validated.totalWeight,
          goldPriceUsdPerGram: goldPrice || null,
          valueUsd: totalWeightValueUsd,
          sourceType: "POUR",
          sourceId: pour.id,
          notes: `Auto pour ${pour.pourBarId} from manual allocation ${allocation.id}`,
          createdById: userId,
          skipValuation: true,
        })
      } else {
        warnings.push(
          "No auto-pour created — witnesses unavailable. Allocation saved only.",
        )
      }

      // Anomaly exception if we had any warnings
      if (warnings.length > 0) {
        await tx.goldException.create({
          data: {
            companyId,
            siteId: validated.siteId,
            category: "EXPENSE_MISMATCH",
            severity: "WARNING",
            entityType: "GoldShiftAllocation",
            entityId: allocation.id,
            description: `Manual shift-output allocation ${allocation.id} saved with warnings: ${warnings.join(" · ")}`,
            createdById: userId,
          },
        })
      }

      const sharedPayload = {
        allocationId: allocation.id,
        siteId: validated.siteId,
        shift: validated.shift,
        date: allocation.date,
        goldPriceUsdPerGram: goldPrice || null,
      }

      if (companyShare > 0 && goldPrice) {
        await captureAccountingEvent({
          companyId,
          sourceDomain: "gold",
          sourceAction: "shift-allocation-company-share",
          sourceType: "GOLD_SHIFT_ALLOCATION_COMPANY",
          sourceId: allocation.id,
          entryDate: allocation.date,
          description: `Mdara share — allocation ${allocation.id}`,
          amount: companyShareValueUsd ?? 0,
          netAmount: companyShareValueUsd,
          grossAmount: companyShareValueUsd,
          payload: { ...sharedPayload, shareWeight: companyShare, shareValueUsd: companyShareValueUsd },
          createdById: userId,
          status: "PENDING",
        }, tx)
      }
      if (workerShare > 0 && goldPrice) {
        await captureAccountingEvent({
          companyId,
          sourceDomain: "gold",
          sourceAction: "shift-allocation-worker-share",
          sourceType: "GOLD_SHIFT_ALLOCATION_WORKER",
          sourceId: allocation.id,
          entryDate: allocation.date,
          description: `Boys share — allocation ${allocation.id}`,
          amount: workerShareValueUsd ?? 0,
          netAmount: workerShareValueUsd,
          grossAmount: workerShareValueUsd,
          payload: { ...sharedPayload, shareWeight: workerShare, shareValueUsd: workerShareValueUsd },
          createdById: userId,
          status: "PENDING",
        }, tx)
      }
      if (goldPrice) {
        for (const expense of allocation.expenses) {
          const valueUsd = +(expense.weight * goldPrice).toFixed(2)
          await captureAccountingEvent({
            companyId,
            sourceDomain: "gold",
            sourceAction: "shift-expense",
            sourceType: "GOLD_SHIFT_EXPENSE",
            sourceId: expense.id,
            entryDate: allocation.date,
            description: `${expense.type} — allocation ${allocation.id}`,
            amount: valueUsd,
            netAmount: valueUsd,
            grossAmount: valueUsd,
            payload: { ...sharedPayload, expenseId: expense.id, expenseType: expense.type, weight: expense.weight, valueUsd },
            createdById: userId,
            status: "PENDING",
          }, tx)
        }
      }

      return { allocation, pourId }
    })

    return successResponse(
      {
        allocationId: result.allocation.id,
        pourId: result.pourId,
        warnings,
      },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/shift-output error:", error)
    return errorResponse("Failed to record shift output")
  }
}
