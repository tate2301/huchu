import { describe, it, expect, vi, beforeEach } from "vitest";

import "@/modules";
import { groupSearchResults, SEARCH_TYPE_ORDER } from "@corelithzw/module-records/search-result";
import { searchRecords, type SearchScope } from "@corelithzw/module-records/search";
import { searchCrm } from "@/lib/crm/search";
import { searchGold } from "@/lib/gold/search";
import { searchOperations } from "@/lib/operations/search";
import { searchPeople } from "@/lib/people/search";
import { searchRetail } from "@/lib/retail/search";
import { searchSchools } from "@/lib/schools/search";

/**
 * S-4.5 — one search across whichever modules a tenant has.
 *
 * The arms are mocked because what this file decides is not what a deal or a
 * pupil looks like — those are tested where they are built — but which arms run
 * at all. A tenant without the CRM must not have `searchCrm` called: the whole
 * bug this replaced was a search box that returned `Feature disabled: crm.core`
 * on every keystroke a school typed.
 */

vi.mock("@/lib/crm/search", () => ({ searchCrm: vi.fn(async () => []) }));
vi.mock("@/lib/schools/search", () => ({ searchSchools: vi.fn(async () => []) }));
vi.mock("@/lib/people/search", () => ({ searchPeople: vi.fn(async () => []) }));
vi.mock("@/lib/gold/search", () => ({ searchGold: vi.fn(async () => []) }));
vi.mock("@/lib/retail/search", () => ({ searchRetail: vi.fn(async () => []) }));
vi.mock("@/lib/operations/search", () => ({ searchOperations: vi.fn(async () => []) }));

const db = {} as never;

/** Every arm, keyed the way `SearchScope` is, so a new one shows up as a gap. */
const ARMS = {
  schools: searchSchools,
  people: searchPeople,
  gold: searchGold,
  retail: searchRetail,
  operations: searchOperations,
} as const;

/**
 * A scope with nothing switched on but what the case is about.
 *
 * Written out in full at every call site, this file was an empty array per arm
 * of noise per test and the interesting field was the last one.
 */
function scope(granted: Partial<SearchScope> = {}): SearchScope {
  return {
    crm: false,
    schools: [],
    people: [],
    gold: [],
    retail: [],
    operations: [],
    ...granted,
  };
}

beforeEach(() => {
  vi.mocked(searchCrm).mockClear();
  for (const arm of Object.values(ARMS)) vi.mocked(arm).mockClear();
});

describe("searchRecords", () => {
  it("does not touch the CRM on a school tenant", async () => {
    await searchRecords(db, {
      companyId: "c1",
      query: "moyo",
      scope: scope({ schools: ["STUDENT"] }),
    });

    expect(searchCrm).not.toHaveBeenCalled();
    expect(searchSchools).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ companyId: "c1", query: "moyo", types: ["STUDENT"] }),
    );
  });

  it("does not touch the school on a CRM tenant", async () => {
    await searchRecords(db, {
      companyId: "c1",
      query: "delta",
      scope: scope({ crm: true }),
    });

    expect(searchSchools).not.toHaveBeenCalled();
    expect(searchCrm).toHaveBeenCalledOnce();
  });

  it("runs both arms for a tenant with both, and merges them", async () => {
    vi.mocked(searchCrm).mockResolvedValueOnce([
      {
        type: "DEAL",
        id: "d1",
        reference: "CRMD-1",
        title: "Roof job",
        subtitle: null,
        facts: [],
        href: "/crm/deals/d1",
      },
    ]);
    vi.mocked(searchSchools).mockResolvedValueOnce([
      {
        type: "STUDENT",
        id: "s1",
        reference: "S1002",
        title: "Tendai Moyo",
        subtitle: null,
        facts: [],
        href: "/schools/students/s1",
      },
    ]);

    const results = await searchRecords(db, {
      companyId: "c1",
      query: "moyo",
      scope: scope({ crm: true, schools: ["STUDENT"] }),
    });

    expect(results.map((result) => result.type)).toEqual(["DEAL", "STUDENT"]);
  });

  it("answers a tenant with neither module with nothing, not an error", async () => {
    // The box lives in the app bar on every page. One that refuses is worse than
    // one that finds nothing.
    const results = await searchRecords(db, {
      companyId: "c1",
      query: "anything",
      scope: scope(),
    });
    expect(results).toEqual([]);
  });

  it("refuses a query too short to mean anything, before any arm runs", async () => {
    const results = await searchRecords(db, {
      companyId: "c1",
      query: "a",
      scope: scope({ crm: true, schools: ["STUDENT"] }),
    });

    expect(results).toEqual([]);
    expect(searchCrm).not.toHaveBeenCalled();
    expect(searchSchools).not.toHaveBeenCalled();
  });

  it("runs each vertical's arm only when its types were granted", async () => {
    // The per-module `if (types.length > 0)` blocks became one `arm()` helper in
    // a loop, and the thing that helper must not do is call an arm the caller was
    // not given: an unentitled type leaks through a group heading and a result
    // count even when the rows are empty. One case per arm, granted alone.
    const granted: Array<[keyof typeof ARMS, Partial<SearchScope>]> = [
      ["schools", { schools: ["STUDENT"] }],
      ["people", { people: ["EMPLOYEE"] }],
      ["gold", { gold: ["GOLD_POUR"] }],
      ["retail", { retail: ["RETAIL_SALE"] }],
      ["operations", { operations: ["WORK_ORDER"] }],
    ];

    for (const [name, only] of granted) {
      for (const arm of Object.values(ARMS)) vi.mocked(arm).mockClear();

      await searchRecords(db, { companyId: "c1", query: "anything", scope: scope(only) });

      for (const [other, arm] of Object.entries(ARMS)) {
        if (other === name) expect(arm, `${name} arm`).toHaveBeenCalledOnce();
        else expect(arm, `${other} arm on a ${name}-only tenant`).not.toHaveBeenCalled();
      }
      expect(searchCrm, `CRM on a ${name}-only tenant`).not.toHaveBeenCalled();
    }
  });

  it("hands every arm the same query and tenant", async () => {
    // A copy-paste slip in the old expanded version would have been an arm
    // searching the right words on the wrong company.
    await searchRecords(db, {
      companyId: "c9",
      query: "hilux",
      limitPerType: 3,
      scope: scope({
        crm: true,
        gold: ["GOLD_DISPATCH"],
        retail: ["RETAIL_SALE"],
        operations: ["EQUIPMENT"],
      }),
    });

    const expected = expect.objectContaining({
      companyId: "c9",
      query: "hilux",
      limitPerType: 3,
    });
    expect(searchCrm).toHaveBeenCalledWith(db, expected);
    expect(searchGold).toHaveBeenCalledWith(db, expected);
    expect(searchRetail).toHaveBeenCalledWith(db, expected);
    expect(searchOperations).toHaveBeenCalledWith(db, expected);
  });
});

describe("groupSearchResults", () => {
  it("drops the types nothing matched", () => {
    const groups = groupSearchResults([
      {
        type: "STUDENT",
        id: "s1",
        reference: "S1002",
        title: "Tendai Moyo",
        subtitle: null,
        facts: [],
        href: "/schools/students/s1",
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ type: "STUDENT", label: "Students" });
  });

  it("puts a pupil above a catalogue item", () => {
    // Only matters on a tenant with both, which none has today — but a
    // registrar's pupil under a product would be the wrong answer if one did.
    expect(SEARCH_TYPE_ORDER.indexOf("STUDENT")).toBeLessThan(
      SEARCH_TYPE_ORDER.indexOf("PRODUCT"),
    );
  });

  it("labels every type it can order", () => {
    // The two lists are edited by hand and a type missing from either is a group
    // that never renders or one that renders "undefined".
    const groups = groupSearchResults(
      SEARCH_TYPE_ORDER.map((type) => ({
        type,
        id: type,
        reference: null,
        title: type,
        subtitle: null,
        facts: [],
        href: "/",
      })),
    );

    expect(groups).toHaveLength(SEARCH_TYPE_ORDER.length);
    for (const group of groups) {
      expect(group.label).toBeTruthy();
    }
  });
});
