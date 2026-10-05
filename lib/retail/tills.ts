import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getRetailSetupProfile } from "@/lib/retail/setup-profile";

/**
 * Adding a till: a `RetailRegister` with the next `TILL-<n>` code, at the
 * shop's default site (the first active one when no default is set).
 *
 * The one create service for a till; the inline "New till" panel (`till`
 * lookup) runs it, and so will the Tills and devices sheet.
 */

export class TillNameTaken extends Error {
  constructor(name: string) {
    super(`There is already a till called ${name}.`);
    this.name = "TillNameTaken";
  }
}

export class NoSiteForTill extends Error {
  constructor() {
    super("Add a site before a till.");
    this.name = "NoSiteForTill";
  }
}

const TILL_CODE = /^TILL-(\d+)$/i;

/** "TILL-1", "TILL-2", "REG-0001" → the code after the highest TILL-<n>. */
export function nextTillCode(codes: readonly string[]): string {
  const highest = codes.reduce((max, code) => {
    const match = TILL_CODE.exec(code.trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `TILL-${highest + 1}`;
}

async function defaultSiteId(companyId: string): Promise<string | null> {
  const profile = await getRetailSetupProfile(companyId);
  if (profile.defaultSiteId) {
    const site = await prisma.site.findFirst({
      where: { id: profile.defaultSiteId, companyId, isActive: true },
      select: { id: true },
    });
    if (site) return site.id;
  }
  const first = await prisma.site.findFirst({
    where: { companyId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

export async function createRetailTill(companyId: string, rawName: string) {
  const name = rawName.trim();
  const siteId = await defaultSiteId(companyId);
  if (!siteId) throw new NoSiteForTill();

  const taken = await prisma.retailRegister.findFirst({
    where: { companyId, isActive: true, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) throw new TillNameTaken(name);

  // The code is unique per company; two people adding at once race for it.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.retailRegister.findMany({ where: { companyId }, select: { code: true } });
    try {
      return await prisma.retailRegister.create({
        data: { companyId, siteId, name, code: nextTillCode(existing.map((row) => row.code)), isActive: true },
        select: { id: true, code: true, name: true, siteId: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("The till was not added. Try again.");
}
