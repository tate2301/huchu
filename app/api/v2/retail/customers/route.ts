import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { createCustomer, CustomerRefusal, customerInput } from "@/lib/retail/customers/create";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/**
 * Add a customer (CUS-02, W-45): `{ phone, name, marketingConsent?,
 * dateOfBirth?, area?, via? }` → 201 `{ data: { id, code, name, phone, cardNo } }`.
 * The same service the till (`via: "till"`) and a customer field's quick add
 * use. A number a live customer already has is a 409 naming them
 * (`existing`), never an update of that customer.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "create");
  if (gate) return gate;

  const parsed = customerInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  const actor = {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
  };
  try {
    const data = await prisma.$transaction((tx) => createCustomer(tx, actor, parsed.data));
    return successResponse({ data }, 201);
  } catch (error) {
    if (error instanceof CustomerRefusal) {
      if (!error.existing) return fieldErrorResponse(error.message, error.fieldErrors, error.status);
      markActivityFailed();
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors, ...(error.existing ? { existing: error.existing } : {}) },
        { status: error.status },
      );
    }
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    throw error;
  }
}
