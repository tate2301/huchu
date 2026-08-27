import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";
import { getRetailSetupProfile } from "@/lib/retail/setup-profile";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { getRetailTenderPolicy } from "@/lib/retail/tender-policy";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!canAccessPosPortal(session.user.role)) {
    return errorResponse("POS access denied", 403);
  }

  const [sites, registers, setupProfile, tenderPolicy] = await Promise.all([
    prisma.site.findMany({
      where: {
        companyId: session.user.companyId,
        isActive: true,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.retailRegister.findMany({
      where: {
        companyId: session.user.companyId,
        isActive: true,
      },
      orderBy: [{ siteId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, siteId: true },
    }),
    getRetailSetupProfile(session.user.companyId),
    /**
     * The tender rules the checkout screen enforces, carried here because this
     * is the request the till already makes.
     *
     * They used to be fetched separately from `/api/v2/retail/setup/tender-policy`,
     * which is gated on `retail.setup` `view` — a permission no cashier holds.
     * It returned 403 on every till on every load, the query failed silently,
     * and checkout fell back to hard-coded defaults, so a shop's configured
     * reference requirements were accepted in the back office and then ignored
     * at the counter.
     *
     * `pos/till-settings` also carries them and is correctly gated, but it runs
     * ten queries to build a settings screen; making the sell path wait on that
     * would trade a silent bug for a slow till. This is one extra read on a
     * request that was already in flight.
     */
    getRetailTenderPolicy(session.user.companyId),
  ]);

  const registersBySite = registers.reduce<Record<string, typeof registers>>(
    (accumulator, register) => {
      accumulator[register.siteId] = [
        ...(accumulator[register.siteId] ?? []),
        register,
      ];
      return accumulator;
    },
    {},
  );

  return successResponse({
    data: {
      defaultSiteId: setupProfile.defaultSiteId,
      defaultRegisterId: setupProfile.defaultRegisterId,
      sites: sites.map((site) => ({
        ...site,
        registers: registersBySite[site.id] ?? [],
      })),
      rules: {
        requiredReferenceTenders: tenderPolicy.requiredReferenceTenders,
        minReferenceLength: tenderPolicy.minReferenceLength,
      },
    },
  });
}
