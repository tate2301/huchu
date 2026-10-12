/**
 * A customer as the till holds them (CUS-02), browser-safe: who they are,
 * their points and what they are worth, whether they may spend them, whether
 * they are 18 or over (null when no birthday is known), whether they are staff
 * (the price engine's Staff audience), and their last sale at the shop.
 * `account` is packet 66's.
 */
export type PosCustomer = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  cardNo: string | null;
  tier: string;
  points: number;
  worth: number;
  canSpend: boolean;
  spendFrom: number;
  adult: boolean | null;
  staff: boolean;
  priceListId: string | null;
  account: null;
  lastSale: { saleNo: string; total: number; at: string } | null;
};

/** A customer just added (or queued offline): no points, no visits yet. */
export function newPosCustomer(input: { id: string; name: string; phone: string | null; code?: string | null; cardNo?: string | null }): PosCustomer {
  return {
    id: input.id,
    code: input.code ?? null,
    name: input.name,
    phone: input.phone,
    cardNo: input.cardNo ?? null,
    tier: "",
    points: 0,
    worth: 0,
    canSpend: false,
    spendFrom: 0,
    adult: null,
    staff: false,
    priceListId: null,
    account: null,
    lastSale: null,
  };
}
