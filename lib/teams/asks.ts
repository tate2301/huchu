import { verticalRate } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";

import { listSeatRequests, type SeatRequest } from "./seat-requests";
import { seatLine } from "./seats";
import { dayShort } from "./words";

/** What waits on this person in Needs you from the Teams side: an offer of ownership, a request for a seat. */
export type Asks = {
  offers: Array<{ id: string; fromName: string; workspace: string; moves: string; until: string }>;
  seats: Array<SeatRequest & { price: string }>;
};

export async function loadAsks(companyId: string, userId: string, now = new Date()): Promise<Asks> {
  const [company, offers, me] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, seatLimit: true } }),
    prisma.ownershipOffer.findMany({
      where: { companyId, status: "OPEN", expiresAt: { gt: now }, toMembership: { userId } },
      include: { fromMembership: { include: { user: { select: { name: true } } } } },
    }),
    prisma.workspaceMembership.findFirst({ where: { companyId, userId, status: "ACTIVE" }, select: { isOwner: true } }),
  ]);
  const seats = me?.isOwner ? (await listSeatRequests(prisma, companyId)).filter((r) => r.state === "open") : [];
  const line = seats.length ? await seatLine(prisma, companyId, now) : null;
  const next = line ? verticalRate(line.limit + 1) : 0;
  return {
    offers: offers.map((offer) => ({
      id: offer.id,
      fromName: offer.fromMembership.user.name,
      workspace: company.name,
      moves: `Billing moves to you, US$${verticalRate(company.seatLimit)} a month`,
      until: dayShort(offer.expiresAt),
    })),
    seats: seats.map((request) => ({ ...request, price: `US$${next} a month` })),
  };
}
