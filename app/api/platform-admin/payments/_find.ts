import { prisma } from "@/lib/prisma";

/** The payments a bulk action names, by their reference and workspace. */
export async function paymentsByIds(ids: string[]) {
  const rows = await prisma.subscriptionPayment.findMany({
    where: { id: { in: ids } },
    select: { id: true, providerReference: true, company: { select: { name: true } } },
  });
  return rows.map((row) => ({ id: row.id, name: `${row.providerReference} from ${row.company.name}` }));
}
