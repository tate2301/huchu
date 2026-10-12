import type { Prisma, PrismaClient } from "@prisma/client";

import { reserveIdentifier } from "@/lib/id-generator";

/**
 * A new customer's code and card (CUS-01): "CUS-00141" off the company's
 * `RETAIL_CUSTOMER` numbers, and the card "600914000141" that follows it.
 */
export async function newCustomerNumbers(
  db: PrismaClient | Prisma.TransactionClient,
  companyId: string,
): Promise<{ code: string; cardNo: string }> {
  const code = await reserveIdentifier(db, { companyId, entity: "RETAIL_CUSTOMER" });
  const n = Number(code.split("-").pop());
  return { code, cardNo: `600914${String(n).padStart(6, "0")}` };
}
