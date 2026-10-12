import { money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { loyaltyToday } from "@/lib/retail/loyalty/dates";
import { loadLoyaltySettings } from "@/lib/retail/loyalty/settings";

import type { PosCustomer } from "./pos-customer";
import { customerFigures, searchCustomerIds, type CustomerFigures } from "./stats";

export type { PosCustomer } from "./pos-customer";

/** 18 or over on `today` (`YYYY-MM-DD`). */
export function isAdult(dateOfBirth: Date | null, today: string): boolean | null {
  if (!dateOfBirth) return null;
  const born = dateOfBirth.toISOString().slice(0, 10);
  const eighteenth = `${String(Number(born.slice(0, 4)) + 18).padStart(4, "0")}${born.slice(4)}`;
  return eighteenth <= today;
}

export function toPosCustomer(
  row: CustomerFigures,
  settings: { enabled: boolean; spendFrom: number },
  today: string,
  lastSale: PosCustomer["lastSale"] = null,
): PosCustomer {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    cardNo: row.cardNo,
    tier: row.tier ?? "",
    points: row.points,
    worth: row.worth,
    canSpend: settings.enabled && row.points > 0 && row.points >= settings.spendFrom,
    spendFrom: settings.spendFrom,
    adult: isAdult(row.dateOfBirth, today),
    staff: row.staff,
    priceListId: row.priceListId,
    account: null,
    lastSale,
  };
}

/**
 * Each customer's last sale at the shop, whoever rang it ("SALE-005080,
 * US$21.68 today"): what they paid, deposits included. A voided sale did not happen.
 */
async function lastSales(companyId: string, ids: string[]): Promise<Map<string, NonNullable<PosCustomer["lastSale"]>>> {
  if (ids.length === 0) return new Map();
  const sales = await prisma.retailSale.findMany({
    where: { companyId, customerId: { in: ids }, saleType: "SALE", status: { not: "VOIDED" }, postedAt: { not: null } },
    orderBy: { postedAt: "desc" },
    distinct: ["customerId"],
    select: { customerId: true, saleNo: true, totalAmount: true, depositAmount: true, postedAt: true },
  });
  return new Map(
    sales.map((sale) => [
      sale.customerId!,
      { saleNo: sale.saleNo, total: toNumberOrZero(money(sale.totalAmount).plus(money(sale.depositAmount))), at: sale.postedAt!.toISOString() },
    ]),
  );
}

/** The till's search: live customers by phone digits, card, code or name, at most `limit`. */
export async function searchPosCustomers(companyId: string, q: string, limit: number): Promise<PosCustomer[]> {
  const ids = await searchCustomerIds(companyId, q, limit);
  if (ids.length === 0) return [];
  const now = new Date();
  const settings = await loadLoyaltySettings(companyId);
  const [rows, last] = await Promise.all([customerFigures(companyId, ids, { now, settings }), lastSales(companyId, ids)]);
  const today = loyaltyToday(now);
  return rows.map((row) => toPosCustomer(row, settings, today, last.get(row.id) ?? null));
}

/** One customer as the till holds them, or null when they are not a live customer of the shop. */
export async function posCustomer(companyId: string, id: string): Promise<PosCustomer | null> {
  const now = new Date();
  const settings = await loadLoyaltySettings(companyId);
  const [[row], last] = await Promise.all([customerFigures(companyId, [id], { now, settings }), lastSales(companyId, [id])]);
  return row ? toPosCustomer(row, settings, loyaltyToday(now), last.get(id) ?? null) : null;
}
