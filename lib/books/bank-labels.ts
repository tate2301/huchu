/**
 * Bank & cash's words, for client components: no database behind them
 * (a client component must never reach `@/lib/prisma`).
 */

export type AccountKindKey = "bank" | "mobile" | "cash";
export const KIND_LABEL: Record<AccountKindKey, string> = { bank: "Bank", mobile: "Mobile money", cash: "Cash" };
