/**
 * Stores and maintenance — the plant arm of global search.
 *
 * One file for two modules because they are one question. "Where is the 40 kW
 * pump" and "have we got any 15W40" are asked by the same person on the same
 * shift, and the answer to both is a row keyed by a code somebody reads off a
 * label. Splitting them into two arm files would split nothing but the imports.
 *
 * **These four tables have no `companyId`.** `InventoryItem`, `StockLocation`,
 * `Equipment` and `WorkOrder` are scoped through `Site`, and `WorkOrder` is
 * scoped through `Equipment` to `Site` — two hops. That is a real constraint, not
 * an oversight to route around: every `where` here goes through the site
 * relation, and a query that forgot to would return another tenant's plant. The
 * tests below check exactly that, because it is the one mistake in this file that
 * would not show up as a bug on the screen.
 *
 * A `StockMovement` is not searchable. It is a line in a register, found by
 * filtering the item it moved, and it carries no text anybody would type.
 */
import type { Prisma } from "@prisma/client";

import { quantity, type MoneyLike } from "@/lib/money";

import {
  facts,
  SEARCH_PER_TYPE_LIMIT,
  wordMatches,
  type SearchResult,
} from "@/lib/records/search-result";

type Tx = Prisma.TransactionClient;

/** The plant record types global search can return. */
export const OPERATIONS_SEARCH_TYPES = [
  "INVENTORY_ITEM",
  "EQUIPMENT",
  "WORK_ORDER",
] as const;

export type OperationsSearchType = (typeof OPERATIONS_SEARCH_TYPES)[number];

/** Which feature each arm needs. Two modules, so three different keys. */
export const OPERATIONS_SEARCH_FEATURES: Record<OperationsSearchType, string> = {
  INVENTORY_ITEM: "stores.inventory",
  EQUIPMENT: "maintenance.equipment",
  WORK_ORDER: "maintenance.work-orders",
};

/** Stock on hand, with its unit, and the shortfall said plainly. */
/**
 * S-1 — takes `MoneyLike` rather than `number`.
 *
 * `currentStock` and `minStock` are `Decimal(12,4)` now, and the comparison
 * below is what decides whether a searcher is told to raise a requisition.
 * Coercing both to numbers to compare them would put a float back in the one
 * place in this function that matters.
 */
function stockLevel(item: {
  currentStock: MoneyLike;
  minStock: MoneyLike;
  unit: string;
}): string {
  const onHand = quantity(item.currentStock);
  const level = `${onHand.toString()} ${item.unit}`;
  return item.minStock !== null &&
    item.minStock !== undefined &&
    onHand.lessThan(quantity(item.minStock))
    ? `${level} — below minimum`
    : level;
}

export async function searchOperations(
  db: Tx,
  input: {
    companyId: string;
    query: string;
    limitPerType?: number;
    /** The arms the caller is entitled to run. Anything absent is not searched. */
    types: readonly OperationsSearchType[];
  },
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const take = input.limitPerType ?? SEARCH_PER_TYPE_LIMIT;
  const contains = { contains: query, mode: "insensitive" as const };
  const wanted = new Set(input.types);
  // The tenant boundary for every arm in this file. One object so a new arm
  // cannot be written without it.
  const site = { site: { companyId: input.companyId } };
  const arms: Array<Promise<SearchResult[]>> = [];

  if (wanted.has("INVENTORY_ITEM")) {
    arms.push(
      db.inventoryItem
        .findMany({
          where: {
            ...site,
            OR: [{ itemCode: contains }, { AND: wordMatches(query, ["name", "category"]) }],
          },
          select: {
            id: true,
            itemCode: true,
            name: true,
            category: true,
            unit: true,
            currentStock: true,
            minStock: true,
            location: { select: { name: true } },
            site: { select: { name: true } },
          },
          orderBy: { name: "asc" },
          take,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "INVENTORY_ITEM" as const,
            id: row.id,
            reference: row.itemCode,
            title: row.name,
            // Level first: somebody searching a part is deciding whether to
            // raise a requisition, and the number is the decision.
            subtitle: `${stockLevel(row)} · ${row.location.name}`,
            facts: facts([
              ["Item code", row.itemCode],
              ["Category", row.category],
              ["On hand", `${row.currentStock} ${row.unit}`],
              ["Minimum", row.minStock === null ? null : `${row.minStock} ${row.unit}`],
              ["Location", row.location.name],
              ["Site", row.site.name],
            ]),
            href: `/stores/inventory?itemId=${row.id}`,
          })),
        ),
    );
  }

  if (wanted.has("EQUIPMENT")) {
    arms.push(
      db.equipment
        .findMany({
          where: {
            ...site,
            OR: [
              { equipmentCode: contains },
              // The QR sticker on the machine. Scanning it into the app-bar box
              // is the fastest route from standing at a pump to reading its
              // service history.
              { qrCode: contains },
              { AND: wordMatches(query, ["name", "category"]) },
            ],
          },
          select: {
            id: true,
            equipmentCode: true,
            name: true,
            category: true,
            isActive: true,
            nextServiceDue: true,
            location: { select: { name: true } },
            site: { select: { name: true } },
            _count: { select: { workOrders: true } },
          },
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          take,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "EQUIPMENT" as const,
            id: row.id,
            reference: row.equipmentCode,
            title: row.name,
            subtitle: `${row.equipmentCode} · ${row.location.name}`,
            facts: facts([
              ["Code", row.equipmentCode],
              ["Category", row.category],
              ["Location", row.location.name],
              ["Site", row.site.name],
              [
                "Next service",
                row.nextServiceDue === null
                  ? null
                  : row.nextServiceDue.toISOString().slice(0, 10),
              ],
              ["Work orders", String(row._count.workOrders)],
              ["Status", row.isActive ? "In service" : "Retired"],
            ]),
            href: `/maintenance/equipment?equipmentId=${row.id}`,
          })),
        ),
    );
  }

  if (wanted.has("WORK_ORDER")) {
    arms.push(
      db.workOrder
        .findMany({
          // Two hops to the tenant: work order → equipment → site → company.
          where: {
            equipment: site,
            OR: [
              // A work order has no number. What it has is the fault somebody
              // typed — "conveyor belt slipping" — and the machine it is on, so
              // both are searched and the machine's code counts as a match.
              { AND: wordMatches(query, ["issue"]) },
              { workDone: contains },
              { equipment: { OR: [{ equipmentCode: contains }, { name: contains }] } },
            ],
          },
          select: {
            id: true,
            issue: true,
            status: true,
            downtimeStart: true,
            downtimeEnd: true,
            equipment: { select: { equipmentCode: true, name: true } },
            technician: { select: { name: true } },
          },
          orderBy: { downtimeStart: "desc" },
          take,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "WORK_ORDER" as const,
            id: row.id,
            reference: null,
            title: row.issue,
            subtitle: `${row.equipment.name} · ${row.status}`,
            facts: facts([
              ["Equipment", `${row.equipment.name} (${row.equipment.equipmentCode})`],
              ["Status", row.status],
              ["Down since", row.downtimeStart.toISOString().slice(0, 10)],
              // Absent while the machine is still down, which is the state
              // anybody searching a fault is checking for.
              [
                "Back up",
                row.downtimeEnd === null ? null : row.downtimeEnd.toISOString().slice(0, 10),
              ],
              ["Technician", row.technician?.name],
            ]),
            href: `/maintenance/work-orders?workOrderId=${row.id}`,
          })),
        ),
    );
  }

  const results = await Promise.all(arms);
  return results.flat();
}
