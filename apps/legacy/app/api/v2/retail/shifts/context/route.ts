import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@corelithzw/platform/api-response";
import { prisma } from "@corelithzw/db/client";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";
import { getRetailSetupProfile } from "@/lib/retail/setup-profile";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  // R-2.4. The back-office shift screen: every cashier's drawer, not your own.
  const gate = requireRetailPermission(session, "retail.cash-control", "view");
  if (gate) return gate;

  const [sites, registers, setupProfile] = await Promise.all([
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
  ]);

  const registersBySite = registers.reduce<Record<string, typeof registers>>(
    (accumulator, register) => {
      accumulator[register.siteId] = [...(accumulator[register.siteId] ?? []), register];
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
    },
  });
}
