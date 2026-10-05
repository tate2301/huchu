import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

/**
 * Whether this role reads every cashier's sales and drawers.
 *
 * Cash control does. A cashier's Sales and Shifts items are "own"
 * (00-foundations 5.3.4): the same pages, scoped by their server to the rows
 * the cashier rang up or opened, and someone else's row answers as missing.
 */
export function readsEveryCashier(role: string | null | undefined): boolean {
  return canRetailRoleDo(role, "retail.cash-control", "view");
}

/**
 * The cashier a sales or shifts read is limited to, or undefined for all.
 *
 * Whatever a reader limited to their own rows asks for (`scope`, another
 * `cashierId`, `all`), they get their own. Everyone else gets the filter they
 * asked for: `scope=mine` or `cashierId=me` is themselves, `all` or nothing
 * is everyone.
 */
export function cashierFilterFor(args: {
  role: string | null | undefined;
  userId: string;
  scope?: string | null;
  cashierId?: string | null;
}): string | undefined {
  if (!readsEveryCashier(args.role)) return args.userId;
  if (args.scope === "mine") return args.userId;
  if (!args.cashierId || args.cashierId === "all") return undefined;
  return args.cashierId === "me" ? args.userId : args.cashierId;
}
