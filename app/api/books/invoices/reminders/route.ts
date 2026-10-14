import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { sendInvoiceReminders } from "@/lib/books/reminders";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ invoiceIds: z.array(z.string().uuid()).min(1).max(200) });

/** Send reminders: a person pressed the button, so the selected invoices' customers get one each. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse("Choose the invoices to remind", 400);
    return successResponse(
      await sendInvoiceReminders(prisma, { companyId: sessionResult.session.user.companyId, invoiceIds: body.data.invoiceIds }),
    );
  } catch (error) {
    console.error("[API] POST /api/books/invoices/reminders error:", error);
    return errorResponse("The reminders did not go");
  }
}
