import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { proposeActions, type ActionProposal } from "./actions/engine";
import { VANE_ACTIONS } from "./actions/registry";
import { VANE_PAGES_GUIDE } from "./pages";
import { VANE_SUBJECTS } from "./panel";
import { readWorkspace, ReaderError, tablesFor, withReader, type ReadableTable } from "./reader";

/**
 * The tools Vane works with (`docs/vane.md`, `docs/handover-core-modules.md`
 * §3.2). Each has a name, a sentence for Claude, an input schema and a
 * handler. The schema is the single source: Claude is shown its JSON Schema,
 * and every call is checked against it before the handler runs.
 *
 * Reading goes through the reader roles (`reader.ts`); writing is limited to
 * Vane's own tables: cards (`VaneItem`) and plans (`VanePlan`). Drafts of
 * invoices, quotations and purchase orders are the next tool.
 */

export type ToolContext = {
  companyId: string;
  /** The job the call is part of, kept on what it writes. */
  jobId: string | null;
  /**
   * In a person's chat: the actions Vane proposes without a card, gathered
   * here and hung on its answer when it finishes.
   */
  answerActions?: ActionProposal[];
};

type VaneTool<Input extends z.ZodType> = {
  name: string;
  description: string;
  input: Input;
  run(context: ToolContext, input: z.infer<Input>): Promise<unknown>;
};

function tool<Input extends z.ZodType>(definition: VaneTool<Input>): VaneTool<Input> {
  return definition;
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

type Link = { column: string; parentTable: string; parentColumn: string };

const linksByTable = new Map<string, Promise<Link[]>>();

/** The single-column foreign keys out of a table: what its record points at. */
function linksOf(table: string): Promise<Link[]> {
  let links = linksByTable.get(table);
  if (!links) {
    links = prisma.$queryRaw<Link[]>`
      SELECT a.attname AS "column", parent.relname AS "parentTable", pa.attname AS "parentColumn"
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND n.nspname = 'public' AND child.relname = ${table} AND cardinality(c.conkey) = 1
      ORDER BY a.attname`;
    links.catch(() => linksByTable.delete(table));
    linksByTable.set(table, links);
  }
  return links;
}

function selectColumns(table: ReadableTable): string {
  return table.columns.map(quote).join(", ");
}

const typesByTable = new Map<string, Promise<Map<string, string>>>();

/** Each column's Postgres type, for describing a table. */
function columnTypes(table: string): Promise<Map<string, string>> {
  let types = typesByTable.get(table);
  if (!types) {
    types = prisma
      .$queryRaw<Array<{ column_name: string; udt_name: string }>>`
        SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table}`
      .then((rows) => new Map(rows.map((row) => [row.column_name, row.udt_name])));
    types.catch(() => typesByTable.delete(table));
    typesByTable.set(table, types);
  }
  return types;
}

const describeTable = tool({
  name: "describe_table",
  description:
    "The columns you may read on one table, with their types, and the tables its columns point at. Look a table up " +
    "before you query it: column names are camelCase and quoted, and columns you may not read are not listed.",
  input: z.object({
    table: z.string().min(1).describe('The table, as it is named: "SalesInvoice".'),
  }),
  async run({ companyId }, { table }) {
    const own = (await tablesFor(companyId)).get(table.toLowerCase());
    if (!own) throw new ReaderError("refused", `There is no table ${table} you can read.`);
    const types = await columnTypes(own.name);
    const links = (await linksOf(own.name)).filter((link) => own.columns.includes(link.column));
    return {
      table: own.name,
      columns: own.columns.map((name) => ({ name, type: types.get(name) ?? "unknown" })),
      links: links.map((link) => ({ column: link.column, table: link.parentTable, on: link.parentColumn })),
    };
  },
});

const runSql = tool({
  name: "run_sql",
  description:
    "Read the workspace with one PostgreSQL SELECT (or WITH … SELECT). Tables and columns are the app's own, quoted as they are " +
    'named: SELECT "number", "total" FROM "SalesInvoice" WHERE "status" = \'OVERDUE\'. Only this workspace\'s rows are visible, ' +
    "only granted columns can be selected (name them; SELECT * fails on a table with withheld columns), and only report " +
    "functions can be called. At most 500 rows come back, within five seconds. Keep the SQL: every card you raise from it " +
    "carries it.",
  input: z.object({
    sql: z.string().min(1).describe("One SELECT or WITH query."),
  }),
  async run({ companyId }, { sql }) {
    return readWorkspace(companyId, sql);
  },
});

const getRecord = tool({
  name: "get_record",
  description:
    "Read one record by its id, with the records it points at (its customer, its site, who made it), one level deep. " +
    "Only the columns the workspace lets you read are returned.",
  input: z.object({
    table: z.string().min(1).describe('The table, as it is named: "SalesInvoice", "Customer", "RetailPurchaseOrder".'),
    id: z.string().min(1).describe("The record's id."),
  }),
  async run({ companyId }, { table, id }) {
    return withReader(companyId, async ({ client, tables }) => {
      const own = tables.get(table.toLowerCase());
      if (!own || !own.columns.includes("id")) {
        throw new ReaderError("refused", `There is no table ${table} you can read records of by id.`);
      }
      const [record] = (await client.query(`SELECT ${selectColumns(own)} FROM ${quote(own.name)} WHERE "id" = $1`, [id])).rows;
      if (!record) return { table: own.name, id, record: null, links: {} };

      const links: Record<string, { table: string; record: Record<string, unknown> | null }> = {};
      for (const link of await linksOf(own.name)) {
        const value = record[link.column];
        const parent = tables.get(link.parentTable.toLowerCase());
        if (value === null || value === undefined || !parent || !parent.columns.includes(link.parentColumn)) continue;
        const [linked] = (
          await client.query(`SELECT ${selectColumns(parent)} FROM ${quote(parent.name)} WHERE ${quote(link.parentColumn)} = $1`, [value])
        ).rows;
        links[link.column] = { table: parent.name, record: linked ?? null };
      }
      return { table: own.name, id, record, links };
    });
  },
});

const proposeItem = tool({
  name: "propose_item",
  description:
    "Raise a card on the workspace's For you list: an issue (something wrong or due) or a suggestion (something worth doing). " +
    'The headline is the fact in one line ("$2,480.00 is overdue across 3 invoices"); the body gives the reason and ends with ' +
    'the proposal ("Let\'s send the three reminders."). The action is the one button a person presses. Include the SQL the ' +
    "card came from and what it read, so a person can check it. An open card with the same headline is not raised twice.",
  input: z.object({
    kind: z.enum(["ISSUE", "SUGGESTION"]),
    sourceModule: z.string().min(1).max(40).describe('Where it came from: "books", "crm", "retail", "people", "stock".'),
    headline: z.string().min(1).max(160),
    body: z.string().min(1).max(2000),
    action: z.object({
      type: z.string().min(1).max(40).describe('What the button does: "open", "send_reminders", "review_draft".'),
      label: z.string().min(1).max(40).describe('The button\'s words: "Send the reminders".'),
      target: z
        .string()
        .max(2000)
        .optional()
        .describe("The page it opens, with the filters that show just these records: \"/books/invoices?view=overdue&customer=<id>\". See the pages list."),
      shortcut: z.string().max(12).optional().describe('The key that presses it, when it is the card\'s main act: "S", "Ctrl ↵".'),
      also: z
        .object({ label: z.string().min(1).max(40), target: z.string().startsWith("/").max(2000) })
        .optional()
        .describe('A second, quieter way in: "Open the 11 rows" beside "Save as a template".'),
    }),
    subjectType: z
      .enum(VANE_SUBJECTS)
      .optional()
      .describe("The one record it is about, when there is one; the card then shows on that record's page too (a deal's, a lead's, a company's)."),
    subjectId: z.string().max(60).optional(),
    sql: z.string().max(20_000).optional(),
    readFrom: z
      .array(
        z.object({
          table: z.string().min(1),
          rows: z.number().int().nonnegative(),
          about: z.string().max(80).optional().describe('Which of its rows, in a few words: "won, last 7 days", "for those deals".'),
        }),
      )
      .max(20)
      .describe("The tables read, which of their rows, and how many rows each answered."),
    audienceRole: z.string().max(40).optional().describe("Who should see it, by role, when not everyone."),
    actions: z
      .array(z.object({ kind: z.string().min(1), params: z.record(z.string(), z.unknown()) }))
      .max(20)
      .optional()
      .describe("What you can do about it once a person approves, from the actions list (propose_actions). One per record where the action is one record's."),
  }),
  async run({ companyId, jobId }, { actions, ...input }) {
    const open = await prisma.vaneItem.findFirst({
      where: { companyId, status: "OPEN", headline: input.headline },
      select: { id: true },
    });
    if (open) return { id: open.id, raised: false, reason: "An open card already says this." };
    const item = await prisma.vaneItem.create({
      data: {
        companyId,
        jobId,
        kind: input.kind,
        sourceModule: input.sourceModule,
        headline: input.headline,
        body: input.body,
        action: input.action,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        sql: input.sql,
        readFrom: input.readFrom,
        audienceRole: input.audienceRole,
      },
      select: { id: true },
    });
    if (!actions?.length) return { id: item.id, raised: true };
    const { proposed, refused } = await proposeActions(prisma, { companyId, itemId: item.id }, actions);
    return { id: item.id, raised: true, actionsProposed: proposed.length, actionsRefused: refused };
  },
});

const proposePlan = tool({
  name: "propose_plan",
  description:
    "Lay out a larger piece of work as a plan: a title, when it is due, and its steps in order, each owned by Vane (work you " +
    "will do) or by a person (a decision or an act only they can take).",
  input: z.object({
    title: z.string().min(1).max(120).describe('"VAT return for September".'),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("YYYY-MM-DD."),
    steps: z
      .array(z.object({ label: z.string().min(1).max(160), owner: z.enum(["VANE", "PERSON"]) }))
      .min(1)
      .max(20),
  }),
  async run({ companyId }, { title, dueOn, steps }) {
    const plan = await prisma.vanePlan.create({
      data: {
        companyId,
        title,
        dueOn: dueOn ? new Date(`${dueOn}T00:00:00Z`) : undefined,
        steps: { create: steps.map((step, index) => ({ position: index + 1, label: step.label, owner: step.owner })) },
      },
      select: { id: true },
    });
    return { id: plan.id, steps: steps.length };
  },
});

/** The actions a person can approve, as Claude is shown them. */
function actionCatalogue(): string {
  return VANE_ACTIONS.map(
    (action) => `- ${action.kind}: ${action.description} Inputs: ${JSON.stringify(z.toJSONSchema(action.params as z.ZodType))}`,
  ).join("\n");
}

const proposeActionsTool = tool({
  name: "propose_actions",
  description:
    "Propose things you can do, for a person to approve or deny one by one. Nothing runs until they approve; they may change some inputs first (a date, a note). " +
    "Use it when what you found can be fixed: a due date to set, reminders to send, a task to raise. Several at once is fine: one per record. " +
    "With itemId they hang on that card (one you raised in this job); in a chat they hang on your answer. Never propose what the person did not need, " +
    "and never one that was denied before for the same record.\n\nThe actions:\n" +
    actionCatalogue() +
    "\n\n" +
    VANE_PAGES_GUIDE,
  input: z.object({
    itemId: z.string().min(1).optional().describe("The card they belong to, when they are about one you raised."),
    actions: z.array(z.object({ kind: z.string().min(1), params: z.record(z.string(), z.unknown()) })).min(1).max(20),
  }),
  async run({ companyId, answerActions }, { itemId, actions }) {
    if (itemId) {
      const card = await prisma.vaneItem.findFirst({ where: { id: itemId, companyId }, select: { id: true } });
      if (!card) return { proposed: 0, refused: [{ kind: "", why: `There is no card ${itemId} in this workspace.` }] };
      const { proposed, refused } = await proposeActions(prisma, { companyId, itemId }, actions);
      return { proposed: proposed.length, refused };
    }
    if (!answerActions) {
      return { proposed: 0, refused: [{ kind: "", why: "Outside a chat, actions hang on a card: give its itemId." }] };
    }
    // Checked now, written with the answer.
    const refused: Array<{ kind: string; why: string }> = [];
    for (const proposal of actions) {
      const action = VANE_ACTIONS.find((candidate) => candidate.kind === proposal.kind);
      const parsed = action?.params.safeParse(proposal.params);
      if (!action) refused.push({ kind: proposal.kind, why: `There is no action ${proposal.kind}.` });
      else if (!parsed?.success) refused.push({ kind: proposal.kind, why: z.prettifyError(parsed!.error) });
      else answerActions.push(proposal);
    }
    return { proposed: actions.length - refused.length, refused };
  },
});

export const VANE_TOOLS = [describeTable, runSql, getRecord, proposeItem, proposePlan, proposeActionsTool] as const;

/** The tools as Claude is shown them. */
export function toolDefinitions(): Anthropic.Tool[] {
  return VANE_TOOLS.map((definition) => ({
    name: definition.name,
    description: definition.description,
    input_schema: z.toJSONSchema(definition.input) as Anthropic.Tool.InputSchema,
  }));
}

export type ToolResult = { ok: boolean; content: string };

/**
 * Runs one tool call from Claude. A call Vane can correct (an input that does
 * not fit, a question the reader refused or Postgres turned down) comes back
 * as an error result for Claude to read; anything else is thrown for the job.
 */
export async function callTool(context: ToolContext, name: string, input: unknown): Promise<ToolResult> {
  const definition = VANE_TOOLS.find((candidate) => candidate.name === name);
  if (!definition) return { ok: false, content: `There is no tool called ${name}.` };
  const parsed = definition.input.safeParse(input);
  if (!parsed.success) return { ok: false, content: `The input does not fit ${name}: ${z.prettifyError(parsed.error)}` };
  try {
    // Each definition's run takes its own input; the parse above produced exactly that.
    const result = await (definition.run as (context: ToolContext, input: unknown) => Promise<unknown>)(context, parsed.data);
    return { ok: true, content: JSON.stringify(result) };
  } catch (error) {
    if (error instanceof ReaderError && error.code !== "misconfigured") return { ok: false, content: error.message };
    throw error;
  }
}
