import { describe, expect, it } from "vitest";

import { BIN_LIST_RUNS, binItem, deleteForGoodAsk, restoredToast } from "./bin";

describe("the bin's asks and toasts (80-admin 5.10)", () => {
  it("asks before deleting for good, by name for one and by count for several", () => {
    expect(deleteForGoodAsk(1, [{ id: "promotion:1", what: "Happy hour (old)" }])).toEqual({
      title: "Delete Happy hour (old) for good?",
      body: "It cannot be restored. Anything sold, paid or counted against it stays in the records, under its old name.",
      keep: "Keep it",
      go: "Delete for good",
      fill: "bad",
    });
    expect(deleteForGoodAsk(2)).toEqual({
      title: "Delete 2 things for good?",
      body: "They cannot be restored. Anything sold, paid or counted against them stays in the records, under their old names.",
      keep: "Keep them",
      go: "Delete for good",
      fill: "bad",
    });
  });

  it("says what came back, and why one did not", () => {
    expect(restoredToast(1, { restored: 1, refused: [] })).toBe("Restored. It is back in every list.");
    expect(restoredToast(3, { restored: 3, refused: [] })).toBe("3 restored. They are back in every list.");
    expect(
      restoredToast(3, {
        restored: 2,
        refused: [{ name: "Whisky", why: "There is already a category called Whisky. Rename it, then restore this one." }],
      }),
    ).toEqual({
      title: "2 restored. Whisky did not come back. There is already a category called Whisky. Rename it, then restore this one.",
      variant: "warning",
    });
    expect(restoredToast(1, { restored: 0, refused: [{ name: "Gordon's Gin 750ml", why: "It was deleted for good." }] })).toEqual({
      title: "Gordon's Gin 750ml did not come back. It was deleted for good.",
      variant: "warning",
    });
  });

  it("posts the rows as kinds and ids, and says Deleted for good after", () => {
    expect(binItem("product:3f2a")).toEqual({ kind: "product", id: "3f2a" });
    expect(BIN_LIST_RUNS.restorebin!.body!(["product:a", "category:b"], [])).toEqual({
      items: [
        { kind: "product", id: "a" },
        { kind: "category", id: "b" },
      ],
    });
    expect(BIN_LIST_RUNS.deleteforgood!.done(2, [])).toBe("Deleted for good.");
  });
});
