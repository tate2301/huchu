import { describe, expect, it } from "vitest";

import { answerQuestion, columnWords, explainQuestion, explainRequest, parseQuestions } from "./explain";
import { KEPT_ROWS, questionOf } from "./jobs";

const about = {
  report: "crm-deals",
  title: "Deals",
  figure: "Lost",
  value: "$1,458,600.00",
  params: { from: "2026-01-01", to: "" },
};

describe("Explain a figure", () => {
  it("asks in the person's words, and hands Claude the report and the figure", () => {
    expect(explainQuestion(about)).toBe("What is behind Lost, $1,458,600.00?");
    const request = explainRequest(about);
    expect(request.split("\n")[0]).toBe("What is behind Lost, $1,458,600.00?");
    expect(request).toContain("“Deals” (crm-deals), read with from 2026-01-01");
    expect(request).toContain("the figure “Lost” reads $1,458,600.00");
    expect(request).toContain("run_sql");
    // An empty choice is not said.
    expect(request).not.toContain("to ,");
  });

  it("keeps each question run_sql answered: the SQL, its columns and its first rows", () => {
    const rows = Array.from({ length: KEPT_ROWS + 5 }, (_, index) => ({ owner: `Rep ${index}`, lost: index }));
    const question = questionOf("run_sql", JSON.stringify({ sql: 'SELECT 1 FROM "CrmDeal"', rows, readFrom: ["crmdeal"] }));
    expect(question).toMatchObject({ sql: 'SELECT 1 FROM "CrmDeal"', columns: ["owner", "lost"], rowCount: KEPT_ROWS + 5 });
    expect(question?.rows).toHaveLength(KEPT_ROWS);
    expect(questionOf("get_record", JSON.stringify({ sql: "x", rows: [] }))).toBeUndefined();
    expect(questionOf("run_sql", "not json")).toBeUndefined();
  });

  it("rests the answer on the last question that drew rows, read back from the job's tool log", () => {
    const empty = { sql: "SELECT 2", columns: [], rows: [], rowCount: 0 };
    const full = { sql: "SELECT 1", columns: ["n"], rows: [{ n: 1 }], rowCount: 1 };
    const log = [
      { name: "describe_table", ms: 3, ok: true },
      { name: "run_sql", ms: 12, ok: true, reads: [{ table: "crmdeal", rows: 1 }], question: full },
      { name: "run_sql", ms: 9, ok: true, question: empty },
    ];
    const questions = parseQuestions(log);
    expect(questions).toEqual([full, empty]);
    expect(answerQuestion(questions)).toEqual(full);
    expect(answerQuestion([empty])).toEqual(empty);
    expect(answerQuestion([])).toBeNull();
    expect(parseQuestions("nonsense")).toEqual([]);
  });

  it("names columns as people read them", () => {
    expect(columnWords("lost_reason")).toBe("Lost reason");
    expect(columnWords("noCallAfter")).toBe("No call after");
    expect(columnWords("Lost because")).toBe("Lost because");
  });
});
