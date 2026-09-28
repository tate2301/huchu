import { describe, it, expect } from "vitest";

import { validateAnswers, type FieldDefinition } from "@/lib/forms/fields";

import {
  blockFields,
  emptyBlock,
  fieldBlocks,
  templateProblems,
  type Block,
  type FieldBlock,
} from "./blocks";
import {
  resolveVariables,
  sampleValues,
  unknownVariables,
  usedVariables,
} from "./template-variables";

/** A question block; `over` sets the question's own definition. */
function field(id: string, over: Partial<FieldDefinition> = {}): FieldBlock {
  const block = emptyBlock("field", id, new Set()) as FieldBlock;
  return { ...block, field: { ...block.field, key: id, label: "Question", ...over } };
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
      field("b", { label: "Pick", key: "same", type: "select", options: [] }),
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

describe("validateAnswers, as a template asks", () => {
  // A template's questions are checked by the one validator every form uses;
  // these go through `blockFields` so the wiring is what is under test.
  const ask = (...blocks: FieldBlock[]) => blockFields(blocks);
  const question = (over: Partial<FieldDefinition> & { key: string }) =>
    field(over.key, { label: over.key, ...over });

  it("refuses a number question answered with words", () => {
    // The whole point: "banana" satisfied a required check, and the answer is
    // read back as a record value.
    const { problems } = validateAnswers(
      ask(question({ key: "units", type: "number", required: true })),
      { units: "banana" },
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].key).toBe("units");
  });

  it("takes a number that arrived as a string", () => {
    const { values } = validateAnswers(
      ask(question({ key: "units", type: "number" })),
      { units: "12" },
    );
    expect(values.units).toBe(12);
  });

  it("refuses a select option that was never offered", () => {
    const { problems } = validateAnswers(
      ask(question({ key: "size", type: "select", options: [{ value: "S", label: "S" }, { value: "M", label: "M" }] })),
      { size: "XXL" },
    );
    expect(problems).toHaveLength(1);
  });

  it("reports every problem, not just the first", () => {
    const { problems } = validateAnswers(
      ask(
        question({ key: "email", type: "email", required: true }),
        question({ key: "units", type: "number", required: true }),
      ),
      { email: "not-an-email", units: "nope" },
    );
    expect(problems.map((problem) => problem.key)).toEqual(["email", "units"]);
  });

  it("treats an empty optional answer as absent rather than invalid", () => {
    const { values, problems } = validateAnswers(
      ask(question({ key: "notes", type: "longText" })),
      { notes: "" },
    );
    expect(problems).toHaveLength(0);
    expect("notes" in values).toBe(false);
  });

  it("is not satisfied by whitespace in a required question", () => {
    const { problems } = validateAnswers(
      ask(question({ key: "name", required: true })),
      { name: "   " },
    );
    expect(problems).toHaveLength(1);
  });

  it("drops keys the form never asked about", () => {
    const { values } = validateAnswers(
      ask(question({ key: "name" })), {
      name: "Rudo",
      isAdmin: true,
    });
    expect(values).toEqual({ name: "Rudo" });
  });

  it("stores a file answer as the URL it landed at", () => {
    const { values, problems } = validateAnswers(
      ask(question({ key: "plan", type: "file" })),
      { plan: "https://blob.example/companies/x/plan.pdf" },
    );
    expect(problems).toHaveLength(0);
    expect(values.plan).toContain("plan.pdf");
  });

  it("refuses a file answer that is not somewhere a file went", () => {
    const { problems } = validateAnswers(
      ask(question({ key: "plan", type: "file", required: true })),
      { plan: "C:\\fakepath\\plan.pdf" },
    );
    expect(problems).toHaveLength(1);
  });
});
