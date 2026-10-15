import { describe, expect, it } from "vitest";

import { followLabel, newQuestion } from "./questions";

describe("questions in a builder", () => {
  it("keys a new question after what was typed, apart from the rest", () => {
    const first = newQuestion("text", "Colour", []);
    expect(first.key).toBe("colour");
    expect(newQuestion("text", "Colour", [first]).key).not.toBe("colour");
  });

  it("moves the key with its label until the question is saved", () => {
    const question = newQuestion("text", "Colour", []);
    const renamed = followLabel(question, { ...question, label: "Finish" }, [], new Set());
    expect(renamed.key).toBe("finish");
    expect(followLabel(question, { ...question, label: "Finish" }, [], new Set(["colour"])).key).toBe("colour");
  });
});
