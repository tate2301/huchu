import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { captureAccountingEvent } from "@/lib/accounting/integration";
import { emitWorkOrderStatusNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";

const updateWorkOrderSchema = z.object({
  issue: z.string().min(1).max(1000).optional(),
  downtimeStart: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
    .optional(),
  downtimeEnd: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
    .nullable()
    .optional(),
  workDone: z.string().max(2000).nullable().optional(),
  partsUsed: z.array(z.string().max(200)).optional(),
  partsCost: z.number().min(0).optional(),
  laborCost: z.number().min(0).optional(),
  technicianId: z.string().uuid().nullable().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function getWorkOrderForCompany(id: string, companyId: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      equipment: {
        include: {
          site: { select: { companyId: true, name: true, code: true } },
        },
      },
      technician: { select: { id: true, name: true, employeeId: true } },
    },
  });

  if (!workOrder || workOrder.equipment.site.companyId !== companyId) {
    return null;
  }

  return workOrder;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await getWorkOrderForCompany(id, session.user.companyId);
    if (!existing) {
      return errorResponse("Work order not found", 404);
    }

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
      include: {
        equipment: {
          include: {
            site: { select: { name: true, code: true } },
          },
        },
        technician: { select: { id: true, name: true, employeeId: true } },
      },
    });

    return successResponse(workOrder);
  } catch (error) {
    console.error("[API] GET /api/work-orders/[id] error:", error);
    return errorResponse("Failed to fetch work order");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await getWorkOrderForCompany(id, session.user.companyId);
    if (!existing) {
      return errorResponse("Work order not found", 404);
    }

    const body = await request.json();
    const validated = updateWorkOrderSchema.parse(body);

    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400);
    }

    if (validated.technicianId) {
      const technician = await prisma.employee.findUnique({
        where: { id: validated.technicianId },
        select: { companyId: true, isActive: true },
      });
      if (!technician || technician.companyId !== session.user.companyId || !technician.isActive) {
        return errorResponse("Invalid technician", 400);
      }
    }

    const nextStatus = validated.status ?? existing.status;
    const nextDowntimeEnd =
      validated.downtimeEnd !== undefined
        ? validated.downtimeEnd
          ? new Date(validated.downtimeEnd)
          : null
        : nextStatus === "COMPLETED" && !existing.downtimeEnd
          ? new Date()
          : undefined;

    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        issue: validated.issue,
        downtimeStart: validated.downtimeStart ? new Date(validated.downtimeStart) : undefined,
        downtimeEnd: nextDowntimeEnd,
        workDone:
          validated.workDone !== undefined ? validated.workDone ?? null : undefined,
        partsUsed:
          validated.partsUsed !== undefined ? JSON.stringify(validated.partsUsed) : undefined,
        partsCost: validated.partsCost,
        laborCost: validated.laborCost,
        technicianId:
          validated.technicianId !== undefined ? validated.technicianId : undefined,
        status: validated.status,
      },
      include: {
        equipment: {
          include: {
            site: { select: { name: true, code: true } },
          },
        },
        technician: { select: { id: true, name: true, employeeId: true } },
      },
    });

    if (validated.status && validated.status !== existing.status) {
      await emitWorkOrderStatusNotification(prisma, {
        companyId: session.user.companyId,
        actorId: session.user.id,
        actorRole: session.user.role,
        workOrder: {
          id: updated.id,
          issue: updated.issue,
          status: updated.status,
          equipment: {
            id: updated.equipment.id,
            equipmentCode: updated.equipment.equipmentCode,
            name: updated.equipment.name,
          },
        },
      });
    }

    if (validated.status === "COMPLETED") {
      const totalCost = (updated.partsCost ?? 0) + (updated.laborCost ?? 0);
      if (totalCost > 0) {
        try {
          await createJournalEntryFromSource({
            companyId: session.user.companyId,
            sourceType: "MAINTENANCE_COMPLETION",
            sourceId: updated.id,
            entryDate: updated.downtimeEnd ?? new Date(),
            description: `Maintenance completed: ${updated.issue}`,
            createdById: session.user.id,
            amount: totalCost,
            netAmount: totalCost,
            taxAmount: 0,
            grossAmount: totalCost,
          });
        } catch (error) {
          console.error("[Accounting] Maintenance auto-post failed:", error);
        }
      }
    }

    if (validated.status && validated.status !== existing.status) {
      try {
        await captureAccountingEvent({
          companyId: session.user.companyId,
          sourceDomain: "maintenance",
          sourceAction: "work-order-status-changed",
          sourceId: updated.id,
          entryDate: updated.updatedAt,
          description: `Work order ${updated.id} status changed to ${updated.status}`,
          amount: (updated.partsCost ?? 0) + (updated.laborCost ?? 0),
          payload: {
            fromStatus: existing.status,
            toStatus: updated.status,
            equipmentId: updated.equipmentId,
          },
          createdById: session.user.id,
          status: "IGNORED",
        });
      } catch (error) {
        console.error("[Accounting] Work order status capture failed:", error);
      }
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/work-orders/[id] error:", error);
    return errorResponse("Failed to update work order");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await getWorkOrderForCompany(id, session.user.companyId);
    if (!existing) {
      return errorResponse("Work order not found", 404);
    }

    await prisma.workOrder.delete({
      where: { id },
    });

    return successResponse({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/work-orders/[id] error:", error);
    return errorResponse("Failed to delete work order");
  }
}
