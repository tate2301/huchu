import type { GoldCompanyConfig, PrismaClient, Prisma } from "@corelithzw/db"

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
