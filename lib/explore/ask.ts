import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { MessagesClient } from "@/lib/vane/claude";
import { jsonIn, writeAsJob, type Who } from "@/lib/vane/write";
import type { SqlTable } from "@/lib/reports/sql/schema";

import { checkQuestion } from "./guard";

/**
 * Ask in plain words (the studio's ask box): Vane writes the question's SQL
 * over the tables this person reads, and says in one line what it did. It is
 * a draft like anything Vane writes: it lands in the editor, where the person
 * reads it, changes it, runs it and saves it. Vane runs nothing and saves
 * nothing here, and SQL that does not pass the guard is sent back to it once
 * with the reason, then refused.
 */

export type AskMode = "new" | "change";

export type AskInput = {
  question: string;
  mode: AskMode;
  /** The question on screen, for Change this. */
  sql?: string;
};

export type AskAnswer = { sql: string; note: string };

const SYSTEM = `You are Vane, the helper inside Corelith, a business platform. A person is asking a question about their workspace's data in plain words. You write one PostgreSQL SELECT (or WITH … SELECT) that answers it, over only the tables and columns you are given, and one short sentence saying what the question does or what you changed. Write lower-case SQL, one clause per line. Use only these functions: aggregates, windows, round, coalesce, nullif, date_trunc, extract, to_char, current_date, lower, upper, concat. Never write anything that changes data. Answer with JSON only: {"sql": "...", "note": "..."}. The note is plain British English, sentence case, no more than 25 words, and never mentions SQL, Vane, Claude or anything automatic.`;

const answerSchema = z.object({ sql: z.string().trim().min(1).max(20_000), note: z.string().trim().min(1).max(400) });

/** The tables as Claude is told them: name, what it is, and each column with its kind. */
export function describeTables(tables: readonly SqlTable[]): string {
  return tables
    .map((table) => `${table.name} (${table.title}): ${table.columns.map((column) => `${column.sql} ${column.kind}`).join(", ")}`)
    .join("\n");
}

export function askPrompt(input: AskInput, tables: readonly SqlTable[], problem?: string): string {
  const parts = [`Tables:\n${describeTables(tables)}`];
  if (input.mode === "change" && input.sql) parts.push(`The question on screen now:\n${input.sql}\n\nChange it so that: ${input.question}`);
  else parts.push(`Question: ${input.question}`);
  if (problem) parts.push(`Your last answer was refused: ${problem} Write it again.`);
  return parts.join("\n\n");
}

export class AskRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskRefused";
  }
}

/** Vane writes the question. Throws `VaneWriteRefused` when Vane is paused, over its allowance or cannot be reached. */
export async function askVane(db: PrismaClient, who: Who, input: AskInput, tables: readonly SqlTable[], client?: MessagesClient): Promise<AskAnswer> {
  const readable = new Set(tables.map((table) => table.name));
  return writeAsJob(
    db,
    who,
    `Explore: ${input.question.slice(0, 80)}`,
    async (ask) => {
      let problem: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const parsed = answerSchema.safeParse(jsonIn(await ask(askPrompt(input, tables, problem))));
        if (!parsed.success) {
          problem = "It was not the JSON asked for.";
          continue;
        }
        const checked = checkQuestion(parsed.data.sql, readable);
        if (checked.ok) return { sql: parsed.data.sql.trim().endsWith(";") ? parsed.data.sql.trim() : `${parsed.data.sql.trim()};`, note: parsed.data.note };
        problem = checked.problem.message;
      }
      throw new AskRefused(`Vane could not write that as a question over your tables${problem ? `: ${problem}` : "."}`);
    },
    client,
    SYSTEM,
  );
}
