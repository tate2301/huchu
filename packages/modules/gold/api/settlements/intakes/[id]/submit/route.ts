import { settlementWorkflowRoute } from "../../../../../settlements/workflow-route"
import { prisma } from "@corelithzw/db/client"

export const POST = settlementWorkflowRoute({
  action: "SUBMIT",
  resource: "settlements.intake",
  entityType: "SETTLEMENT_INTAKE",
  noun: "intake",
  loadRow: (id) =>
    prisma.settlementIntake.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        workflowStatus: true,
        submittedById: true,
      },
    }),
  applyStatus: ({ id, status, actorId, tx }) =>
    tx.settlementIntake.update({
      where: { id },
      data: {
        workflowStatus: status,
        ...(status === "SUBMITTED"
          ? { submittedById: actorId, submittedAt: new Date() }
          : { approvedById: actorId, approvedAt: new Date() }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: {
          include: { employee: { select: { id: true, employeeId: true, name: true } } },
          orderBy: { employee: { name: "asc" } },
        },
      },
    }),
})
