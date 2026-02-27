import { z } from "zod";

export const carSalesLeadStatusSchema = z.enum([
  "NEW",
  "QUALIFIED",
  "NEGOTIATION",
  "WON",
  "LOST",
  "CANCELED",
]);

export const carSalesVehicleStatusSchema = z.enum([
  "IN_STOCK",
  "RESERVED",
  "SOLD",
  "DELIVERED",
]);

export const carSalesDealStatusSchema = z.enum([
  "DRAFT",
  "QUOTED",
  "RESERVED",
  "CONTRACTED",
  "DELIVERY_READY",
  "DELIVERED",
  "CANCELED",
  "VOIDED",
]);

export const carSalesPaymentMethodSchema = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "CARD",
  "MOBILE_MONEY",
]);

export const carSalesPaymentStatusSchema = z.enum(["POSTED", "VOIDED", "REFUNDED"]);

export function computeDealAmounts(input: {
  quoteAmount: number;
  discountAmount?: number;
  taxAmount?: number;
  paidAmount?: number;
}) {
  const quoteAmount = Number(input.quoteAmount) || 0;
  const discountAmount = Number(input.discountAmount) || 0;
  const taxAmount = Number(input.taxAmount) || 0;
  const paidAmount = Number(input.paidAmount) || 0;
  const netAmount = Math.max(quoteAmount - discountAmount + taxAmount, 0);
  const balanceAmount = Math.max(netAmount - paidAmount, 0);
  return {
    quoteAmount,
    discountAmount,
    taxAmount,
    paidAmount,
    netAmount,
    balanceAmount,
  };
}
