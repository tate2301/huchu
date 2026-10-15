import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { raiseWorkOrder, WorkOrderRefused } from "@/lib/maintenance/work-orders";

/** A person raises Vane's draft work order: it opens, and the workshop is told. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const order = await raiseWorkOrder({ companyId: session.user.companyId, userId: session.user.id, role: session.user.role }, (await params).id);
    return successResponse({ id: order.id, status: order.status });
  } catch (error) {
    if (error instanceof WorkOrderRefused) return errorResponse(error.message, 409);
    console.error("[API] POST /api/work-orders/[id]/raise error:", error);
    return errorResponse("Could not raise the work order");
  }
}
