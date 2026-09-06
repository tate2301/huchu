/**
 * What a search result is, for every module that has records.
 *
 * S-4.5. The shape and the grouping used to live in `lib/crm/search.ts`
 * alongside the CRM's own queries, which was fine while the CRM was the only
 * thing anybody searched. A school needs the same thing — one box, one query,
 * results that tell two similar records apart — and copying the shape into a
 * `lib/schools/search.ts` would have given the product two search engines that
 * drift: one with a preview pane and one without, one that understands a
 * reference number and one that does not.
 *
 * So the shape lives here, module-neutral, and each module contributes arms.
 * `lib/records/search.ts` runs the arms a tenant is entitled to and hands back
 * one list. Types are here rather than in `search.ts` so a module's arm file can
 * import them without importing the orchestrator that imports it.
 *
 * There are eight arms now, covering the CRM, schools, People, gold, scrap,
 * vehicle sales, retail and the plant that stores and maintenance share. Every
 * one of them was written against this file and none of them changed it beyond
 * adding rows to the three lists below.
 */

export type SearchResultType =
  // CRM and the shared ledgers
  | "PERSON"
  | "COMPANY"
  | "LEAD"
  | "DEAL"
  | "SITE"
  | "QUOTATION"
  | "INVOICE"
  | "RECEIPT"
  | "PRODUCT"
  | "CUSTOMER"
  // People — the workforce, whatever the vertical
  | "EMPLOYEE"
  | "SHIFT_GROUP"
  // Schools (S-4.5)
  | "STUDENT"
  | "GUARDIAN"
  | "TEACHER"
  | "CLASS"
  | "SUBJECT"
  | "HOSTEL"
  // Gold
  | "GOLD_POUR"
  | "GOLD_PURCHASE"
  | "GOLD_DISPATCH"
  // Retail
  | "RETAIL_SALE"
  // Stores and maintenance — the plant every vertical runs on
  | "INVENTORY_ITEM"
  | "EQUIPMENT"
  | "WORK_ORDER";

export type SearchFact = { label: string; value: string };

export type SearchResult = {
  type: SearchResultType;
  id: string;
  /** The record number, shown alongside the title. */
  reference: string | null;
  title: string;
  /** One line of disambiguating detail, for the list row. */
  subtitle: string | null;
  /**
   * The same detail, labelled, for the preview pane.
   *
   * A preview showing one line is a list row in a bigger box. The command bar
   * gathered all of this already and then joined it with a middle dot, so the
   * pane beside the results had nothing to say that the row had not.
   */
  facts: SearchFact[];
  href: string;
};

/** Labelled facts, minus the ones with nothing in them. */
export function facts(
  entries: Array<[string, string | number | null | undefined]>,
): SearchFact[] {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value: String(value) }));
}

export const SEARCH_TYPE_LABELS: Record<SearchResultType, string> = {
  PERSON: "People",
  COMPANY: "Companies",
  LEAD: "Leads",
  DEAL: "Deals",
  SITE: "Sites",
  QUOTATION: "Quotations",
  INVOICE: "Invoices",
  RECEIPT: "Receipts",
  PRODUCT: "Catalogue",
  CUSTOMER: "Accounts",
  EMPLOYEE: "Staff",
  SHIFT_GROUP: "Crews",
  STUDENT: "Students",
  GUARDIAN: "Guardians",
  // "Staff" rather than "Teachers": the profile is the school's view of a
  // member of staff, and a bursar looking for the science HOD types a name
  // without first deciding what to call her.
  TEACHER: "Staff",
  CLASS: "Classes",
  SUBJECT: "Subjects",
  HOSTEL: "Hostels",
  GOLD_POUR: "Pours",
  // "Gold purchases" rather than "Purchases": a mine also buys spares, and a
  // group with a bare "Purchases" heading beside a stock item is a guess.
  GOLD_PURCHASE: "Gold purchases",
  GOLD_DISPATCH: "Dispatches",
  RETAIL_SALE: "Sales",
  INVENTORY_ITEM: "Stock",
  EQUIPMENT: "Equipment",
  WORK_ORDER: "Work orders",
};

/**
 * Order groups appear in: the records people look for most, first.
 *
 * Unlike the two-module version of this list, the order now does real work. A
 * gold mine runs gold, stores, maintenance and People at once, so a pour has to
 * sit above a spare part and a work order; a shop runs the till beside the CRM,
 * so a receipt has to sit above a deal that mentions one. The rule is: the
 * tenant's own vertical first, then the plant it runs on, then the CRM and the
 * ledgers, which are the same on every tenant.
 */
export const SEARCH_TYPE_ORDER: SearchResultType[] = [
  // Staff first. Every vertical has a workforce — it is the one group that
  // appears on a mine, a school and a bureau alike — and on a payroll tenant it
  // is the only group there is.
  "EMPLOYEE",
  "SHIFT_GROUP",
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
  // The verticals' own operational records.
  "GOLD_POUR",
  "GOLD_PURCHASE",
  "GOLD_DISPATCH",
  "RETAIL_SALE",
  // The plant underneath them. Below the vertical records deliberately: a mine
  // searching "435" wants the pour, not the pump with 435 in its code.
  "EQUIPMENT",
  "WORK_ORDER",
  "INVENTORY_ITEM",
  "DEAL",
  "PERSON",
  "COMPANY",
  "LEAD",
  "SITE",
  "PRODUCT",
  "QUOTATION",
  "INVOICE",
  "RECEIPT",
  "CUSTOMER",
];

export const SEARCH_PER_TYPE_LIMIT = 5;

/**
 * Every word in the query has to match one of the given columns.
 *
 * So word order does not matter and one word still matches any column: "moyo"
 * finds Ada Moyo, "moyo ada" finds her too, and "toyota hilux" finds the vehicle
 * whose make and model are two separate columns. Returns an array to spread into
 * an `AND`, empty for a query with no words — which every caller has already
 * ruled out on length.
 *
 * Module-neutral because eight arms need it and eight copies of it drift: the
 * first cut of this lived once in `lib/schools/search.ts` and once in
 * `lib/people/search.ts` with a comment in the second explaining why it was not
 * shared. That reasoning did not survive the sixth arm.
 */
export function wordMatches(query: string, columns: readonly string[]) {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({
      OR: columns.map((column) => ({
        [column]: { contains: word, mode: "insensitive" as const },
      })),
    }));
}

/** A query that looks like "QTN-0042" or "CRMD-7" is a record number, not a name. */
export function looksLikeReference(query: string): boolean {
  return /^[a-z]{2,6}-?\d{1,8}$/i.test(query.trim());
}

export function pluralise(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** Group flat results for rendering, in the order defined by SEARCH_TYPE_ORDER. */
export function groupSearchResults(results: SearchResult[]) {
  return SEARCH_TYPE_ORDER.map((type) => ({
    type,
    label: SEARCH_TYPE_LABELS[type],
    results: results.filter((result) => result.type === type),
  })).filter((group) => group.results.length > 0);
}
