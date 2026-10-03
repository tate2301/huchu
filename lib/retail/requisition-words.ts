/**
 * The reasons a shop asks for money, said the shop's way. Client-safe: the
 * form and the list read it; `lib/retail/requisitions.ts` validates against it.
 */
export const RETAIL_REQUISITION_CATEGORIES = {
  MATERIALS: "Shop supplies",
  EQUIPMENT: "Equipment and repairs",
  TRANSPORT: "Transport",
  FUEL: "Fuel",
  AIRTIME: "Airtime and data",
  LABOUR: "Casual labour",
  OTHER: "Something else",
} as const;

export type RetailRequisitionCategory = keyof typeof RETAIL_REQUISITION_CATEGORIES;

export function requisitionCategoryLabel(category: string) {
  return RETAIL_REQUISITION_CATEGORIES[category as RetailRequisitionCategory] ?? "Something else";
}
