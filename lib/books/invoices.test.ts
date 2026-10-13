import { describe, expect, it } from "vitest";

import { AGE_BUCKETS, ageBucket } from "./invoices";

describe("ageBucket", () => {
  it("files an open invoice by how many days late it is", () => {
    expect(ageBucket(0)).toBe("Not yet due");
    expect(ageBucket(-4)).toBe("Not yet due");
    expect(ageBucket(1)).toBe("1 to 30 days");
    expect(ageBucket(30)).toBe("1 to 30 days");
    expect(ageBucket(31)).toBe("31 to 60 days");
    expect(ageBucket(60)).toBe("31 to 60 days");
    expect(ageBucket(61)).toBe("61 to 90 days");
    expect(ageBucket(90)).toBe("61 to 90 days");
    expect(ageBucket(91)).toBe("Over 90 days");
  });

  it("names every bucket it files into, in order", () => {
    expect([0, 10, 45, 75, 200].map(ageBucket)).toEqual([...AGE_BUCKETS]);
  });
});
