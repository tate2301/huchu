import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { InvoiceRefused } from "@/lib/books/create-invoice";
import { draftInvoiceFromQuote, QuotationRefused } from "@/lib/books/quotations";
import { searchKnowledge } from "@/lib/crm/knowledge/store";
import { draftQuoteForVane, VaneQuoteRefused } from "@/lib/crm/knowledge/vane-quote";
import { draftWorkOrderForVane, WorkOrderRefused } from "@/lib/maintenance/work-orders";
import { getReportDefinition, REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { draftOrderForVane, OrderRefusal } from "@/lib/retail/buying/orders";

import { proposeActions, type ActionProposal } from "./actions/engine";
import { vaneOperations } from "./actions/engine";
import { blockSchema, type VaneBlock } from "./blocks";
import { usualTerms } from "./drafts";
import { moveVaneStep } from "./lists";
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
 * Vane's own tables, cards (`VaneItem`) and plans (`VanePlan`), and to drafts
 * (`draft`): an invoice or a purchase order written through the module's own
 * create code, marked `madeByVane`, which only a person issues or sends.
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
  /** In a chat: each question Vane ran this turn, its tables and how many rows answered, for "What I read" under the answer. */
  read?: Array<{ tables: string[]; rows: number }>;
  /** What Vane could not work out, when it says so (`report_problem`): the job ends on it. */
  problem?: { problem: string; sql: string | null };
  /** In a chat: what Vane shows beside its words (`show`), kept on its answer. */
  blocks?: VaneBlock[];
  /**
   * In a sales rep's chat: their user id. Vane reads only their own visits,
   * deals, leads and quotes (`vane_reader_rep`), drafts nothing, and its
   * cards are for them alone.
   */
  rep?: string | null;
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
  async run({ companyId, rep }, { table }) {
    const own = (await tablesFor(companyId, { rep })).get(table.toLowerCase());
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
  async run(context, { sql }) {
    const answer = await readWorkspace(context.companyId, sql, { rep: context.rep });
    if (context.read) {
      // The reader names tables as the SQL did, lowercased; the answer's "What I read" names them as the app does.
      const tables = await tablesFor(context.companyId, { rep: context.rep });
      context.read.push({ tables: answer.readFrom.map((name) => tables.get(name)?.name ?? name), rows: answer.rows.length });
    }
    return answer;
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
  async run({ companyId, rep }, { table, id }) {
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
    }, { rep });
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
      type: z
        .string()
        .min(1)
        .max(40)
        .describe(
          'What the button does: "open", "send_reminders", "review_draft". "send" for the message you wrote to go with a quote (subjectType CrmLeadDocument, subjectId the quote\'s document): the body is the message itself, which a person changes and sends with the quote from its page.',
        ),
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
    topic: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe('What kind of finding this is, in the same two or three words every time you raise one like it ("Short cash-up", "Invoices without a due date"). People can stop a topic for themselves; never raise a card on a topic a person stopped for them alone.'),
    subjectType: z
      .enum(VANE_SUBJECTS)
      .optional()
      .describe("The one record it is about, when there is one; the card then shows on that record's page too (a deal's, a lead's, a company's). For a suggestion about a list itself (send it on a schedule, add a column), use List with the list's path as subjectId (\"/books/invoices\")."),
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
    audienceUserId: z
      .string()
      .max(60)
      .optional()
      .describe("Who should see it, when it is one person's: a sales rep's own visit or quote is theirs (the record's assignedToId). A rep sees only cards addressed to them."),
    actions: z
      .array(z.object({ kind: z.string().min(1), params: z.record(z.string(), z.unknown()) }))
      .max(20)
      .optional()
      .describe("What you can do about it once a person approves, from the actions list (propose_actions). One per record where the action is one record's."),
  }),
  async run({ companyId, jobId, rep }, { actions, ...input }) {
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
        topic: input.topic,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        sql: input.sql,
        readFrom: input.readFrom,
        // A card raised in a rep's chat is theirs alone.
        audienceRole: rep ? null : input.audienceRole,
        audienceUserId: rep ?? input.audienceUserId,
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

const draftTool = tool({
  name: "draft",
  description:
    "Draft work through the module's own code, as Vane's draft (made by Vane, no person as its maker), for a person to check and send, issue or delete. It never sends, posts or issues anything. " +
    "invoice_from_quote: the invoice for an accepted quotation not yet invoiced, line for line, dated the day a person issues it, due on the customer's usual terms (leave dueDate out and they are read from the customer's past invoices). " +
    "reorder: a purchase order for one supplier and one branch, for products running low there, each with whole units and the cost last paid. " +
    "work_order: when one machine keeps breaking down the same way (WorkOrder history on that Equipment), a work order to fix the cause: the equipment, the issue, a note with the figures that show it (how many times, hours lost, since when), the priority, a technician when one is the obvious one, and the parts it needs from stores (InventoryItem at the equipment's site) by itemId. " +
    "quote: a quote on one deal or lead, priced from the knowledge base. Find each thing in it with search_knowledge first and give that price's knowledgePriceId: the line takes the price exactly as kept. Work out quantities from what you were told or read (a site visit's measurements, the deal's notes), with any allowance the knowledge base states. A line nothing in the knowledge base prices takes your estimate (unitPrice) and is marked for a person to check; say which and why. In a chat, show the quote you drafted (show, a quote block) and say in a sentence what it holds and what to check. A sales rep may quote only on their own deals and leads. " +
    "After drafting anything but a quote in a chat, raise a card (propose_item) about it, with actions to issue, send or raise it (books.invoice.issue, retail.order.send, assets.work_order.raise) and to delete it (books.invoice.discard, assets.work_order.discard), and link it.",
  // One object, not a union: a tool's input has to be a JSON object schema for Claude.
  input: z
    .object({
      kind: z.enum(["invoice_from_quote", "reorder", "work_order", "quote"]),
      quotationId: z.string().min(1).optional().describe("invoice_from_quote: the accepted quotation."),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("invoice_from_quote: when it falls due, when you know better than the customer's usual terms."),
      supplierId: z.string().min(1).optional().describe("reorder: who it is ordered from."),
      siteId: z.string().min(1).optional().describe("reorder: the branch it is delivered to."),
      expectedDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("reorder: when it should come."),
      lines: z
        .array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive(), unitCost: z.number().min(0) }))
        .max(100)
        .optional()
        .describe("reorder: each product, whole units, at the cost last paid."),
      equipmentId: z.string().min(1).optional().describe("work_order: the equipment."),
      issue: z.string().trim().min(1).max(1000).optional().describe('work_order: what to do, in a line: "Rebuild the feed pump; the seal has failed three times".'),
      note: z
        .string()
        .trim()
        .min(1)
        .max(600)
        .optional()
        .describe('work_order: what you found, with the figures: "The seal failed 3 times in 30 days, 11 hours lost since 14 September. The seal kit is in stores; the impeller is not."'),
      priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional().describe("work_order: HIGH when it has cost hours, URGENT when the machine is down now."),
      technicianId: z.string().min(1).optional().describe("work_order: the Employee who fixes it, when there is an obvious one."),
      downtimeStart: z.string().datetime().optional().describe("work_order: when the latest breakdown began."),
      parts: z
        .array(z.object({ name: z.string().min(1).max(200), itemId: z.string().min(1).optional(), quantity: z.number().positive() }))
        .max(30)
        .optional()
        .describe("work_order: the parts it needs, each a stores item by itemId where there is one."),
      dealId: z.string().min(1).optional().describe("quote: the deal it is for (or leadId)."),
      leadId: z.string().min(1).optional().describe("quote: the lead it is for (or dealId)."),
      quoteLines: z
        .array(
          z.object({
            knowledgePriceId: z.string().min(1).optional().describe("The kept knowledge price it is priced from (search_knowledge)."),
            description: z.string().trim().min(1).max(300).optional().describe("As the client reads it; the price's name and unit when left out."),
            quantity: z.number().positive(),
            unitPrice: z.number().min(0).optional().describe("Only for a line no knowledge price covers: your estimate."),
            taxRate: z.number().min(0).max(100).optional(),
          }),
        )
        .max(60)
        .optional()
        .describe("quote: its lines."),
      notes: z.string().trim().max(1000).optional().describe("quote: what the client should know: what it assumes, what it leaves out."),
      validDays: z.number().int().min(1).max(180).optional().describe("quote: how long it holds; 30 when left out."),
    })
    .refine(
      (input) =>
        input.kind === "invoice_from_quote"
          ? Boolean(input.quotationId)
          : input.kind === "reorder"
            ? Boolean(input.supplierId && input.siteId && input.lines?.length)
            : input.kind === "quote"
              ? Boolean((input.dealId || input.leadId) && input.quoteLines?.length)
              : Boolean(input.equipmentId && input.issue && input.note),
      {
        message: "invoice_from_quote needs quotationId; reorder needs supplierId, siteId and at least one line; work_order needs equipmentId, issue and note; quote needs dealId or leadId and at least one of quoteLines",
    }),
  async run({ companyId, rep }, input) {
    // A rep quotes on their own deals; the rest of drafting is not a rep's.
    if (rep && input.kind !== "quote") throw new ToolError("Drafting that is not something a sales rep's Vane does: say what you found instead.");
    const settings = await prisma.vaneSettings.findUnique({ where: { companyId }, select: { drafts: true } });
    if (settings && !settings.drafts) throw new ToolError("This workspace has Vane's drafts switched off (Management → Vane): raise a card instead.");
    try {
      if (input.kind === "quote") {
        const quote = await draftQuoteForVane(companyId, {
          dealId: input.dealId,
          leadId: input.leadId,
          lines: input.quoteLines ?? [],
          notes: input.notes ?? null,
          validDays: input.validDays,
          rep,
        });
        return {
          drafted: "quote",
          quotationId: quote.quotationId,
          quotationNumber: quote.quotationNumber,
          total: quote.total,
          currency: quote.currency,
          estimatedLines: quote.unpriced,
          link: quote.href,
        };
      }
      if (input.kind === "invoice_from_quote") {
        const today = new Date();
        const invoice = await draftInvoiceFromQuote(
          { companyId, userId: null, madeByVane: true },
          { quotationId: input.quotationId!, invoiceDate: today.toISOString().slice(0, 10), dueDate: input.dueDate ?? (await usualDueDate(companyId, input.quotationId!, today)) },
        );
        // Its page (PageVaneDraft) is where a person checks it, takes it on and issues it.
        return { drafted: "invoice", invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, customer: invoice.customer.name, total: invoice.total, link: `/books/invoices/${invoice.id}` };
      }
      if (input.kind === "work_order") {
        const order = await draftWorkOrderForVane(companyId, {
          equipmentId: input.equipmentId!,
          issue: input.issue!,
          note: input.note!,
          priority: input.priority ?? "NORMAL",
          technicianId: input.technicianId ?? null,
          downtimeStart: input.downtimeStart ? new Date(input.downtimeStart) : undefined,
          parts: input.parts ?? [],
        });
        return { drafted: "work_order", workOrderId: order.id, equipment: `${order.equipment.name}, ${order.equipment.equipmentCode}`, issue: order.issue, link: `/maintenance/work-orders/${order.id}` };
      }
      const order = await draftOrderForVane(companyId, { supplierId: input.supplierId!, siteId: input.siteId!, expectedDate: input.expectedDate ?? null, lines: input.lines ?? [] });
      return { drafted: "order", orderId: order.id, poNo: order.poNo, supplier: order.supplier, site: order.site, lines: order.lines, value: order.value, link: `/retail/buying/orders/${order.id}` };
    } catch (error) {
      if (error instanceof QuotationRefused || error instanceof InvoiceRefused || error instanceof WorkOrderRefused || error instanceof VaneQuoteRefused) throw new ToolError(error.message);
      if (error instanceof OrderRefusal) throw new ToolError(error.fieldErrors ? Object.values(error.fieldErrors)[0]! : error.message);
      throw error;
    }
  },
});

/** Due on the customer's usual terms from today, read off their issued invoices; null when they have none. */
async function usualDueDate(companyId: string, quotationId: string, today: Date): Promise<string | null> {
  const quote = await prisma.salesQuotation.findFirst({ where: { id: quotationId, companyId }, select: { customerId: true } });
  if (!quote) return null;
  const past = await prisma.salesInvoice.findMany({
    where: { companyId, customerId: quote.customerId, status: { in: ["ISSUED", "PAID"] }, dueDate: { not: null } },
    orderBy: { invoiceDate: "desc" },
    take: 20,
    select: { invoiceDate: true, dueDate: true },
  });
  const terms = usualTerms(past);
  return terms === null ? null : new Date(today.getTime() + terms * 86_400_000).toISOString().slice(0, 10);
}

const describeReport = tool({
  name: "describe_report",
  description:
    "The workspace's reports, as the Reports pages list them: with no key, every report's key, title and area; with a key, that report's columns (key, label, kind) and how it groups by default. " +
    "Use it to name a report's columns when you propose keeping a view of it (reports.template.save), and to link to /reports/<key>.",
  input: z.object({ reportKey: z.string().max(64).optional() }),
  async run(_context, { reportKey }) {
    if (!reportKey) return { reports: REPORT_DEFINITIONS.map((report) => ({ key: report.key, title: report.title, area: report.area })) };
    const report = getReportDefinition(reportKey);
    if (!report) throw new ToolError(`There is no report ${reportKey}. Call describe_report with no key for the list.`);
    return {
      key: report.key,
      title: report.title,
      columns: report.columns.map((column) => ({ key: column.key, label: column.label, kind: column.kind })),
      groupBy: report.defaults.groupBy ?? null,
    };
  },
});

const moveStep = tool({
  name: "update_plan_step",
  description:
    "Move one of your own steps in a plan on as you work: NOW while you work on it, with how far you are (\"38 of 61 lines\"), and DONE when it is finished. " +
    "A person's steps are theirs to tick; you can propose vane.plan.tick_step for one instead. When every step is done the plan is.",
  input: z.object({
    planId: z.string().min(1),
    stepId: z.string().min(1),
    status: z.enum(["NOW", "DONE"]),
    progress: z.string().max(60).optional().describe('How far, in a few words: "38 of 61 lines".'),
  }),
  async run({ companyId }, { planId, stepId, status, progress }) {
    const outcome = await moveVaneStep(prisma, { companyId }, { planId, stepId, status, progress });
    if (outcome === "not-found") throw new ToolError(`There is no step ${stepId} in plan ${planId}.`);
    if (outcome === "person-owns-it") throw new ToolError("That step is a person's: propose vane.plan.tick_step for it instead.");
    return { moved: true, status };
  },
});

const reportProblem = tool({
  name: "report_problem",
  description:
    "Say you could not work something out, and stop: what stopped you, in a sentence a person can act on (\"3 receipts have no amount, so the total would be a guess.\"), " +
    "and the SELECT that finds the rows you stopped at, so they can look at them. Use it rather than guessing; raise no card on what you could not work out.",
  input: z.object({
    problem: z.string().min(1).max(300),
    sql: z.string().max(20_000).optional().describe("One SELECT that returns the rows behind the problem, as run_sql takes it."),
  }),
  async run(context, { problem, sql }) {
    context.problem = { problem, sql: sql?.trim() || null };
    return { reported: true, next: "Stop here: answer in one sentence that you could not work it out." };
  },
});

/** The actions a person can approve, as Claude is shown them. */
/** The operations Vane may propose (its integration's), each with what it does and its inputs. */
function actionCatalogue(): string {
  return vaneOperations().map(
    (operation) => `- ${operation.key} (${operation.name}): ${operation.description} Inputs: ${JSON.stringify(z.toJSONSchema(operation.input as z.ZodType))}`,
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
      const action = vaneOperations().find((candidate) => candidate.key === proposal.kind);
      const parsed = action?.input.safeParse(proposal.params);
      if (!action) refused.push({ kind: proposal.kind, why: `There is no operation ${proposal.kind} that Vane may use.` });
      else if (!parsed?.success) refused.push({ kind: proposal.kind, why: z.prettifyError(parsed!.error) });
      else answerActions.push(proposal);
    }
    return { proposed: actions.length - refused.length, refused };
  },
});

const searchKnowledgeTool = tool({
  name: "search_knowledge",
  description:
    "Search the workspace's knowledge base (CRM → Knowledge): everything its people wrote down or uploaded about the business: FAQs, facts, tips, price lists, rate cards, product sheets, terms, how they work. " +
    "Returns the kept FAQs, facts and tips that match (the business's own words: go by these first), the passages of documents that match, with their document, and the kept prices that match (id, name, unit, price, where in the document it is). " +
    "Search it before you answer anything about the business (what it charges, offers, promises, how it does things, its policies), and before you price a quote: the knowledge base is the business's own word, so go by it over anything else you know. " +
    "Search with the words a price list would use (\"vinyl sheet\", \"screed\", \"call-out fee\"), one thing at a time. Name the document you went by, as a link: [Rate card 2026](/crm/knowledge/<docId>).",
  input: z.object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  async run({ companyId }, { query, limit }) {
    const hit = await searchKnowledge(prisma, companyId, query, limit ?? 8);
    return {
      entries: hit.entries.map((entry) => ({ kind: entry.kind, title: entry.title, body: entry.body, link: "/crm/knowledge?tab=" + entry.kind.toLowerCase() })),
      passages: hit.passages.map((passage) => ({ docId: passage.docId, document: passage.title, link: `/crm/knowledge/${passage.docId}`, text: passage.text })),
      prices: hit.prices.map((price) => ({
        knowledgePriceId: price.id,
        name: price.name,
        description: price.description,
        code: price.code,
        unit: price.unit,
        unitPrice: price.unitPrice,
        currency: price.currency,
        document: price.title,
        link: `/crm/knowledge/${price.docId}`,
        where: price.source,
      })),
      ...(hit.entries.length === 0 && hit.passages.length === 0 && hit.prices.length === 0 ? { note: "Nothing in the knowledge base matches. Try other words, or say it is not there." } : {}),
    };
  },
});

const show = tool({
  name: "show",
  description:
    "In a chat, put something beside your words that reads better seen than said: figures to read at a glance (up to four), a chart (bars by category, or a trend over time), a card for one record that opens it, a quote you drafted (by its quotationId: it is drawn from the quote as it stands, each line with the knowledge price behind it), or what you went by (the knowledge documents, as links). " +
    "Your words stay short and say what the reader should take from it; do not repeat in words what a block shows. Links are paths inside the app.",
  input: z.object({ blocks: z.array(blockSchema).min(1).max(6) }),
  async run(context, { blocks }) {
    if (!context.blocks) throw new ToolError("show is for a chat answer; on a card, say it in the card's words.");
    for (const block of blocks) {
      if (block.kind === "quote") {
        const exists = await prisma.salesQuotation.count({ where: { id: block.quotationId, companyId: context.companyId } });
        if (!exists) throw new ToolError(`There is no quote ${block.quotationId} here: show the quotationId the draft tool gave you.`);
      }
    }
    context.blocks.push(...blocks);
    return { shown: blocks.length };
  },
});

export const VANE_TOOLS = [describeTable, runSql, getRecord, searchKnowledgeTool, proposeItem, proposePlan, proposeActionsTool, moveStep, reportProblem, describeReport, draftTool, show] as const;

/** The tools as Claude is shown them. */
export function toolDefinitions(): Anthropic.Tool[] {
  return VANE_TOOLS.map((definition) => ({
    name: definition.name,
    description: definition.description,
    input_schema: z.toJSONSchema(definition.input) as Anthropic.Tool.InputSchema,
  }));
}

export type ToolResult = { ok: boolean; content: string };

/** A call Vane can correct, said back to it in a sentence: a step that is not there, or is a person's. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

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
    if (error instanceof ToolError) return { ok: false, content: error.message };
    throw error;
  }
}
