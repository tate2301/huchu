import type { GoldCompanyConfig, PrismaClient, Prisma } from "@prisma/client"

export async function getGoldConfig(
  db: PrismaClient | Prisma.TransactionClient,
  companyId: string,
): Promise<GoldCompanyConfig> {
  return db.goldCompanyConfig.upsert({
    where: { companyId },
    create: { companyId },
    update: {},
  })
}
