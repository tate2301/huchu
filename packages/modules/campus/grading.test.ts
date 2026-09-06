/**
 * How marks become a term mark and a grade.
 *
 * Pure functions, no database. The weighting rules here are the ones a report
 * card is printed from, so each test states the sentence a parent would read
 * rather than only the number.
 */

import { describe, it, expect } from "vitest";
import {
  computeTermMark,
  DEFAULT_GRADING_BANDS,
  findBandProblems,
  gradeFor,
  type ScoredAssessment,
} from "./grading";

const SCHEME = {
  continuousWeight: 30,
  examWeight: 70,
  bands: DEFAULT_GRADING_BANDS,
};

function ca(score: number | null, maxScore = 100, weight = 1): ScoredAssessment {
  return { kind: "CONTINUOUS", maxScore, weight, score };
}
function exam(score: number | null, maxScore = 100, weight = 1): ScoredAssessment {
  return { kind: "EXAM", maxScore, weight, score };
}

describe("gradeFor", () => {
  it("grades at the edges of a band, which are inclusive", () => {
    expect(gradeFor(DEFAULT_GRADING_BANDS, 75)?.grade).toBe("A");
    expect(gradeFor(DEFAULT_GRADING_BANDS, 100)?.grade).toBe("A");
    expect(gradeFor(DEFAULT_GRADING_BANDS, 50)?.grade).toBe("C");
    expect(gradeFor(DEFAULT_GRADING_BANDS, 0)?.grade).toBe("U");
  });

  it("returns null rather than a fallback when no band covers the mark", () => {
    // A hole in the table has to read as a missing grade on one report card,
    // which somebody fixes — not as a U on every report card, which nobody
    // questions.
    expect(gradeFor([{ grade: "A", minScore: 90, maxScore: 100 }], 40)).toBeNull();
  });
});

describe("findBandProblems", () => {
  it("accepts the default table", () => {
    expect(findBandProblems(DEFAULT_GRADING_BANDS)).toEqual([]);
  });

  it("reports two bands covering the same mark", () => {
    const problems = findBandProblems([
      { grade: "A", minScore: 70, maxScore: 100 },
      { grade: "B", minScore: 60, maxScore: 75 },
    ]);
    expect(problems.map((p) => p.message).join(" ")).toContain("both cover 70");
  });

  it("reports a gap no grade covers", () => {
    const problems = findBandProblems([
      { grade: "A", minScore: 80, maxScore: 100 },
      { grade: "C", minScore: 0, maxScore: 60 },
    ]);
    expect(problems.map((p) => p.message).join(" ")).toContain("nothing covers 60 to 80");
  });

  it("reports a band that runs backwards", () => {
    const problems = findBandProblems([{ grade: "A", minScore: 90, maxScore: 40 }]);
    expect(problems.map((p) => p.message).join(" ")).toContain("down to");
  });
});

describe("computeTermMark", () => {
  it("weights the two sides by the scheme", () => {
    // 80 continuous at 30 per cent, 60 exam at 70 per cent = 66.
    const result = computeTermMark([ca(80), exam(60)], SCHEME);
    expect(result.mark).toBe(66);
    expect(result.continuous).toBe(80);
    expect(result.exam).toBe(60);
    expect(result.grade?.grade).toBe("B");
    expect(result.caveat).toBeNull();
  });

  it("puts a test out of 20 and a paper out of 100 on the same scale", () => {
    // 15/20 is 75 per cent, not 15.
    const result = computeTermMark([ca(15, 20), exam(75)], SCHEME);
    expect(result.continuous).toBe(75);
    expect(result.mark).toBe(75);
  });

  it("weights one test more than another within the same side", () => {
    // 40 at weight 1 and 80 at weight 3 averages to 70, not 60.
    const result = computeTermMark([ca(40, 100, 1), ca(80, 100, 3)], SCHEME);
    expect(result.continuous).toBe(70);
  });

  it("counts a practical on the continuous side", () => {
    const result = computeTermMark(
      [{ kind: "PRACTICAL", maxScore: 100, weight: 1, score: 90 }, ca(70)],
      SCHEME,
    );
    expect(result.continuous).toBe(80);
  });

  it("does not scale a child who has only done the continuous work", () => {
    // The bug this guards: applying the 30 per cent weight to a term with no
    // exam yet reports a child who scored 80 on everything set as having 24.
    const result = computeTermMark([ca(80)], SCHEME);
    expect(result.mark).toBe(80);
    expect(result.caveat).toContain("no exam mark yet");
  });

  it("does not scale a child who has only sat the exam", () => {
    const result = computeTermMark([exam(64)], SCHEME);
    expect(result.mark).toBe(64);
    expect(result.caveat).toContain("Exam only");
  });

  it("leaves an absence out of the average rather than scoring it zero", () => {
    // Off sick for one of two tests. 80 on the other, so 80 — not 40.
    const result = computeTermMark([ca(80), ca(null), exam(80)], SCHEME);
    expect(result.continuous).toBe(80);
    expect(result.mark).toBe(80);
  });

  it("says nothing has been marked rather than reporting a zero", () => {
    const result = computeTermMark([ca(null), exam(null)], SCHEME);
    expect(result.mark).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.caveat).toBe("Nothing marked yet");
  });

  it("distinguishes an empty subject from an unmarked one", () => {
    expect(computeTermMark([], SCHEME).caveat).toBe("No assessments set");
  });

  it("honours a scheme that weights the exam entirely", () => {
    const result = computeTermMark([ca(20), exam(90)], {
      continuousWeight: 0,
      examWeight: 100,
      bands: DEFAULT_GRADING_BANDS,
    });
    expect(result.mark).toBe(90);
  });

  it("rounds to two places rather than carrying float noise onto a report", () => {
    const result = computeTermMark([ca(1, 3), exam(2, 3)], SCHEME);
    expect(Number.isInteger(result.mark! * 100)).toBe(true);
  });
});
