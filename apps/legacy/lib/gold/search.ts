/**
 * Gold's arm of global search.
 *
 * The app-bar box searched the CRM, the school and — as of this branch — People.
 * On a gold mine that meant it found the workforce and nothing the mine actually
 * does: a supervisor holding a printed dispatch note could not type the seal
 * number into the one search box on the page.
 *
 * Three arms, because three things get looked up by number: a pour, a purchase
 * from a seller, and a dispatch to a buyer. Not the ledger: a `GoldLedgerEntry`
 * is a line in an import, tens of thousands per tenant, and it is found by
 * filtering a register rather than by typing at it — surfacing five arbitrary
 * ones under a heading would be noise dressed as an answer.
 *
 * Every query is scoped on `companyId` directly, exactly as `app/api/gold/**`
 * scopes its own lists. `GoldPour.companyId` and `GoldDispatch.companyId` are
 * nullable for backward-compat, so a legacy row with no company is invisible
 * here — which is the same answer every gold list already gives it, and the safe
 * direction to be wrong in for a tenant boundary.
 */
import type { Prisma } from "@corelithzw/db";

import {
  facts,
  SEARCH_PER_TYPE_LIMIT,
  wordMatches,
  type SearchResult,
} from "@/lib/records/search-result";

type Tx = Prisma.TransactionClient;

/** The gold record types global search can return. */
export const GOLD_SEARCH_TYPES = ["GOLD_POUR", "GOLD_PURCHASE", "GOLD_DISPATCH"] as const;

export type GoldSearchType = (typeof GOLD_SEARCH_TYPES)[number];

/**
 * Which feature each arm needs.
 *
 * Per arm rather than one `gold.home` gate, for the reason the school arms are
 * split: a mine that pours but does not buy from artisanal sellers has
 * `gold.receipts` off, and a search box is not the place to reintroduce a screen
 * the tenant switched off.
 */
export const GOLD_SEARCH_FEATURES: Record<GoldSearchType, string> = {
  GOLD_POUR: "gold.intake.pours",
  GOLD_PURCHASE: "gold.receipts",
  GOLD_DISPATCH: "gold.dispatches",
};

/** Grams, at the precision the register shows them. */
function grams(weight: Prisma.Decimal | null | undefined): string | null {
  return weight === null || weight === undefined ? null : `${weight.toFixed(3)} g`;
}

export async function searchGold(
  db: Tx,
  input: {
    companyId: string;
    query: string;
    limitPerType?: number;
    /** The arms the caller is entitled to run. Anything absent is not searched. */
    types: readonly GoldSearchType[];
  },
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const take = input.limitPerType ?? SEARCH_PER_TYPE_LIMIT;
  const contains = { contains: query, mode: "insensitive" as const };
  const companyId = input.companyId;
  const wanted = new Set(input.types);
  const arms: Array<Promise<SearchResult[]>> = [];

  if (wanted.has("GOLD_POUR")) {
    arms.push(
      db.goldPour
        .findMany({
          // The bar id is the thing stamped on the bar and written on the note,
          // so it is what gets typed. Storage location too: "which bars are in
          // the strongroom" is a question people ask the search box.
          where: {
            companyId,
            OR: [{ pourBarId: contains }, { storageLocation: contains }],
          },
          select: {
            id: true,
            pourBarId: true,
            pourDate: true,
            grossWeight: true,
            estimatedPurity: true,
            storageLocation: true,
            site: { select: { name: true } },
          },
          orderBy: { pourDate: "desc" },
          take,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "GOLD_POUR" as const,
            id: row.id,
            reference: row.pourBarId,
            title: row.pourBarId,
            subtitle: `${grams(row.grossWeight)} · ${row.site.name}`,
            facts: facts([
              ["Poured", row.pourDate.toISOString().slice(0, 10)],
              ["Gross weight", grams(row.grossWeight)],
              ["Estimated purity", row.estimatedPurity ? `${row.estimatedPurity}%` : null],
              ["Stored at", row.storageLocation],
              ["Site", row.site.name],
            ]),
            href: `/gold/intake/pours?pourId=${row.id}`,
          })),
        ),
    );
  }

  if (wanted.has("GOLD_PURCHASE")) {
    arms.push(
      db.goldPurchase
        .findMany({
          // A seller's name is two words as often as one, so it goes through
          // `wordMatches`; the purchase number and phone are single tokens and
          // are matched whole.
          where: {
            companyId,
            OR: [
              { purchaseNumber: contains },
              { sellerPhone: contains },
              { AND: wordMatches(query, ["sellerName"]) },
            ],
          },
          select: {
            id: true,
            purchaseNumber: true,
            purchaseDate: true,
            sellerName: true,
            sellerPhone: true,
            grossWeight: true,
            site: { select: { name: true } },
          },
          orderBy: { purchaseDate: "desc" },
          take,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "GOLD_PURCHASE" as const,
            id: row.id,
            reference: row.purchaseNumber,
            // The seller leads: somebody typing a purchase number wants to know
            // whose it was, and somebody typing a name wants to see it back.
            title: row.sellerName,
            subtitle: `${row.purchaseNumber} · ${grams(row.grossWeight)}`,
            facts: facts([
              ["Purchase", row.purchaseNumber],
              ["Received", row.purchaseDate.toISOString().slice(0, 10)],
              ["Seller", row.sellerName],
              ["Phone", row.sellerPhone],
              ["Gross weight", grams(row.grossWeight)],
              ["Site", row.site.name],
            ]),
            href: `/gold/intake/purchases?purchaseId=${row.id}`,
          })),
        ),
    );
  }

  if (wanted.has("GOLD_DISPATCH")) {
    arms.push(
      db.goldDispatch
        .findMany({
          // Seal numbers are the reason this arm exists. They are the one thing
          // written on the outside of a sealed parcel, and the question "where
          // did seal 44817 go" has no other answer in the product.
          where: {
            companyId,
            OR: [
              { sealNumbers: contains },
              { destination: contains },
              { courier: contains },
              { vehicle: contains },
            ],
          },
          select: {
            id: true,
            dispatchDate: true,
            courier: true,
            vehicle: true,
            destination: true,
            sealNumbers: true,
            receivedBy: true,
            goldPour: { select: { pourBarId: true, grossWeight: true } },
          },
          orderBy: { dispatchDate: "desc" },
          take,
        })
        .then((rows) =>
          rows.map((row) => ({
            type: "GOLD_DISPATCH" as const,
            id: row.id,
            reference: row.sealNumbers,
            title: `${row.destination} · ${row.dispatchDate.toISOString().slice(0, 10)}`,
            subtitle: `Seal ${row.sealNumbers} · ${row.courier}`,
            facts: facts([
              ["Seals", row.sealNumbers],
              ["Dispatched", row.dispatchDate.toISOString().slice(0, 10)],
              ["Destination", row.destination],
              ["Courier", row.courier],
              ["Vehicle", row.vehicle],
              ["Bar", row.goldPour.pourBarId],
              ["Gross weight", grams(row.goldPour.grossWeight)],
              // Blank until the other end signs, which is exactly the state
              // somebody searching a seal number is usually checking.
              ["Received by", row.receivedBy],
            ]),
            href: `/gold/transit/dispatches?dispatchId=${row.id}`,
          })),
        ),
    );
  }

  const results = await Promise.all(arms);
  return results.flat();
}
