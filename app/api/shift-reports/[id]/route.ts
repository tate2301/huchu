import { NextRequest, NextResponse } from 'next/server';
import { validateSession, errorResponse, successResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';

// GET - Get single shift report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await params;

    const report = await prisma.shiftReport.findUnique({
      where: { id },
      include: {
        site: { select: { name: true, code: true, companyId: true } },
        section: { select: { name: true } },
        shiftGroup: { select: { id: true, name: true, code: true } },
        groupLeader: { select: { name: true, employeeId: true } },
        createdBy: { select: { name: true } },
        verifiedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        downtimeEvents: {
          include: {
            downtimeCode: { select: { description: true, code: true } },
          },
        },
      },
    });

    if (!report) {
      return errorResponse('Report not found', 404);
    }

    if (report.site.companyId !== session.user.companyId) {
      return errorResponse('Forbidden', 403);
    }

    return successResponse(report);
  } catch (error) {
    console.error('[API] GET /api/shift-reports/[id] error:', error);
    return errorResponse('Failed to fetch shift report');
  }
}

// PATCH - Update shift report or change workflow status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const { action, ...data } = body;

    const { id } = await params;

    const existing = await prisma.shiftReport.findUnique({
      where: { id },
      include: { site: { select: { companyId: true } } },
    });

    if (!existing) {
      return errorResponse('Report not found', 404);
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse('Forbidden', 403);
    }

    // Handle workflow actions
    if (action === 'submit') {
      if (existing.status !== 'DRAFT') {
        return errorResponse('Report is not in draft status', 400);
      }
      
      const updated = await prisma.shiftReport.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
        },
      });
      return successResponse(updated);
    }

    if (action === 'verify') {
      if (existing.status !== 'SUBMITTED') {
        return errorResponse('Report must be submitted first', 400);
      }
      
      if (!['MANAGER', 'SUPERADMIN'].includes(session.user.role)) {
        return errorResponse('Insufficient permissions to verify', 403);
      }
      
      const updated = await prisma.shiftReport.update({
        where: { id },
        data: {
          status: 'VERIFIED',
          verifiedById: session.user.id,
          verifiedAt: new Date(),
        },
      });
      return successResponse(updated);
    }

    if (action === 'approve') {
      if (existing.status !== 'VERIFIED') {
        return errorResponse('Report must be verified first', 400);
      }
      
      if (!['SUPERADMIN', 'MANAGER'].includes(session.user.role)) {
        return errorResponse('Insufficient permissions to approve', 403);
      }
      
      const updated = await prisma.shiftReport.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      });
      return successResponse(updated);
    }

    // Regular update (only if draft)
    if (existing.status !== 'DRAFT') {
      return errorResponse('Cannot edit a submitted report', 400);
    }

    const updated = await prisma.shiftReport.update({
      where: { id },
      data,
    });

    return successResponse(updated);
  } catch (error) {
    console.error('[API] PATCH /api/shift-reports/[id] error:', error);
    return errorResponse('Failed to update shift report');
  }
}

// DELETE - Delete shift report (only drafts)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await params;

    const existing = await prisma.shiftReport.findUnique({
      where: { id },
      include: { site: { select: { companyId: true } } },
    });

    if (!existing) {
      return errorResponse('Report not found', 404);
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse('Forbidden', 403);
    }

    if (existing.status !== 'DRAFT') {
      return errorResponse('Can only delete draft reports', 400);
    }

    await prisma.shiftReport.delete({
      where: { id },
    });

    return successResponse({ success: true, deleted: true });
  } catch (error) {
    console.error('[API] DELETE /api/shift-reports/[id] error:', error);
    return errorResponse('Failed to delete shift report');
  }
}
