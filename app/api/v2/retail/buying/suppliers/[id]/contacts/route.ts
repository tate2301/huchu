import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { addContact, contactFieldErrors, contactInput } from "@/lib/retail/buying/suppliers";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/**
 * "Add a contact" (W-29): `{ name, role?, phone?, email?, sends }`.
 * `retail.suppliers:update` (owner, manager, bookkeeper). 201 `{ data: Contact }`;
 * 400 under the sheet's fields ("Add a phone or an email so we can reach them.").
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const parsed = contactInput.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) return fieldErrorResponse("Validation failed", contactFieldErrors(parsed.error));

  const actor = buyingActor(session);
  try {
    const data = await prisma.$transaction((tx) => addContact(tx, actor, path.data.id, parsed.data));
    return successResponse({ data }, 201);
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/suppliers/[id]/contacts");
  }
}
