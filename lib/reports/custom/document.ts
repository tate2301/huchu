import { z } from "zod";

import { measureSchema, naturalGrouping, type LayoutBlock } from "@/lib/reports/layout";
import { sqlName } from "@/lib/reports/sql/schema";
import { TEMPLATE_AUDIENCES } from "@/lib/reports/template-access";
import type { ReportMeta, ReportParam } from "@/lib/reports/types";

/**
 * A report somebody builds: a page of blocks, the way a report's own page is,
 * except that each data block brings its own rows — a query over the
 * workspace's report sources — and says how to show them: as a table, a
 * chart, headline figures or a breakdown.
 *
 * What is stored is this document. Rows never are: a custom report is fetched
 * fresh each time, through the same sources and the same checks as the
 * reports it reads, so it can never show anybody more than they could see.
 */

const id = z.string().min(1).max(40);
const columnKey = z.string().min(1).max(64);
const half = z.boolean().optional();

/** How a block's rows are read, the way the matching block on a report's page reads them. */
export const displaySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("table") }),
  z.object({
    type: z.literal("chart"),
    form: z.enum(["bars", "trend"]),
    by: z.string().min(1, "Choose what each chart is drawn by").max(64),
    measure: measureSchema.optional(),
    limit: z.number().int().min(3).max(20).optional(),
  }),
  /** One row: each column as a headline figure. Many: the row count and each numeric total. */
  z.object({ type: z.literal("figures") }),
  z.object({ type: z.literal("breakdown"), by: columnKey.optional(), limit: z.number().int().min(3).max(50).optional() }),
]);
export type BlockDisplay = z.infer<typeof displaySchema>;
export type DisplayType = BlockDisplay["type"];

/** A block's name, as other blocks read it: `from @won_deals`. */
export const BLOCK_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

export const MAX_QUERY_LENGTH = 20_000;

const headingBlock = z.object({
  id,
  type: z.literal("heading"),
  text: z.string().max(120),
  level: z.union([z.literal(1), z.literal(2)]).optional(),
  half,
});
const textBlock = z.object({ id, type: z.literal("text"), text: z.string().max(4000), half });
const queryBlock = z.object({
  id,
  type: z.literal("query"),
  name: z.string().regex(BLOCK_NAME, "A block name is letters, numbers and _, starting with a letter"),
  title: z.string().max(120).optional(),
  query: z.string().max(MAX_QUERY_LENGTH),
  display: displaySchema,
  half,
});

export const customBlockSchema = z.discriminatedUnion("type", [headingBlock, textBlock, queryBlock]);
export type CustomBlock = z.infer<typeof customBlockSchema>;
export type QueryBlock = z.infer<typeof queryBlock>;

const dateDefault = z.union([
  z.enum(["today", "monthStart", "yearStart"]),
  z.string().regex(/^-\d{1,4}d$/) as z.ZodType<`-${number}d`>,
]);
export type DateDefault = z.infer<typeof dateDefault>;

export const customDocumentSchema = z
  .object({
    /** The dates the report opens with, passed to every source that is dated. Null leaves an end open. */
    period: z.object({ from: dateDefault.nullable(), to: dateDefault.nullable() }),
    blocks: z.array(customBlockSchema).max(40),
  })
  .superRefine((document, issues) => {
    const names = new Set<string>();
    for (const block of document.blocks) {
      if (block.type !== "query") continue;
      const name = block.name.toLowerCase();
      if (names.has(name)) issues.addIssue({ code: "custom", message: `Two blocks are named ${block.name}` });
      names.add(name);
    }
  });
export type CustomDocument = z.infer<typeof customDocumentSchema>;

export const customReportInputSchema = z.object({
  title: z.string().trim().min(1, "Give the report a title").max(120),
  description: z.string().trim().max(500).nullable().optional(),
  /** Who sees it besides whoever made it: just them, the managers, or everyone — as a report template says it. */
  audience: z.enum(TEMPLATE_AUDIENCES).default("JUST_ME"),
  document: customDocumentSchema,
});
export type CustomReportInput = z.output<typeof customReportInputSchema>;

/** A custom report as the browser is told it. */
export type CustomReport = CustomReportInput & {
  id: string;
  /** This person may let the managers or everyone see it. */
  canShare: boolean;
  /** This person made it. */
  mine: boolean;
  /** This person can change it. */
  editable: boolean;
  updatedAt: string;
};

export type CustomReportSummary = Pick<CustomReport, "id" | "title" | "description" | "audience" | "mine" | "editable" | "updatedAt"> & {
  /** The tables its queries read, for the area it lists under. */
  areaSources: string[];
  /** Whoever made it, by name. */
  madeBy: string | null;
};

/** The dates as the params a dated source takes. */
export function periodParams(period: CustomDocument["period"]): ReportParam[] {
  return [
    { key: "from", label: "Date", type: "date", ...(period.from ? { default: period.from } : {}) },
    { key: "to", label: "To", type: "date", ...(period.to ? { default: period.to } : {}) },
  ];
}

/* ──────────────────────────────────────────────────────────────────────────
   Starting points
   ────────────────────────────────────────────────────────────────────────── */

/** A free name like `deals`, `deals_2`, … among the blocks there are. */
export function freeBlockName(base: string, blocks: readonly CustomBlock[]): string {
  const stem = base.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^[^A-Za-z_]+/, "").replace(/_+$/, "").slice(0, 32) || "result";
  const taken = new Set(blocks.filter((block) => block.type === "query").map((block) => block.name.toLowerCase()));
  if (!taken.has(stem.toLowerCase())) return stem;
  for (let n = 2; ; n += 1) if (!taken.has(`${stem}_${n}`.toLowerCase())) return `${stem}_${n}`;
}

export function freeBlockId(kind: string, blocks: readonly CustomBlock[]): string {
  const taken = new Set(blocks.map((block) => block.id));
  for (let n = 1; ; n += 1) if (!taken.has(`${kind}-${n}`)) return `${kind}-${n}`;
}

/** The short name a source goes by in a query block: `crm-deals` → `deals`. */
export function sourceStem(key: string): string {
  return key.split("-").slice(1).join("_") || key.replace(/-/g, "_");
}

/** A first block over a source: its rows as a table. */
export function starterDocument(source: Pick<ReportMeta, "key"> | null): CustomDocument {
  if (!source) return { period: { from: "-90d", to: "today" }, blocks: [] };
  return {
    period: { from: "-90d", to: "today" },
    blocks: [
      {
        id: "query-1",
        type: "query",
        name: sourceStem(source.key),
        query: `select *\nfrom ${sqlName(source.key)}\n`,
        display: { type: "table" },
      },
    ],
  };
}

/**
 * A report's own page, rebuilt as a custom report a person can take further:
 * each block becomes a query over the report with the same display. The
 * figures become an aggregate, so what they total is written out to change.
 */
export function documentFromReport(meta: Pick<ReportMeta, "key" | "columns" | "layout" | "params">): CustomDocument {
  const blocks: CustomBlock[] = [];
  const stem = sourceStem(meta.key);
  const from = `select *\nfrom ${sqlName(meta.key)}\n`;
  const add = (block: Omit<QueryBlock, "id" | "name" | "type">, half?: boolean) =>
    blocks.push({
      id: freeBlockId("query", blocks),
      type: "query",
      name: freeBlockName(stem, blocks),
      ...block,
      ...(half ? { half: true } : {}),
    });

  const layout: LayoutBlock[] = meta.layout?.blocks ?? [{ id: "table", type: "table" }];
  for (const block of layout) {
    switch (block.type) {
      case "heading":
      case "text":
        blocks.push({ ...block, id: freeBlockId(block.type, blocks) });
        break;
      case "figures": {
        const totals = meta.columns.filter((column) => column.total === "sum");
        const items = ["count(*) as row_count", ...totals.map((column) => `sum(${sqlName(column.key)}) as ${sqlName(column.key)}`)];
        add({ query: `select ${items.join(",\n  ")}\nfrom ${sqlName(meta.key)}\n`, display: { type: "figures" } }, block.half);
        break;
      }
      case "chart":
        add(
          {
            query: from,
            ...(block.title ? { title: block.title } : {}),
            display: {
              type: "chart",
              form: block.form,
              // Results name their columns the SQL way.
              by: sqlName(block.by),
              ...(block.measure ? { measure: { ...block.measure, column: sqlName(block.measure.column) } } : {}),
              ...(block.limit ? { limit: block.limit } : {}),
            },
          },
          block.half,
        );
        break;
      case "breakdown": {
        const natural = block.by ?? naturalGrouping(meta.columns)?.key;
        const by = natural ? sqlName(natural) : undefined;
        add({ query: from, display: { type: "breakdown", ...(by ? { by } : {}), ...(block.limit ? { limit: block.limit } : {}) } }, block.half);
        break;
      }
      case "table":
        add({ query: from, display: { type: "table" } });
        break;
    }
  }
  // The report's own dates, so the copy opens on the rows the report did.
  const dated = (key: string) => {
    const param = meta.params.find((candidate) => candidate.key === key);
    return param?.type === "date" ? param.default ?? null : null;
  };
  return { period: { from: dated("from"), to: dated("to") }, blocks };
}
