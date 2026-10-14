import type { BadgeTone } from "@corelithzw/react";

/** A payment's status, in the portal's words. */
export const PAYMENT_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  INITIATED: { label: "Waiting on the customer", tone: "neutral" },
  PENDING: { label: "Not confirmed", tone: "warn" },
  PAID: { label: "Paid", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/** The ways a customer pays outside a gateway, which an operator records by hand. */
export const MANUAL_METHODS = ["EcoCash", "InnBucks", "OneMoney", "Bank transfer", "Cash"] as const;

/** How a payment was made: the method a person recorded, or the gateway that took it. */
export function paymentMethod(provider: string): string {
  if (provider.startsWith("manual:")) return provider.slice("manual:".length);
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
