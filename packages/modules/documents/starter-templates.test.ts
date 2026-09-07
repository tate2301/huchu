import { describe, expect, it } from "vitest";

import {
  BLOCKS_FOR_KIND,
  blockSchema,
  fieldBlocks,
  templateProblems,
} from "./blocks";
import { unknownVariables } from "./template-variables";
import {
  STARTER_TEMPLATES,
  starterBlocks,
  starterTemplate,
  startersForKind,
} from "./starter-templates";

/**
 * The point of these: a starter is the one template nobody proofreads, because
 * it arrived looking finished. So it is checked here instead — a starter that
 * fails the builder's own validation would hand somebody a broken document on
 * their first day and blame them for it.
 */
describe("starter templates", () => {
  it.each(STARTER_TEMPLATES.map((starter) => [starter.id, starter] as const))(
    "%s is a valid document",
    (_id, starter) => {
      for (const block of starter.blocks) {
        expect(() => blockSchema.parse(block)).not.toThrow();
      }
      expect(templateProblems(starter.kind, starter.blocks)).toEqual([]);
    },
  );

  it.each(STARTER_TEMPLATES.map((starter) => [starter.id, starter] as const))(
    "%s only uses blocks its kind allows",
    (_id, starter) => {
      const allowed = new Set(BLOCKS_FOR_KIND[starter.kind]);
      for (const block of starter.blocks) {
        expect(allowed.has(block.type)).toBe(true);
      }
    },
  );

  it.each(STARTER_TEMPLATES.map((starter) => [starter.id, starter] as const))(
    "%s uses no variable that nothing will fill",
    (_id, starter) => {
      // A variable nothing fills renders as a dash the sender never notices
      // and the customer reads as a letter addressed to nobody.
      const text = JSON.stringify(starter.blocks);
      expect(unknownVariables(text)).toEqual([]);
    },
  );

  it("gives every block a unique id, since ids are the drag and edit keys", () => {
    for (const starter of STARTER_TEMPLATES) {
      const ids: string[] = [];
      for (const block of starter.blocks) {
        ids.push(block.id);
        if (block.type === "columns") {
          ids.push(...block.left.map((child) => child.id));
          ids.push(...block.right.map((child) => child.id));
        }
      }
      expect(new Set(ids).size, `${starter.id} has a duplicate block id`).toBe(ids.length);
    }
  });

  it("gives every starter a distinct id", () => {
    const ids = STARTER_TEMPLATES.map((starter) => starter.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships a form somebody can actually fill in", () => {
    for (const starter of startersForKind("FORM")) {
      expect(fieldBlocks(starter.blocks).length).toBeGreaterThan(0);
    }
  });

  it("covers the documents a job actually needs", () => {
    // Named explicitly rather than counted: the test should fail when one of
    // these is dropped, not when an unrelated starter is added.
    for (const id of ["site-brief", "quotation", "invoice", "receipt"]) {
      expect(starterTemplate(id), `${id} is missing`).toBeDefined();
    }
  });

  it("shows the balance on the receipt, not only what was paid", () => {
    // A receipt that shows only the payment is how a deposit gets remembered
    // as the whole thing.
    const receipt = starterTemplate("receipt")!;
    expect(JSON.stringify(receipt.blocks)).toContain("document.balance");
  });
});

describe("starterBlocks", () => {
  it("renames the document to whatever somebody called it", () => {
    const starter = starterTemplate("site-brief")!;
    const blocks = starterBlocks(starter, "  Roof survey  ");
    const title = blocks.find((block) => block.id === "title");

    expect(title).toMatchObject({ type: "heading", text: "Roof survey" });
  });

  it("leaves the starter alone when there is no name yet", () => {
    const starter = starterTemplate("invoice")!;
    expect(starterBlocks(starter, "   ")).toEqual(starter.blocks);
  });

  it("does not mutate the shared starter", () => {
    const starter = starterTemplate("quotation")!;
    const before = JSON.stringify(starter.blocks);
    starterBlocks(starter, "Renamed");
    expect(JSON.stringify(starter.blocks)).toBe(before);
  });
});
