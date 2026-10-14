import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { customBlockSchema, displaySchema, type CustomBlock, type QueryBlock } from "@/lib/reports/custom/document";
import { checkBlocks } from "@/lib/reports/custom/run";
import { readableSources, toSource } from "@/lib/reports/custom/sources";
import { SQL_FUNCTIONS } from "@/lib/reports/sql/guard";
import { sourceTable, type SqlTable } from "@/lib/reports/sql/schema";

import type { MessagesClient } from "./claude";
import { jsonIn, VaneWriteRefused, writeAsJob } from "./write";

/** What Vane is asked to write a block in: the builder's query language, over the person's own report sources. */
const SYSTEM = `You are Vane, the helper inside Corelith. You write one block for a report a person is building: a query over the report sources they can read, in the builder's SQL (PostgreSQL's SELECT, over the tables listed, with only the functions listed), and how to show its rows. You never invent a table or a column. Answer with only a JSON object.`;

const answerSchema = z.object({
  name: z.string(),
  title: z.string().max(120).optional(),
  query: z.string(),
  display: displaySchema,
  note: z.string().max(400).describe("One or two sentences to the person: what the block shows and how it was written."),
});

export type VaneBlock = { block: QueryBlock; note: string };

function describeTables(tables: readonly SqlTable[]): string {
  return tables.map((table) => `- ${table.name} (${table.title}): ${table.columns.map((column) => `${column.sql} ${column.kind}`).join(", ")}`).join("\n");
}

function describeBlocks(blocks: readonly CustomBlock[]): string {
  const queries = blocks.filter((block): block is QueryBlock => block.type === "query");
  return queries.length ? queries.map((block) => `- @${block.name}${block.title ? ` (${block.title})` : ""}: ${block.query.replace(/\s+/g, " ").slice(0, 400)}`).join("\n") : "(none yet)";
}

/**
 * "Give Vane a change to make" in the report builder (the PageVaneBlock
 * board): Vane writes one block from the request, over the sources this
 * person may read, and the builder's own checker checks it before it is
 * offered; a block that does not check goes back to Vane once with the
 * problem. It is a draft: the builder shows it as Vane's, not kept, until the
 * person presses Keep.
 */
export async function writeReportBlock(
  db: PrismaClient,
  session: AuthenticatedSession,
  input: { request: string; blocks: CustomBlock[] },
  client?: MessagesClient,
): Promise<VaneBlock> {
  const tables = (await readableSources(session)).map(toSource).map(sourceTable);
  if (tables.length === 0) throw new VaneWriteRefused(409, "There are no reports here for Vane to build from.");
  const taken = new Set(input.blocks.flatMap((block) => (block.type === "query" ? [block.name.toLowerCase()] : [])));

  const prompt = (problem?: string) => `The person asked: ${input.request}

The report sources they can read, as tables (column, kind):
${describeTables(tables)}

The blocks already on the page, which a query can read by name (from @name):
${describeBlocks(input.blocks)}

Functions: ${Object.keys(SQL_FUNCTIONS).join(", ")}. period_start() and period_end() are the report's dates; filter dated rows by them.

Write one block: {"name": "won_m2" (letters, numbers and _, not one of ${[...taken].join(", ") || "the names above"}), "title": "Won, by month", "query": "select …", "display": {"type": "table"} or {"type": "chart", "form": "bars" | "trend", "by": "<a column of the result>"} or {"type": "figures"} or {"type": "breakdown", "by": "<column>"}, "note": "You asked for … It joins … so it is written in SQL."}.${problem ? `\n\nYour last block did not check: ${problem} Correct it.` : ""}`;

  return writeAsJob(
    db,
    { companyId: session.user.companyId, userId: session.user.id, name: session.user.name ?? null },
    `Wrote a report block: ${input.request.slice(0, 80)}`,
    async (ask) => {
      let problem: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const answer = answerSchema.safeParse(jsonIn(await ask(prompt(problem))));
        if (!answer.success) {
          problem = "the answer was not the JSON object asked for.";
          continue;
        }
        const parsed = customBlockSchema.safeParse({
          id: `vane-${randomUUID().slice(0, 8)}`,
          type: "query",
          name: answer.data.name,
          title: answer.data.title,
          query: answer.data.query,
          display: answer.data.display,
        });
        if (!parsed.success || parsed.data.type !== "query") {
          problem = parsed.success ? "it was not a query block." : (parsed.error.issues[0]?.message ?? "it did not fit a block.");
          continue;
        }
        if (taken.has(parsed.data.name.toLowerCase())) {
          problem = `the name @${parsed.data.name} is taken.`;
          continue;
        }
        const check = checkBlocks([...input.blocks, parsed.data], tables).get(parsed.data.id);
        if (!check?.ok) {
          problem = check ? check.problem.message : "it could not be checked.";
          continue;
        }
        return { block: parsed.data, note: answer.data.note };
      }
      throw new VaneWriteRefused(503, `Vane's block did not check: ${problem ?? "try asking another way."}`);
    },
    client,
    SYSTEM,
  );
}
