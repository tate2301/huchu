/**
 * Every template is a form the builder would accept, and the measured ones
 * draft the quote they promise.
 */
import { describe, expect, it } from "vitest";

import { bankSectionName, BUILDER_TEMPLATES, builderTemplate } from "@/lib/crm/site-visits/builder-templates";
import { fieldFromQuestion, questionFromField, SITE_VISIT_FIELD_TYPES } from "@/lib/crm/site-visits/fields";
import { fieldListSchema, fieldProblems } from "@/lib/forms/fields";
import { draftQuote, draftSubtotal, quoteLineProblems, quoteLinesSchema } from "@/lib/forms/quote";

describe("the templates", () => {
  it.each(BUILDER_TEMPLATES.map((template) => [template.name, template] as const))("%s is a form the builder accepts", (_, template) => {
    expect(fieldListSchema.safeParse(template.fields).success).toBe(true);
    expect(fieldProblems(template.fields)).toEqual([]);
    expect(quoteLinesSchema.safeParse(template.quoteLines).success).toBe(true);
    expect(quoteLineProblems(template.quoteLines, template.fields)).toEqual([]);
    for (const field of template.fields) {
      expect(SITE_VISIT_FIELD_TYPES).toContain(field.type);
      // Stored and read back, it is the same question.
      expect(fieldFromQuestion(questionFromField(field))).toEqual(field);
    }
  });

  it("has unique keys, the bank's included", () => {
    const keys = BUILDER_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names a bank section the way people say it", () => {
    expect(bankSectionName("8. EPOXY FLOORING")).toBe("Epoxy flooring");
    expect(builderTemplate("epoxy_flooring")?.name).toBe("Epoxy flooring");
  });

  it("drafts the epoxy quote from a measured floor, adding the primer when it is damp", () => {
    const epoxy = builderTemplate("epoxy_flooring_survey")!;
    const answers = {
      areas: [
        { name: "Shop floor", length: 18, width: 10.5 },
        { name: "Storeroom", length: 6.2, width: 5 },
        { name: "Loading bay", length: 5, width: 4 },
      ],
      coving: [18, 10.5, 18, 5.5],
      moisture: 3.8,
    };
    const dry = draftQuote(epoxy.quoteLines, epoxy.fields, answers);
    expect(dry.map((line) => [line.lineId, line.quantity])).toEqual([
      ["system", 259.2],
      ["prep", 240],
      ["coving", 52],
    ]);
    const damp = draftQuote(epoxy.quoteLines, epoxy.fields, { ...answers, moisture: 4.6 });
    expect(damp.at(-1)).toMatchObject({ lineId: "primer", quantity: 240, amount: 1800 });
    expect(draftSubtotal(damp) - draftSubtotal(dry)).toBe(1800);
  });

  it("quotes tiles in whole boxes", () => {
    const tiles = builderTemplate("tile_installation_survey")!;
    const [boxes] = draftQuote(tiles.quoteLines, tiles.fields, { areas: [{ name: "Kitchen", length: 6, width: 4 }] });
    // 24 m² × 1.1 = 26.4 m², at 1.44 m² a box.
    expect(boxes).toMatchObject({ lineId: "tiles", quantity: 19 });
  });
});
