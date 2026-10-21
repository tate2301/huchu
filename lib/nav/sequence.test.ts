import { describe, expect, it } from "vitest";

import { parseSequence, SEQUENCE_KEY, SEQUENCE_LIMIT, stepAt, writeSequence, type Sequence } from "./sequence";

const seq: Sequence = { from: "/crm/people?q=a", hrefs: ["/crm/people/1", "/crm/people/2", "/crm/people/3"], total: 38 };

describe("stepAt", () => {
  it("gives the neighbours, the position and the total", () => {
    expect(stepAt(seq, "/crm/people/2")).toEqual({ prevHref: "/crm/people/1", nextHref: "/crm/people/3", position: 2, total: 38 });
  });
  it("has no previous at the first and no next at the last loaded row", () => {
    expect(stepAt(seq, "/crm/people/1")?.prevHref).toBeNull();
    expect(stepAt(seq, "/crm/people/3")?.nextHref).toBeNull();
  });
  it("matches by path, so a tab or query on the record does not matter", () => {
    expect(stepAt(seq, "/crm/people/2?tab=sales")?.position).toBe(2);
  });
  it("finds nothing for a record that was not in the list", () => {
    expect(stepAt(seq, "/crm/people/9")).toBeNull();
    expect(stepAt(null, "/crm/people/1")).toBeNull();
  });
  it("never reports a total smaller than what is loaded", () => {
    expect(stepAt({ ...seq, total: 1 }, "/crm/people/1")?.total).toBe(3);
  });
});

describe("storage", () => {
  it("round-trips and drops what is not a sequence", () => {
    const store = new Map<string, string>();
    writeSequence({ setItem: (k, v) => void store.set(k, v) }, seq);
    expect(parseSequence(store.get(SEQUENCE_KEY) ?? null)).toEqual(seq);
    expect(parseSequence("{nope")).toBeNull();
    expect(parseSequence('{"from":1}')).toBeNull();
  });
  it("keeps a bounded number of rows", () => {
    const store = new Map<string, string>();
    const many = { from: "/x", hrefs: Array.from({ length: SEQUENCE_LIMIT + 50 }, (_, i) => `/x/${i}`) };
    writeSequence({ setItem: (k, v) => void store.set(k, v) }, many);
    expect(parseSequence(store.get(SEQUENCE_KEY) ?? null)?.hrefs).toHaveLength(SEQUENCE_LIMIT);
  });
  it("does not throw when storage does", () => {
    expect(() =>
      writeSequence({ setItem: () => { throw new Error("full"); } }, seq),
    ).not.toThrow();
  });
});
