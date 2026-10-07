/**
 * A form's insights from its visits: where reps stop answering, how each use
 * of the floor was measured and won, and which question is worth requiring.
 */
import { describe, expect, it } from "vitest";

import { builderTemplate } from "@/lib/crm/site-visits/builder-templates";
import { questionFromField, type StoredAnswer } from "@/lib/crm/site-visits/fields";
import { formInsights, type InsightSection } from "@/lib/crm/site-visits/insights";
import { valueColumnsFor } from "@/lib/crm/site-visits/answers";

const epoxy = builderTemplate("epoxy_flooring_survey")!;
// Moisture is optional here, so it can be left blank — as it is on the shop floor.
const fields = epoxy.fields.map((field) => (field.key === "moisture" ? { ...field, required: false } : field));
const set = { questions: fields.map(questionFromField), quoteLines: epoxy.quoteLines };
const type = Object.fromEntries(set.questions.map((question) => [question.key, question.type]));

function visit(answers: Record<string, unknown>, won = false, day = "2026-07-02"): InsightSection {
  return {
    createdAt: new Date(`${day}T09:00:00Z`),
    appointment: { deal: { status: won ? "WON" : "OPEN" } },
    answers: Object.entries(answers).map(([key, value]): StoredAnswer & { questionKey: string; notApplicable: boolean } => {
      const field = fields.find((candidate) => candidate.key === key)!;
      const columns = valueColumnsFor(type[key], value, field);
      return { questionKey: key, notApplicable: false, questionType: type[key], ...columns, valueDate: columns.valueDate };
    }),
  };
}

const floor = (length: number, width: number) => [{ name: "Floor", length, width }];

describe("a form's insights", () => {
  const sections = [
    visit({ area_use: "retail_floor", areas: floor(12, 10), moisture: 3.2 }, true, "2026-07-02"),
    visit({ area_use: "retail_floor", areas: floor(10, 10) }, false, "2026-08-11"),
    visit({ area_use: "warehouse", areas: floor(20, 10), moisture: 5 }, true, "2026-09-20"),
  ];
  const insights = formInsights(set, sections);

  it("counts visits, quotes drafted and wins since the first visit", () => {
    expect(insights).toMatchObject({ visits: 3, drafted: 3, won: 2, since: "2026-07-02" });
  });

  it("says how often each question is answered", () => {
    const moisture = insights.questions.find((question) => question.key === "moisture");
    expect(moisture).toMatchObject({ asked: 3, answered: 2, feedsQuote: true });
    expect(insights.questions.find((question) => question.key === "colour")).toMatchObject({ answered: 0, feedsQuote: false });
  });

  it("breaks the visits down by the use of the floor, with what they measured", () => {
    expect(insights.breakdown).toEqual({
      question: "What is the area used for?",
      unit: "m²",
      rows: [
        { answer: "Retail floor", visits: 2, won: 1, measuredPerVisit: 110 },
        { answer: "Warehouse", visits: 1, won: 1, measuredPerVisit: 200 },
      ],
    });
    expect(insights.figures.measuredPerVisit).toBe(140);
  });

  it("suggests requiring the question the quote depends on that goes unanswered", () => {
    // Colour is blank everywhere, but no quote line reads it.
    expect(insights.suggestion).toEqual({ key: "moisture", label: "Moisture reading", missing: 1 });
  });

  it("has nothing to say about a form never used", () => {
    expect(formInsights(set, [])).toMatchObject({ visits: 0, since: null, suggestion: null, figures: { measuredPerVisit: null } });
  });
});
