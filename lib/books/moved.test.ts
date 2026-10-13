import { describe, expect, it } from "vitest";

import { movedTo } from "./moved";

describe("an old Books address", () => {
  it("forwards to the new one with its query", () => {
    expect(movedTo("/books/journals", { journal: "j1", tab: "drafts" })).toBe("/books/journals?journal=j1&tab=drafts");
    expect(movedTo("/books/vat", {})).toBe("/books/vat");
    expect(movedTo("/books/periods", { a: ["1", "2"], b: undefined })).toBe("/books/periods?a=1&a=2");
  });
});
