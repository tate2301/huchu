import { prisma } from "@/lib/prisma";

import { birthdayBonuses } from "./birthday";
import { loyaltyToday } from "./dates";
import { expirePoints } from "./expire";

/** The retail worker's loyalty jobs (CUS-01), over every company with something to do. */

export async function expirePointsForAll(now: Date = new Date()): Promise<string> {
  const today = loyaltyToday(now);
  const companies = await prisma.retailPointsEntry.findMany({ distinct: ["companyId"], select: { companyId: true } });
  let customers = 0;
  let points = 0;
  for (const { companyId } of companies) {
    const done = await expirePoints(companyId, today);
    customers += done.customers;
    points += done.points;
  }
  return `${points} points expired for ${customers} customers`;
}

export async function birthdayBonusesForAll(now: Date = new Date()): Promise<string> {
  const today = loyaltyToday(now);
  const companies = await prisma.customer.findMany({
    where: { dateOfBirth: { not: null } },
    distinct: ["companyId"],
    select: { companyId: true },
  });
  let given = 0;
  for (const { companyId } of companies) given += await birthdayBonuses(companyId, today);
  return `${given} birthday bonuses`;
}
