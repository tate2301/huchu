import { settlementWorkflowRoute } from "@corelithzw/module-gold/settlements/workflow-route"
import { prisma } from "@corelithzw/db/client"

/**
 * A settlement run's status column is `PayrollRunStatus`, shared with payroll so
 * the two read alike, but its values line up with the workflow statuses one for
 * one (DRAFT / SUBMITTED / APPROVED / REJECTED — POSTED comes later, from the
 * journal). The cast is that alignment, not a widening.
 */
export const POST = settlementWorkflowRoute({
  action: "APPROVE",
  resource: "settlements.run",
  entityType: "SETTLEMENT_RUN",
  noun: "run",
  loadRow: async (id) => {
    const row = await prisma.settlementRun.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true, submittedById: true },
    })
    if (!row) return null
    if (row.status === "POSTED") {
      // A posted run has a journal entry against it; reopening it would leave the
      // ledger describing a settlement that no longer says the same thing.
      return { ...row, workflowStatus: "APPROVED" as const }
    }
    return { ...row, workflowStatus: row.status }
  },
  applyStatus: ({ id, status, actorId, tx }) =>
    tx.settlementRun.update({
      where: { id },
      data: {
        status,
        ...(status === "SUBMITTED"
          ? { submittedById: actorId, submittedAt: new Date() }
          : { approvedById: actorId, approvedAt: new Date() }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        lines: {
          include: { employee: { select: { id: true, employeeId: true, name: true } } },
          orderBy: { employee: { name: "asc" } },
        },
      },
    }),
})
