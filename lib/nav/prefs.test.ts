import { describe, expect, it } from "vitest";

import { composeNav } from "./compose";
import { arrange, NO_PREFS, parsePrefs, toggled } from "./prefs";

const groups = composeNav({ canOpen: () => true });
const some = groups.flatMap((group) => group.items).map((node) => node.id);

describe("arrange", () => {
  it("changes nothing with no preferences", () => {
    const out = arrange(groups, NO_PREFS, null);
    expect(out.pinned).toEqual([]);
    expect(out.more).toEqual([]);
    expect(out.groups.flatMap((group) => group.items).map((node) => node.id)).toEqual(some);
  });

  it("lifts a pinned node out of its group", () => {
    const id = some[3]!;
    const out = arrange(groups, { ...NO_PREFS, pinned: [id] }, null);
    expect(out.pinned.map((node) => node.id)).toEqual([id]);
    expect(out.groups.flatMap((group) => group.items).some((node) => node.id === id)).toBe(false);
  });

  it("gathers hidden nodes into More but never the page being looked at", () => {
    const [a, b] = [some[2]!, some[4]!];
    const out = arrange(groups, { ...NO_PREFS, hidden: [a, b] }, b);
    expect(out.more.map((node) => node.id)).toEqual([a]);
    expect(out.groups.flatMap((group) => group.items).some((node) => node.id === b)).toBe(true);
  });

  it("drops a group that has nothing left", () => {
    const group = groups[0]!;
    const out = arrange(groups, { ...NO_PREFS, hidden: group.items.map((node) => node.id) }, null);
    expect(out.groups.some((entry) => entry.id === group.id)).toBe(false);
  });

  it("ignores ids that are not in the sidebar any more", () => {
    const out = arrange(groups, { ...NO_PREFS, pinned: ["gone"], hidden: ["gone"] }, null);
    expect(out.pinned).toEqual([]);
    expect(out.more).toEqual([]);
  });
});

describe("toggled", () => {
  it("pinning takes a node out of More and the other way round", () => {
    const hidden = toggled(NO_PREFS, "hidden", "x");
    expect(toggled(hidden, "pinned", "x")).toMatchObject({ pinned: ["x"], hidden: [] });
    expect(toggled(toggled(hidden, "pinned", "x"), "hidden", "x")).toMatchObject({ pinned: [], hidden: ["x"] });
  });

  it("removes what is already there", () => {
    expect(toggled({ ...NO_PREFS, folded: ["a"] }, "folded", "a").folded).toEqual([]);
  });
});

describe("parsePrefs", () => {
  it("survives bad storage", () => {
    expect(parsePrefs(null)).toEqual(NO_PREFS);
    expect(parsePrefs("{nope")).toEqual(NO_PREFS);
    expect(parsePrefs('{"pinned":[1,"a"],"hidden":"x"}')).toEqual({ ...NO_PREFS, pinned: ["a"] });
  });
});
