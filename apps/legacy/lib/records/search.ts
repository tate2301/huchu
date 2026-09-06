/**
 * Global search across whichever modules a tenant is entitled to.
 *
 * S-4.5. There is one search box in the app bar, one command bar behind ⌘K, and
 * one mention picker. Before this they all called `/api/v2/crm/search`, which is
 * gated on `crm.core` by URL prefix — so on a school tenant the box in the app
 * bar returned 403 and showed nothing. The same trap S-4.2 and S-4.4 hit: making
 * a school record a first-class record type changes the data model and changes
 * nothing about who can reach it.
 *
 * The fix is not a second search engine. Each module contributes an arm
 * returning the shared result shape, this decides which arms the caller may run,
 * and the callers see one grouped list. A tenant with several modules gets all of
 * them; a tenant with none gets an empty list rather than an error, because a
 * search box that refuses is worse than one that finds nothing.
 *
 * Six arms now — `searchCrm`, `searchSchools`, `searchPeople`, `searchGold`,
 * `searchRetail`, `searchOperations` — which is every module that has records
 * worth typing at. That was the point of the shape: adding the gold, till and
 * plant arms touched this file for a line each, and *removing* the scrap and
 * vehicle arms with their verticals (ST-2.2, ST-2.3) cost the same. The command
 * bar, the ⌘K palette and the mention picker were not touched either way —
 * none of them knows how many modules exist.
 *
 * Entitlement is resolved by the caller — `app/api/v2/records/search/route.ts` —
 * because it holds the session, and a library that reads features from a global
 * is a library you cannot test.
 */
import type { Prisma } from "@corelithzw/db";

import { searchCrm } from "@/lib/crm/search";
import { searchGold, type GoldSearchType } from "@/lib/gold/search";
import { searchOperations, type OperationsSearchType } from "@/lib/operations/search";
import { searchPeople, type PeopleSearchType } from "@/lib/people/search";
import { groupSearchResults, type SearchResult } from "@/lib/records/search-result";
import { searchRetail, type RetailSearchType } from "@/lib/retail/search";
import { searchSchools, type SchoolSearchType } from "@/lib/schools/search";

type Tx = Prisma.TransactionClient;

export type SearchScope = {
  /** CRM records, the shared catalogue and the accounting customers. */
  crm: boolean;
  /** The school arms this caller may run — empty means no school search. */
  schools: readonly SchoolSearchType[];
  /** The People arms this caller may run — empty means no workforce search. */
  people: readonly PeopleSearchType[];
  /** The gold arms this caller may run — empty means no gold search. */
  gold: readonly GoldSearchType[];
  /** The till-receipt arm, if this caller has the point of sale. */
  retail: readonly RetailSearchType[];
  /** Stores and maintenance — stock, plant and work orders. */
  operations: readonly OperationsSearchType[];
};

export async function searchRecords(
  db: Tx,
  input: { companyId: string; query: string; limitPerType?: number; scope: SearchScope },
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const arms: Array<Promise<SearchResult[]>> = [];
  const common = { companyId: input.companyId, query, limitPerType: input.limitPerType };

  /**
   * Queue one module's arm, if the caller was given any of its types.
   *
   * Written as a helper because the shape of each was identical: the version
   * with an expanded `if` block per module was thirty lines in which the only
   * thing that varied was a name, and the last was pasted from the one before.
   * An arm with an empty type list is not called at all
   * — that is what stops an unentitled type leaking through a group heading or a
   * result count.
   */
  function arm<T extends string>(
    types: readonly T[],
    search: (
      db: Tx,
      input: { companyId: string; query: string; limitPerType?: number; types: readonly T[] },
    ) => Promise<SearchResult[]>,
  ) {
    if (types.length > 0) arms.push(search(db, { ...common, types }));
  }

  // The CRM takes no type list: it is gated as one module on `crm.core`, so it
  // is either searched whole or not at all.
  if (input.scope.crm) arms.push(searchCrm(db, common));

  arm(input.scope.schools, searchSchools);
  arm(input.scope.people, searchPeople);
  arm(input.scope.gold, searchGold);
  arm(input.scope.retail, searchRetail);
  arm(input.scope.operations, searchOperations);

  const results = await Promise.all(arms);
  return results.flat();
}

export { groupSearchResults };
