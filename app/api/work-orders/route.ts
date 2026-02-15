import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { emitWorkOrderStatusNotification } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const workOrderSchema = z.object({
  equipmentId: z.string().uuid(),
  issue: z.string().min(1).max(1000),
  downtimeStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  downtimeEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)).optional(),
  workDone: z.string().max(2000).optional(),
  partsUsed: z.array(z.string().max(200)).optional(),
  partsCost: z.number().min(0).optional(),
  laborCost: z.number().min(0).optional(),
  technicianId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get('equipmentId');
    const siteId = searchParams.get('siteId');
    const status = searchParams.get('status');
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      equipment: {
        site: { companyId: session.user.companyId },
      },
    };

    if (equipmentId) where.equipmentId = equipmentId;
    if (siteId) {
      const equipmentWhere =
        (where.equipment as Record<string, unknown> | undefined) ?? {};
      where.equipment = { ...equipmentWhere, siteId };
    }
    if (status) where.status = status;
    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          equipment: {
            include: {
              site: { select: { name: true, code: true } },
            },
          },
          technician: { select: { id: true, name: true, employeeId: true } },
        },
        orderBy: [
          { status: 'asc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.workOrder.count({ where }),
    ]);

    return successResponse(paginationResponse(workOrders, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/work-orders error:', error);
    return errorResponse('Failed to fetch work orders');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = workOrderSchema.parse(body);

    // Verify equipment access
    const equipment = await prisma.equipment.findUnique({
      where: { id: validated.equipmentId },
      include: { site: { select: { companyId: true } } },
    });

    if (!equipment || equipment.site.companyId !== session.user.companyId) {
      return errorResponse('Invalid equipment', 403);
    }

    if (!equipment.isActive) {
      return errorResponse('Equipment is inactive', 400);
    }

    if (validated.technicianId) {
      const technician = await prisma.employee.findUnique({
        where: { id: validated.technicianId },
        select: { companyId: true, isActive: true },
      });

      if (!technician || technician.companyId !== session.user.companyId || !technician.isActive) {
        return errorResponse('Invalid technician', 400);
      }
    }

    // Create work order
    const workOrder = await prisma.workOrder.create({
      data: {
        equipmentId: validated.equipmentId,
        issue: validated.issue,
        downtimeStart: new Date(validated.downtimeStart),
        downtimeEnd: validated.downtimeEnd ? new Date(validated.downtimeEnd) : undefined,
        workDone: validated.workDone,
        partsUsed: validated.partsUsed ? JSON.stringify(validated.partsUsed) : undefined,
        partsCost: validated.partsCost,
        laborCost: validated.laborCost,
        technicianId: validated.technicianId,
        status: validated.status ?? 'OPEN',
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

    await emitWorkOrderStatusNotification(prisma, {
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      workOrder: {
        id: workOrder.id,
        issue: workOrder.issue,
        status: workOrder.status,
        equipment: {
          id: workOrder.equipment.id,
          equipmentCode: workOrder.equipment.equipmentCode,
          name: workOrder.equipment.name,
        },
      },
    });

    return successResponse(workOrder, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/work-orders error:', error);
    return errorResponse('Failed to create work order');
  }
}
