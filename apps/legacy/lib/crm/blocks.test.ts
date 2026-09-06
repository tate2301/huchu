import { describe, it, expect } from "vitest";

import {
  emptyBlock,
  fieldBlocks,
  templateProblems,
  validateAnswers,
  type Block,
  type FieldBlock,
  type LeafBlock,
} from "./blocks";
import {
  resolveVariables,
  sampleValues,
  unknownVariables,
  usedVariables,
} from "./template-variables";

function field(
  id: string,
  over: Partial<Extract<Block, { type: "field" }>> = {},
): Extract<LeafBlock, { type: "field" }> {
  return {
    ...(emptyBlock("field", id) as Extract<Block, { type: "field" }>),
    label: "Question",
    ...over,
  };
}

describe("fieldBlocks", () => {
  it("finds questions nested inside a side-by-side block", () => {
    const blocks: Block[] = [
      { id: "c", type: "columns", left: [field("a")], right: [field("b")] },
    ];
    expect(fieldBlocks(blocks).map((block) => block.id)).toEqual(["a", "b"]);
  });
});

describe("templateProblems", () => {
  it("reports every problem at once, not the first one", () => {
    // A builder that reports one problem, gets fixed, then reports the next is
    // one people stop trusting to tell them when they are done.
    const blocks: Block[] = [
      field("a", { label: "", key: "same" }),
      field("b", { label: "Pick", key: "same", fieldType: "select", options: [] }),
    ];
    const problems = templateProblems("FORM", blocks);
    expect(problems.length).toBeGreaterThan(1);
  });

  it("catches two questions writing to the same key", () => {
    const blocks: Block[] = [field("a", { key: "email" }), field("b", { key: "email" })];
    expect(templateProblems("FORM", blocks).join(" ")).toContain("overwrite");
  });

  it("refuses a block that does not belong on this kind", () => {
    const blocks: Block[] = [emptyBlock("lineItems", "l")];
    expect(templateProblems("FORM", blocks)).not.toHaveLength(0);
  });

  it("accepts line items on a quote", () => {
    expect(templateProblems("QUOTE", [emptyBlock("lineItems", "l")])).toHaveLength(0);
  });

  it("says so when a form asks nothing", () => {
    expect(templateProblems("FORM", []).join(" ")).toContain("collects nothing");
  });
});

describe("variables", () => {
  it("finds what a body uses", () => {
    expect(usedVariables("Dear {{contact.name}}, re {{record.title}}")).toEqual([
      "contact.name",
      "record.title",
    ]);
  });

  it("flags a variable nothing will ever fill", () => {
    expect(unknownVariables("Hi {{contact.nickname}}")).toEqual(["contact.nickname"]);
  });

  it("fills what it knows", () => {
    expect(
      resolveVariables("Dear {{contact.firstName}}", { "contact.firstName": "Tendai" }),
    ).toBe("Dear Tendai");
  });

  it("shows a dash for a fact nobody had, not a blank", () => {
    // A blank mid-sentence reads as a typo somebody made; a dash reads as
    // missing information, which is what it is.
    expect(resolveVariables("Phone: {{contact.phone}}", {})).toBe("Phone: —");
  });

  it("leaves an unknown variable visible so a draft shows the typo", () => {
    expect(resolveVariables("Hi {{contact.nickname}}", {})).toBe("Hi {{contact.nickname}}");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(resolveVariables("{{ company.name }}", { "company.name": "Ridgeline" })).toBe(
      "Ridgeline",
    );
  });

  it("previews every catalogue entry without a record", () => {
    const values = sampleValues();
    expect(resolveVariables("{{company.name}} · {{document.total}}", values)).not.toContain(
      "—",
    );
  });
});

describe("validateAnswers", () => {
  const field = (over: Partial<FieldBlock> & { key: string }): FieldBlock => ({
    id: over.key,
    type: "field",
    key: over.key,
    label: over.label ?? over.key,
    fieldType: over.fieldType ?? "text",
    required: over.required ?? false,
    options: over.options,
  }) as FieldBlock;

  it("refuses a number question answered with words", () => {
    // The whole point: "banana" satisfied a required check, and the answer is
    // read back as a record value.
    const { problems } = validateAnswers(
      [field({ key: "units", fieldType: "number", required: true })],
      { units: "banana" },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].key).toBe("units");
  });

  it("takes a number that arrived as a string", () => {
    const { values } = validateAnswers(
      [field({ key: "units", fieldType: "number" })],
      { units: "12" },
    );
    expect(values.units).toBe(12);
  });

  it("refuses a select option that was never offered", () => {
    const { problems } = validateAnswers(
      [field({ key: "size", fieldType: "select", options: ["S", "M"] })],
      { size: "XXL" },
    );
    expect(problems).toHaveLength(1);
  });

  it("reports every problem, not just the first", () => {
    const { problems } = validateAnswers(
      [
        field({ key: "email", fieldType: "email", required: true }),
        field({ key: "units", fieldType: "number", required: true }),
      ],
      { email: "not-an-email", units: "nope" },
    );
    expect(problems.map((problem) => problem.key)).toEqual(["email", "units"]);
  });

  it("treats an empty optional answer as absent rather than invalid", () => {
    const { values, problems } = validateAnswers(
      [field({ key: "notes", fieldType: "longText" })],
      { notes: "" },
    );
    expect(problems).toHaveLength(0);
    expect("notes" in values).toBe(false);
  });

  it("is not satisfied by whitespace in a required question", () => {
    const { problems } = validateAnswers(
      [field({ key: "name", required: true })],
      { name: "   " },
    );
    expect(problems).toHaveLength(1);
  });

  it("drops keys the form never asked about", () => {
    const { values } = validateAnswers([field({ key: "name" })], {
      name: "Rudo",
      isAdmin: true,
    });
    expect(values).toEqual({ name: "Rudo" });
  });

  it("stores a file answer as the URL it landed at", () => {
    const { values, problems } = validateAnswers(
      [field({ key: "plan", fieldType: "file" })],
      { plan: "https://blob.example/companies/x/plan.pdf" },
    );
    expect(problems).toHaveLength(0);
    expect(values.plan).toContain("plan.pdf");
  });

  it("refuses a file answer that is not somewhere a file went", () => {
    const { problems } = validateAnswers(
      [field({ key: "plan", fieldType: "file", required: true })],
      { plan: "C:\\fakepath\\plan.pdf" },
    );
    expect(problems).toHaveLength(1);
  });
});
