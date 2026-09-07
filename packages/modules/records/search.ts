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
 * The arms are registered by the host that composes the modules
 * (`registerSearchArm`, from its `modules.ts`), so this file names none of
 * them: adding or removing a module touches the host's composition for a line
 * and this not at all. The command bar, the ⌘K palette and the mention picker
 * were never touched either way — none of them knows how many modules exist.
 *
 * Entitlement is resolved by the caller — `app/api/v2/records/search/route.ts` —
 * because it holds the session, and a library that reads features from a global
 * is a library you cannot test.
 */
import type { Prisma } from "@corelithzw/db";
import { registry } from "@corelithzw/platform/registry";

import { groupSearchResults, type SearchResult } from "./search-result";

type Tx = Prisma.TransactionClient;

/**
 * Which arms this caller may run, keyed by arm id: `true` for an arm that is
 * searched whole or not at all (the CRM), the permitted result types for one
 * that is filtered per type. An arm absent, `false` or given no types is not
 * called — that is what stops an unentitled type leaking through a group
 * heading or a result count. Resolved by the caller, which holds the session.
 */
export type SearchScope = Readonly<Record<string, boolean | readonly string[]>>;

export type SearchArmInput = {
  companyId: string;
  query: string;
  limitPerType?: number;
  /** The types the caller may see from this arm; empty for a whole-module arm. */
  types: readonly string[];
};

export type SearchArm = {
  id: string;
  run: (db: Tx, input: SearchArmInput) => Promise<SearchResult[]>;
};

const arms = registry<Map<string, SearchArm>>("records.search-arms", () => new Map());

/** A module's arm, registered by the host that composes it (`modules.ts`). */
export function registerSearchArm(arm: SearchArm) {
  arms.set(arm.id, arm);
}

export function registeredSearchArms(): SearchArm[] {
  return [...arms.values()];
}

export async function searchRecords(
  db: Tx,
  input: { companyId: string; query: string; limitPerType?: number; scope: SearchScope },
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const common = { companyId: input.companyId, query, limitPerType: input.limitPerType };

  // An arm is queued only when the caller was given it: a whole-module arm when
  // its flag is on, a typed arm when it has at least one type. Nothing else is
  // called at all.
  const runs: Array<Promise<SearchResult[]>> = [];
  for (const arm of registeredSearchArms()) {
    const granted = input.scope[arm.id];
    if (granted === true) runs.push(arm.run(db, { ...common, types: [] }));
    else if (Array.isArray(granted) && granted.length > 0) runs.push(arm.run(db, { ...common, types: granted }));
  }

  const results = await Promise.all(runs);
  return results.flat();
}

export { groupSearchResults };
