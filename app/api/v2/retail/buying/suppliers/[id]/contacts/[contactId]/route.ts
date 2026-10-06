import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { contactFieldErrors, contactInput, removeContact, updateContact } from "@/lib/retail/buying/suppliers";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../../_helpers";

const contactParams = z.object({ id: z.string().uuid("must be an id"), contactId: z.string().uuid("must be an id") });
type Params = { params: Promise<{ id: string; contactId: string }> };

/** "Change <name>" (5.12 edit): the same fields as adding them. `retail.suppliers:update`. 404 "Contact not found". */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, contactParams);
  if (path.response) return path.response;

  const parsed = contactInput.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) return fieldErrorResponse("Validation failed", contactFieldErrors(parsed.error));

  const actor = buyingActor(session);
  try {
    const data = await prisma.$transaction((tx) => updateContact(tx, actor, path.data.id, path.data.contactId, parsed.data));
    return successResponse({ data });
  } catch (error) {
    return buyingFailure(error, "PATCH /api/v2/retail/buying/suppliers/[id]/contacts/[contactId]");
  }
}

/** "Remove" (ask `removecontact`): kept for what was sent to them; the rep's removal clears the rep. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, contactParams);
  if (path.response) return path.response;

  const actor = buyingActor(session);
  try {
    await prisma.$transaction((tx) => removeContact(tx, actor, path.data.id, path.data.contactId));
    return successResponse({ data: { id: path.data.contactId } });
  } catch (error) {
    return buyingFailure(error, "DELETE /api/v2/retail/buying/suppliers/[id]/contacts/[contactId]");
  }
}
