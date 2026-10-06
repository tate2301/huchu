import type { MoneyLike } from "@/lib/money";

import type { FigureBill, FigureDelivery, FigureOrder } from "./figures";

/**
 * What each supplier's figures are computed from (40-buying 3.2): its
 * orders, posted deliveries, bills and the credits against them. The figures
 * module already computes every supplier figure from these rows; the units
 * that link them to a supplier feed them here and nothing else changes:
 * orders from BUY-02 (`RetailPurchaseOrder.vendorId`, migration B), posted
 * deliveries from BUY-06 (migration E), bills, payments and credits from
 * BUY-07 (migration F) and return credits from BUY-09. Until then no order,
 * delivery or bill names a supplier, so every supplier has none: Open and
 * Owed read 0, Last delivery "—", Fill rate "No deliveries yet".
 */
export type SupplierActivity = {
  orders: FigureOrder[];
  deliveries: FigureDelivery[];
  bills: FigureBill[];
  credits: { payments: MoneyLike[]; returns: MoneyLike[] };
};

export const NO_ACTIVITY: SupplierActivity = { orders: [], deliveries: [], bills: [], credits: { payments: [], returns: [] } };

/** Each supplier's activity, by id. */
export async function supplierActivity(companyId: string, vendorIds: string[]): Promise<Map<string, SupplierActivity>> {
  void companyId;
  return new Map(vendorIds.map((id) => [id, NO_ACTIVITY]));
}
