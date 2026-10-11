/**
 * The sale on the counter, kept on the device as it changes, so a reload, a
 * crashed browser or a power cut puts it back. One per till and person: a
 * cashier never finds someone else's sale. A sale kept longer than a shift
 * is not theirs to finish, so it is let go.
 */

import { del, get, set } from "idb-keyval";

import type { CartItem, CustomerLookupResult, PaymentRow } from "./types";

export type OpenSale = {
  cart: CartItem[];
  customerName: string;
  selectedCustomer: CustomerLookupResult | null;
  loyaltyRedemptionPoints: string;
  payments: PaymentRow[];
  orderDiscountAmount: string;
  selectedPromotionId: string;
  idChecked: boolean;
  heldAs: string | null;
};

type Kept = OpenSale & { keptAt: number };

const KEPT_FOR_MS = 12 * 60 * 60 * 1000;

export function openSaleKey(tillId: string, userId: string) {
  return `till-open-sale:${tillId}:${userId}`;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isLine = (value: unknown) =>
  isObject(value) &&
  typeof value.catalogItemId === "string" &&
  typeof value.name === "string" &&
  typeof value.quantity === "number" &&
  typeof value.unitPrice === "number" &&
  Array.isArray(value.priceBreaks);
const isPayment = (value: unknown) => isObject(value) && typeof value.tenderType === "string" && typeof value.amount === "string";

/** A kept sale as it was stored, or null when it is not one, is empty, or is too old to be this shift's. */
export function readOpenSale(value: unknown, now = Date.now()): OpenSale | null {
  if (!isObject(value)) return null;
  const { keptAt, ...sale } = value;
  if (typeof keptAt !== "number" || now - keptAt > KEPT_FOR_MS) return null;
  if (!Array.isArray(sale.cart) || !sale.cart.length || !sale.cart.every(isLine)) return null;
  if (!Array.isArray(sale.payments) || !sale.payments.every(isPayment)) return null;
  if (
    typeof sale.customerName !== "string" ||
    typeof sale.loyaltyRedemptionPoints !== "string" ||
    typeof sale.orderDiscountAmount !== "string" ||
    typeof sale.selectedPromotionId !== "string" ||
    typeof sale.idChecked !== "boolean" ||
    !(sale.heldAs === null || typeof sale.heldAs === "string") ||
    !(sale.selectedCustomer === null || (isObject(sale.selectedCustomer) && typeof sale.selectedCustomer.id === "string"))
  ) {
    return null;
  }
  return sale as OpenSale;
}

export async function loadOpenSale(key: string): Promise<OpenSale | null> {
  try {
    return readOpenSale(await get(key));
  } catch {
    return null;
  }
}

/** Keeps the sale, or lets it go when it has no lines. */
export async function keepOpenSale(key: string, sale: OpenSale | null): Promise<void> {
  try {
    if (sale?.cart.length) await set(key, { ...sale, keptAt: Date.now() } satisfies Kept);
    else await del(key);
  } catch {
    // Storage blocked: the sale lives as long as the page, as it always did.
  }
}
