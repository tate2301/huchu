/**
 * What the till needs to know about where it stands, read once a sign-in.
 *
 * The till and the shop are the paired device's, so there is no site or register
 * to pick. Licence hours ride here so the till can stop 18+ products itself,
 * offline too, before the server refuses them. The approvers are the names a
 * manager picks from when a discount or a refund needs a yes; never an email.
 */

import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { canRetailRoleDo } from "@/lib/retail/permissions";
import { getRetailTenderPolicy } from "@/lib/retail/tender-policy";
import { DEVICE_KIND_LABEL } from "@/lib/retail/till-device";
import { requireLiveTillDevice } from "@/lib/retail/till-device-server";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!canAccessPosPortal(session.user.role)) {
    return errorResponse("POS access denied", 403);
  }

  const device = await requireLiveTillDevice();
  if (!device || device.companyId !== session.user.companyId) {
    return errorResponse("This device is not a till. Pair it first.", 403);
  }

  const [licenceHours, people, tenderPolicy, returnables] = await Promise.all([
    prisma.retailLicenceHours.findMany({
      where: { companyId: device.companyId, siteId: device.register.siteId },
      orderBy: { weekday: "asc" },
      select: { weekday: true, alcoholFrom: true, alcoholUntil: true },
    }),
    prisma.user.findMany({
      where: { companyId: device.companyId, isActive: true, password: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, image: true },
    }),
    // The tender rules the checkout enforces. `retail.setup` is a permission no
    // cashier holds, so they ride on the request the till already makes.
    getRetailTenderPolicy(device.companyId),
    // What empties can come back as: each deposit the shop charges, and what carries it.
    prisma.product.findMany({
      where: { companyId: device.companyId, isActive: true, archivedAt: null, returnable: true, depositAmount: { not: null } },
      orderBy: { name: "asc" },
      select: { name: true, depositAmount: true },
    }),
  ]);

  const deposits = new Map<string, string[]>();
  for (const product of returnables) {
    const value = toNumberOrZero(product.depositAmount).toFixed(2);
    deposits.set(value, [...(deposits.get(value) ?? []), product.name]);
  }

  return successResponse({
    data: {
      till: { id: device.register.id, name: device.register.name, code: device.register.code },
      site: device.register.site,
      company: device.company.name,
      device: { kind: DEVICE_KIND_LABEL[device.kind], pairedAt: device.pairedAt, pairedBy: device.pairedBy.name },
      licenceHours,
      deposits: [...deposits.entries()]
        .map(([value, products]) => ({ value: Number(value), products }))
        .sort((left, right) => left.value - right.value),
      approvers: people
        .filter((person) => canRetailRoleDo(person.role, "retail.sell", "approve"))
        .map(({ id, name, image, role }) => ({ id, name, image, role })),
      rules: {
        requiredReferenceTenders: tenderPolicy.requiredReferenceTenders,
        minReferenceLength: tenderPolicy.minReferenceLength,
      },
    },
  });
}
