import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  customFieldFilters,
  narrowingKey,
  readFilterValue,
  readState,
  sameState,
  withDefaults,
  writeState,
} from "./codec";
import { COMPANY_REGISTER } from "./defs/company";
import { PERSON_REGISTER } from "./defs/person";
import { REGISTERS } from "./registry";
import { viewStateSchema } from "./schema";
import type { FilterDef, RegisterDef, ViewState } from "./types";

const people: RegisterDef = PERSON_REGISTER;
const companies: RegisterDef = COMPANY_REGISTER;

function read(def: RegisterDef, query: string) {
  return readState(def, new URLSearchParams(query));
}

describe("readState", () => {
  it("reads an empty address as the list's opening view, as saved", () => {
    const parsed = read(people, "");
    expect(parsed.asSaved).toBe(true);
    expect(parsed.view).toBeNull();
    expect(parsed.state).toEqual({ filters: {} });
    expect(parsed.page).toBe(1);
  });

  it("reads a lone view as that view, as saved", () => {
    const parsed = read(people, "view=mine&page=3");
    expect(parsed).toMatchObject({ view: "mine", asSaved: true, page: 3 });
  });

  it("treats any other key as the whole state", () => {
    const parsed = read(people, "view=mine&layout=table");
    expect(parsed.asSaved).toBe(false);
    // The view's own owner filter is not merged back in: the address is the
    // state, so a filter cleared on the view stays cleared on reload.
    expect(parsed.state.filters).toEqual({});
  });

  it("keeps the search with the filters", () => {
    const parsed = read(people, "q=%20moyo%20&type=CUSTOMER&owner=me,none");
    expect(parsed.state.q).toBe("moyo");
    expect(parsed.state.filters).toEqual({ type: ["CUSTOMER"], owner: ["me", "none"] });
  });

  it("drops what it cannot use rather than failing", () => {
    const parsed = read(
      people,
      "type=CUSTOMER,NOT_A_TYPE&sort=-nope&layout=calendar&by=shoe-size&archived=0&unknown=1&contacted=yesterday",
    );
    expect(parsed.state.filters).toEqual({ type: ["CUSTOMER"] });
    expect(parsed.state.sort).toBeUndefined();
    expect(parsed.state.layout).toBeUndefined();
    expect(parsed.state.by).toBeUndefined();
    // Still explicit: somebody did say something, it just did not narrow.
    expect(parsed.asSaved).toBe(false);
  });

  it("reads and writes the grouping, which does not narrow the list", () => {
    const parsed = read(people, "by=company&sort=-updated");
    expect(parsed.state.by).toBe("company");
    expect(writeState(people, parsed.state)).toContain("by=company");
    // Grouping changes how the rows are shown, not which rows: a selection
    // made before grouping is still a selection of the same records.
    expect(narrowingKey(people, parsed.state)).toBe(narrowingKey(people, { ...parsed.state, by: undefined }));
  });

  it("reads sorts with a leading minus as descending", () => {
    expect(read(people, "sort=-updated").state.sort).toEqual({ key: "updated", dir: "desc" });
    expect(read(people, "sort=name").state.sort).toEqual({ key: "name", dir: "asc" });
  });

  it("reads custom fields as lists", () => {
    const parsed = read(people, "cf.region=north,south&cf.bad%20key=1");
    expect(parsed.state.filters).toEqual({ "cf.region": ["north", "south"] });
    expect(customFieldFilters(parsed.state)).toEqual({ region: ["north", "south"] });
  });

  it("clamps the page to a positive whole number", () => {
    expect(read(people, "page=0").page).toBe(1);
    expect(read(people, "page=-4").page).toBe(1);
    expect(read(people, "page=2.7").page).toBe(2);
    expect(read(people, "page=abc").page).toBe(1);
  });
});

describe("readFilterValue", () => {
  const date: FilterDef = { key: "d", label: "D", kind: "date", presets: ["today", "this-month"] };
  const number: FilterDef = { key: "n", label: "N", kind: "number" };
  const single: FilterDef = { key: "s", label: "S", kind: "person", single: true };

  it("reads day ranges with either end open", () => {
    expect(readFilterValue(date, "2026-09-01..2026-09-30")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(readFilterValue(date, "..2026-09-30")).toEqual({ to: "2026-09-30" });
    expect(readFilterValue(date, "2026-09-01..")).toEqual({ from: "2026-09-01" });
    expect(readFilterValue(date, "01/09/2026..")).toBeUndefined();
  });

  it("reads only the presets a filter offers", () => {
    expect(readFilterValue(date, "today")).toEqual({ preset: "today" });
    expect(readFilterValue(date, "next-30d")).toBeUndefined();
  });

  it("reads number ranges", () => {
    expect(readFilterValue(number, "1000..")).toEqual({ min: 1000 });
    expect(readFilterValue(number, "..250.5")).toEqual({ max: 250.5 });
    expect(readFilterValue(number, "abc..def")).toBeUndefined();
  });

  it("keeps one value for a single-answer filter", () => {
    expect(readFilterValue(single, "a,b")).toEqual(["a"]);
  });

  it("de-duplicates list answers", () => {
    expect(readFilterValue(single, "a,a")).toEqual(["a"]);
    expect(readFilterValue({ key: "o", label: "O", kind: "person" }, "b,a,b")).toEqual(["b", "a"]);
  });
});

describe("writeState", () => {
  it("writes one canonical string per state", () => {
    const state: ViewState = {
      q: "moyo",
      filters: { owner: ["none", "me"], type: ["CUSTOMER"], "cf.region": ["south", "north"] },
      sort: { key: "updated", dir: "desc" },
    };
    expect(writeState(people, state)).toBe(
      "q=moyo&type=CUSTOMER&owner=me%2Cnone&cf.region=north%2Csouth&sort=-updated&layout=table",
    );
  });

  it("writes only the view when asked for the view as saved", () => {
    expect(writeState(people, { filters: { owner: ["me"] } }, { view: "mine", asSaved: true })).toBe(
      "view=mine",
    );
  });

  it("writes the page only past the first", () => {
    expect(writeState(people, { filters: {} }, { page: 1 })).toBe("layout=table");
    expect(writeState(people, { filters: {} }, { page: 2 })).toBe("layout=table&page=2");
  });

  it("round-trips every state it writes", () => {
    const states: ViewState[] = [
      { filters: {} },
      { q: "roof & gutter", filters: { archived: true }, layout: "LIST" },
      {
        filters: {
          contacted: { preset: "last-30d" },
          created: { from: "2026-01-01", to: "2026-01-31" },
          company: ["c-1"],
        },
        sort: { key: "contacted", dir: "asc" },
        layout: "BOARD",
      },
    ];
    for (const state of states) {
      const written = writeState(people, state);
      const back = read(people, written);
      expect(back.asSaved).toBe(false);
      expect(writeState(people, back.state)).toBe(written);
    }
  });
});

describe("comparisons", () => {
  it("ignores defaults nobody chose", () => {
    expect(sameState(people, { filters: {} }, { filters: {}, layout: "TABLE", sort: { key: "name", dir: "asc" } })).toBe(
      true,
    );
    expect(sameState(people, { filters: {} }, { filters: {}, layout: "LIST" })).toBe(false);
  });

  it("compares columns in order", () => {
    expect(sameState(people, { filters: {}, columns: ["name", "email"] }, { filters: {}, columns: ["email", "name"] })).toBe(
      false,
    );
  });

  it("keys the narrowing on search and filters only", () => {
    expect(narrowingKey(people, { q: "a", filters: {}, layout: "BOARD" })).toBe(
      narrowingKey(people, { q: "a", filters: {}, sort: { key: "ref", dir: "asc" } }),
    );
  });

  it("fills the register's defaults", () => {
    expect(withDefaults(companies, { filters: {} })).toMatchObject({
      layout: "TABLE",
      sort: { key: "name", dir: "asc" },
    });
  });

  it("counts search as a filter", () => {
    expect(activeFilterCount({ q: " ", filters: { owner: ["me"] } })).toBe(1);
    expect(activeFilterCount({ q: "x", filters: { owner: ["me"] } })).toBe(2);
  });
});

describe("every register", () => {
  for (const def of Object.values(REGISTERS) as RegisterDef[]) {
    describe(def.key, () => {
      it("has unique filter keys that are not the codec's own", () => {
        const keys = def.filters.map((filter) => filter.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const key of keys) {
          expect(["q", "sort", "layout", "by", "view", "page"]).not.toContain(key);
          expect(key.startsWith("cf.")).toBe(false);
        }
      });

      it("has unique columns, one of them required, and sortable columns that name a sort", () => {
        const ids = def.columns.map((column) => column.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(def.columns.filter((column) => column.required)).toHaveLength(1);
        for (const column of def.columns) {
          if (column.sort) expect(def.sorts.map((sort) => sort.key)).toContain(column.sort);
        }
      });

      it("offers presets only on date filters and options only on enums", () => {
        for (const filter of def.filters) {
          if (filter.presets) expect(filter.kind).toBe("date");
          if (filter.options) expect(filter.kind).toBe("enum");
          if (filter.kind === "enum") expect(Boolean(filter.options) !== Boolean(filter.facet)).toBe(true);
          if (filter.kind === "relation") expect(filter.relation).toBeTruthy();
        }
      });

      it("has built-in views that are valid, distinct and survive the address bar", () => {
        const schema = viewStateSchema(def);
        const keys = def.views.map((view) => view.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const view of def.views) {
          expect(schema.safeParse(view.state).success, `${def.key}/${view.key}`).toBe(true);
          const written = writeState(def, view.state);
          expect(writeState(def, read(def, written).state)).toBe(written);
        }
      });

      it("offers a group filter only where records can be put in groups", () => {
        const hasGroupFilter = def.filters.some((filter) => filter.kind === "group");
        expect(hasGroupFilter).toBe(Boolean(def.groupEntity));
        expect(def.bulk.includes("group")).toBe(Boolean(def.groupEntity));
      });

      it("offers the status action only with answers for it", () => {
        expect(def.bulk.includes("status")).toBe(Boolean(def.statusOptions?.length));
      });
    });
  }
});

describe("viewStateSchema", () => {
  const schema = viewStateSchema(people);

  it("refuses filters the list does not have", () => {
    expect(schema.safeParse({ filters: { stage: ["WON"] } }).success).toBe(false);
  });

  it("refuses answers of the wrong shape", () => {
    expect(schema.safeParse({ filters: { archived: false } }).success).toBe(false);
    expect(schema.safeParse({ filters: { type: ["NOT_A_TYPE"] } }).success).toBe(false);
    expect(schema.safeParse({ filters: { created: { preset: "next-30d" } } }).success).toBe(false);
    expect(schema.safeParse({ filters: { created: {} } }).success).toBe(false);
  });

  it("refuses unknown sorts, layouts and columns", () => {
    expect(schema.safeParse({ filters: {}, sort: { key: "value", dir: "asc" } }).success).toBe(false);
    expect(schema.safeParse({ filters: {}, layout: "CALENDAR" }).success).toBe(false);
    expect(schema.safeParse({ filters: {}, columns: ["name", "name"] }).success).toBe(false);
    expect(schema.safeParse({ filters: {}, columns: ["salary"] }).success).toBe(false);
  });

  it("accepts search, custom fields and columns in order", () => {
    expect(
      schema.safeParse({
        q: "moyo",
        filters: { "cf.region": ["north"], owner: ["me"] },
        sort: { key: "name", dir: "asc" },
        layout: "LIST",
        columns: ["name", "email", "owner"],
      }).success,
    ).toBe(true);
  });
});
