/**
 * The caller's own till PIN, as the till needs to know it (80-admin 4.1).
 *
 * Read `lib/retail/till-pin.ts` first — it carries the threat model. A PIN is
 * issued from People, never set here; the person chooses their own with
 * `POST ./change`. Nothing here ever returns a PIN.
 *
 * `retail.sell` `view`: the matrix answers whether this person may be at a
 * till at all; the row is always the caller's own.
 */

import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const record = await prisma.retailTillPin.findFirst({
    where: { userId: session.user.id, companyId: session.user.companyId },
    // `pinHash` is not in this list on purpose, and must never be.
    select: { lockedAt: true, mustChange: true, lastUnlockedAt: true },
  });

  return successResponse({
    data: {
      hasPin: Boolean(record),
      mustChange: record?.mustChange ?? false,
      locked: Boolean(record?.lockedAt),
      lastUnlockedAt: record?.lastUnlockedAt?.toISOString() ?? null,
    },
  });
}
