import type { Prisma, RetailPurchaseOrderStatus } from "@prisma/client";

import { quantity, toNumberOrZero, type MoneyLike } from "@/lib/money";

/**
 * The rules of a purchase order, apart from the routes that apply them.
 *
 * An order is a promise from a supplier. Deliveries fill it line by line; a
 * delivery that comes short leaves the rest owed, and the order waits for it
 * until either it arrives or the shop stops waiting and closes the order. What
 * has been delivered is a fact about stock on the shelf, so nothing here lets
 * an edit undo it.
 */

export class OrderRefused extends Error {}

type LineQuantities = { quantity: MoneyLike; receivedQuantity: MoneyLike };

/** How much of a line is still to come. Never negative. */
export function outstanding(line: LineQuantities): Prisma.Decimal {
  const left = quantity(line.quantity).minus(quantity(line.receivedQuantity));
  return left.isNegative() ? quantity(0) : left;
}

/**
 * Where an order stands, from its lines.
 *
 * Read off the quantities rather than kept by hand: nothing received is a
 * draft, everything received is received, anything between is part delivered.
 * A closed order stays closed whatever arrives against it later — the shop has
 * said it is not waiting.
 */
export function orderStatusFor(
  lines: readonly LineQuantities[],
  closed: boolean,
): RetailPurchaseOrderStatus {
  if (closed) return "CLOSED";
  const anyReceived = lines.some((line) => quantity(line.receivedQuantity).greaterThan(0));
  if (!anyReceived) return "DRAFT";
  return lines.every((line) => outstanding(line).isZero()) ? "RECEIVED" : "PARTIAL";
}

/** Whether a delivery can still be booked against an order in this state. */
export function isOpenForDelivery(status: RetailPurchaseOrderStatus) {
  return status === "DRAFT" || status === "PARTIAL";
}

export type ExistingOrderLine = {
  id: string;
  itemName: string;
  quantity: MoneyLike;
  receivedQuantity: MoneyLike;
};

export type IncomingOrderLine<T> = T & { id?: string | null; quantity: number };

/**
 * Turn an edited list of lines into updates, creates and removals that keep
 * what has been delivered.
 *
 * The order form sends every line back. Lines it names by id are updated in
 * place — the received count rides along untouched — lines with no id are
 * new, and lines it leaves out are removed. A line that has had anything
 * delivered against it cannot be removed, and its quantity cannot go below
 * what came: both would say the shelf holds less than it does.
 */
export function planOrderLineEdits<T>(
  existing: readonly ExistingOrderLine[],
  incoming: readonly IncomingOrderLine<T>[],
) {
  const byId = new Map(existing.map((line) => [line.id, line]));
  const kept = new Set<string>();
  const update: Array<{ id: string; line: IncomingOrderLine<T> }> = [];
  const create: Array<IncomingOrderLine<T>> = [];

  for (const line of incoming) {
    if (!line.id) {
      create.push(line);
      continue;
    }
    const current = byId.get(line.id);
    if (!current) throw new OrderRefused("One of the lines is not on this order.");
    if (kept.has(line.id)) throw new OrderRefused(`${current.itemName} is on the order twice.`);
    kept.add(line.id);
    const received = quantity(current.receivedQuantity);
    if (quantity(line.quantity).lessThan(received)) {
      throw new OrderRefused(
        `${toNumberOrZero(received)} of ${current.itemName} have already come; the order cannot ask for fewer.`,
      );
    }
    update.push({ id: line.id, line });
  }

  const remove: string[] = [];
  for (const line of existing) {
    if (kept.has(line.id)) continue;
    if (quantity(line.receivedQuantity).greaterThan(0)) {
      throw new OrderRefused(`${line.itemName} has been delivered and cannot come off the order.`);
    }
    remove.push(line.id);
  }

  return { update, create, remove };
}

export type DeliveryLine = { inventoryItemId: string; quantity: number; purchaseOrderLineId?: string | null };

export type MatchableOrderLine = ExistingOrderLine & { inventoryItemId: string | null };

/**
 * Which order line each delivered line fills, and how much is left owing.
 *
 * A delivered line names its order line when the form knew it; otherwise it
 * fills the first line of the same product that still has something owing.
 * A line that matches nothing — a product the order did not have — is stock
 * all the same, and is booked in without touching the order. Delivering more
 * than is owed on a line is refused: the supplier is invoicing for the extra,
 * and the order is the shop's record of what it asked for.
 */
export function matchDeliveryToOrder(
  orderLines: readonly MatchableOrderLine[],
  delivered: readonly DeliveryLine[],
): Array<string | null> {
  const owing = new Map(orderLines.map((line) => [line.id, outstanding(line)]));

  return delivered.map((line) => {
    const target = line.purchaseOrderLineId
      ? orderLines.find((orderLine) => orderLine.id === line.purchaseOrderLineId)
      : orderLines.find(
          (orderLine) =>
            orderLine.inventoryItemId === line.inventoryItemId && owing.get(orderLine.id)!.greaterThan(0),
        );
    if (line.purchaseOrderLineId && !target) {
      throw new OrderRefused("One of the delivered lines is not on this order.");
    }
    if (!target) return null;

    const left = owing.get(target.id)!;
    if (quantity(line.quantity).greaterThan(left)) {
      throw new OrderRefused(
        left.isZero()
          ? `Nothing more of ${target.itemName} is owed on this order.`
          : `Only ${toNumberOrZero(left)} of ${target.itemName} ${left.equals(1) ? "is" : "are"} still to come on this order.`,
      );
    }
    owing.set(target.id, left.minus(line.quantity));
    return target.id;
  });
}
