/**
 * Composable Prisma include/select fragments for the Gold module.
 *
 * Each API route used to hand-roll the same `{ goldPour: { select: { id,
 * pourBarId, pourDate, grossWeight, goldPriceUsdPerGram, valueUsd, site } } }`
 * block — 6 routes had subtly different variations of the same shape.
 * Centralising the fragments lets routes compose larger includes from
 * named building blocks without each file re-stating the canonical
 * minimum shape.
 *
 * Each fragment is `as const`-typed so callers get full inference and
 * Prisma's type generation flows through to the returned row shapes.
 *
 * Owner: `gold-domain-backend` (lib/gold/**). When adding a new fragment,
 * keep the canonical core minimal — if only one route needs an extra
 * field, do `{ ...goldPourCore.select, extraField: true }` at the call
 * site rather than adding the field to the core.
 */

/**
 * The minimum `goldPour` row shape that every route serializing a pour
 * needs: pour identity, weight, value, and the owning site label. Extend
 * at the call site for routes that need allocation/expense context.
 */
export const goldPourCore = {
  select: {
    id: true,
    pourBarId: true,
    pourDate: true,
    grossWeight: true,
    goldPriceUsdPerGram: true,
    valueUsd: true,
    site: { select: { id: true, name: true, code: true } },
  },
} as const;

/**
 * `goldShiftAllocation` shape used by detail routes that need to expose the
 * worker/company split and the parent shift report. Routes that only need
 * the totals can pass `select: { totalWeight: true, netWeight: true }` directly.
 */
export const goldShiftAllocationCore = {
  select: {
    id: true,
    totalWeight: true,
    netWeight: true,
    workerShareWeight: true,
    companyShareWeight: true,
    expenses: { select: { id: true, type: true, weight: true } },
    shiftReport: {
      select: {
        id: true,
        groupLeader: { select: { name: true } },
      },
    },
  },
} as const;

/**
 * Extended `goldPour` shape with the embedded shift allocation — the form
 * receipts and dispatches use when they need to show worker shares
 * alongside the pour.
 */
export const goldPourWithAllocation = {
  select: {
    ...goldPourCore.select,
    createdAt: true,
    createdBy: { select: { id: true, name: true } },
    goldShiftAllocation: goldShiftAllocationCore,
  },
} as const;

/**
 * `goldDispatch` embedded shape used by the receipts include (when a
 * receipt arrives via a dispatch, we surface dispatch identity + the
 * underlying pour with full allocation context).
 */
export const goldDispatchEmbedded = {
  include: {
    goldPour: goldPourWithAllocation,
  },
} as const;

/**
 * Batches collection shape used inside the receipts include: each batch
 * carries the contributing pour with its site, and the receipt's split of
 * grams/value.
 */
export const goldBuyerReceiptBatches = {
  select: {
    id: true,
    grams: true,
    valueUsd: true,
    goldPriceUsdPerGram: true,
    notes: true,
    createdAt: true,
    goldPour: {
      select: {
        id: true,
        pourBarId: true,
        grossWeight: true,
        pourDate: true,
        site: { select: { id: true, name: true, code: true } },
      },
    },
  },
  orderBy: { createdAt: "asc" },
} as const;
