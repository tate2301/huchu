import { z } from "zod";

import { checkQuestion } from "@/lib/explore/guard";
import { PRODUCTS, type ProductKey } from "@/lib/explore/products";
import { customDocumentSchema, type CustomDocument } from "@/lib/reports/custom/document";
import { checkBlocks } from "@/lib/reports/custom/run";

import { libraryTableNames, libraryTables } from "./tables";

/**
 * The library's reading kinds: a report, an Explore question and an insight.
 * Each is SQL over the report sources, and each is checked here with the
 * guard the workspace runs it under — one SELECT, report sources only, the
 * report functions only — so an item that would be refused there cannot be
 * saved here.
 */

const PRODUCT_KEYS = PRODUCTS.map((product) => product.key) as [ProductKey, ...ProductKey[]];

/** One SELECT over the report sources, refused as Explore refuses it. */
const questionSql = z
  .string()
  .trim()
  .min(1, "Write its SQL")
  .max(20_000)
  .superRefine((sql, issues) => {
    const checked = checkQuestion(sql, libraryTableNames());
    if (!checked.ok) issues.addIssue({ code: "custom", message: checked.refusal.message.replace(/\.$/, "") });
  });

/** A custom report as Reports' builder makes it, with every block's SQL passing the report guard. */
export const reportPayloadSchema = customDocumentSchema.superRefine((document: CustomDocument, issues) => {
  const tables = libraryTables();
  for (const [id, check] of checkBlocks(document.blocks, tables)) {
    if (check.ok) continue;
    const block = document.blocks.find((candidate) => candidate.id === id);
    const name = block?.type === "query" ? block.name : id;
    issues.addIssue({ code: "custom", message: `${name}: ${check.problem.message.replace(/\.$/, "")}` });
  }
});

export const explorePayloadSchema = z.object({
  /** What it answers, in a line. */
  answers: z.string().trim().min(1, "Say what it answers").max(200),
  product: z.enum(PRODUCT_KEYS),
  /** What one row is ("visits"). */
  noun: z.string().trim().max(40).optional(),
  sql: questionSql,
});

export const insightPayloadSchema = z.object({
  /** The question, as one SELECT over the report sources. */
  sql: questionSql,
  /** The headline, with `{column}` holes filled from the answer's first row ("{count} quotes have waited a week"). */
  headline: z.string().trim().min(1, "Write its headline").max(200),
  /** A line under it, with the same holes. */
  body: z.string().trim().max(600).optional(),
  /** Raised only while the answer has rows. */
  onlyWhenRows: z.boolean().default(true),
  product: z.enum(PRODUCT_KEYS),
});

export type ExplorePayload = z.infer<typeof explorePayloadSchema>;
export type InsightPayload = z.infer<typeof insightPayloadSchema>;

export const EMPTY_REPORT: CustomDocument = { period: { from: "monthStart", to: "today" }, blocks: [] };
export const EMPTY_EXPLORE: ExplorePayload = { answers: "", product: "crm", sql: "select *\nfrom crm_quotes\n" };
export const EMPTY_INSIGHT: InsightPayload = {
  sql: "select count(*) as quotes, sum(total) as quoted\nfrom crm_quotes\nwhere lower(status) in ('draft', 'sent')\n  and issued <= current_date - 7\nhaving count(*) > 0\n",
  headline: "{quotes} quotes have waited more than a week",
  body: "{quoted} is waiting on an answer.",
  onlyWhenRows: true,
  product: "crm",
};
