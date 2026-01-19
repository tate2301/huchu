import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const workOrderSchema = z.object({
  equipmentId: z.string().uuid(),
  issueDescription: z.string().min(1).max(1000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  downtimeStarted: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  reportedBy: z.string().min(1).max(100),
  assignedTo: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get('equipmentId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const { page, limit, skip } = getPaginationParams(request);

    const where: any = {
      equipment: {
        site: { companyId: session.user.companyId },
      },
    };

    if (equipmentId) where.equipmentId = equipmentId;
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          equipment: {
            include: {
              site: { select: { name: true, code: true } },
            },
          },
        },
        orderBy: [
          { status: 'asc' }, // Open first
          { priority: 'desc' }, // High priority first
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

    // Update equipment status to DOWN if not already
    if (equipment.status !== 'DOWN') {
      await prisma.equipment.update({
        where: { id: validated.equipmentId },
        data: { status: 'DOWN' },
      });
    }

    // Create work order
    const workOrder = await prisma.workOrder.create({
      data: {
        equipmentId: validated.equipmentId,
        issueDescription: validated.issueDescription,
        priority: validated.priority,
        downtimeStarted: new Date(validated.downtimeStarted),
        reportedBy: validated.reportedBy,
        assignedTo: validated.assignedTo,
        status: 'OPEN',
        createdById: session.user.id,
      },
      include: {
        equipment: {
          include: {
            site: { select: { name: true, code: true } },
          },
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
