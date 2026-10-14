/**
 * Development only: gives a workspace Vane's day the way the engine makes it,
 * for building and checking `/vane` without a key to Claude.
 *
 *   pnpm exec tsx scripts/vane-dev-seed.ts [workspace-slug]      (default: floorcode)
 *
 * Nothing here is written by hand. It queues the day's nightly look and runs
 * it through the worker (`runNextJob` in lib/vane/jobs.ts): the questions go
 * through Vane's own reader login (`run_sql`), and the cards and plan are
 * written by Vane's tools (`propose_item`, `propose_plan`), so every figure
 * on a card is what the workspace's rows say and every card keeps its SQL.
 * The only stand-in is Claude's part: a fixed script that asks four
 * questions and raises a card for each that found something. The job records
 * its model as "scripted (dev seed)". Then it gives Vane one person's job,
 * which stays queued until a real key runs it, and a second, larger one that
 * the worker runs with a scripted planner: it reads the quotes through the
 * reader and lays out a plan with `propose_plan`, which waits for the person
 * to press Start (Plans, and Give Vane a job's `?job=<id>`).
 *
 * Explain a figure (PageVaneReport): James presses Explain on Deals' "Lost"
 * bar, which gives Vane the question as a job; a scripted explainer runs one
 * question through the reader, raises a suggestion card with `propose_item`
 * and answers in two sentences worked out from the rows
 * (`/reports/crm-deals?explain=<job>`).
 *
 * Vane's reader signs in with VANE_READER_DATABASE_URL when it is set; on a
 * development database without one it uses the test logins the Vane tests
 * create (lib/vane/test-reader-logins.ts). It refuses to run in production.
 */
import "dotenv/config";

import type Anthropic from "@anthropic-ai/sdk";

import { prisma } from "@/lib/prisma";
import { getReportDefinition } from "@/lib/reports/registry";
import { defaultView, encodeView } from "@/lib/reports/view";
import type { MessagesClient } from "@/lib/vane/claude";
import { explainQuestion } from "@/lib/vane/explain";
import { runNextJob } from "@/lib/vane/jobs";
import { shopDay } from "@/lib/vane/pages";
import { giveVaneJob } from "@/lib/vane/panel";
import { useTestReaderLogins as signInTestReaders } from "@/lib/vane/test-reader-logins";

const SCRIPTED_MODEL = "scripted (dev seed)";

type Answer = { rows: Array<Record<string, unknown>>; sql: string; readFrom: string[] };

const QUESTIONS = {
  overdue: `SELECT i."invoiceNumber", c."name" AS customer, i."currency", round((i."total" - i."amountPaid")::numeric, 2) AS owed,
       (now()::date - i."dueDate"::date) AS days_late
FROM "SalesInvoice" i
JOIN "Customer" c ON c."id" = i."customerId"
WHERE i."status" = 'ISSUED' AND i."dueDate" < now() AND i."total" > i."amountPaid"
ORDER BY days_late DESC`,
  quotes: `SELECT q."quotationNumber", c."name" AS customer, q."currency", round(q."total"::numeric, 2) AS total, q."quotationDate"::date AS sent_on
FROM "SalesQuotation" q
JOIN "Customer" c ON c."id" = q."customerId"
LEFT JOIN "SalesInvoice" i ON i."quotationId" = q."id"
WHERE q."status" = 'SENT' AND q."quotationDate" < now() - interval '14 days' AND i."id" IS NULL
ORDER BY q."quotationDate"`,
  tasks: `SELECT t."title", t."dueAt"::date AS due_on, (now()::date - t."dueAt"::date) AS days_late
FROM "CrmTask" t
WHERE t."status" = 'OPEN' AND t."dueAt" < now()
ORDER BY t."dueAt"`,
  followUps: `SELECT f."title", f."dueAt"::date AS due_on
FROM "CrmFollowUp" f
WHERE f."status" = 'PENDING' AND f."dueAt" < now()
ORDER BY f."dueAt"`,
} as const;

type Question = keyof typeof QUESTIONS;

const money = (currency: unknown, amount: number) =>
  `${currency === "USD" || !currency ? "$" : `${String(currency)} `}${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (value: unknown) =>
  new Date(String(value)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** What a table answered: the rows, and for a joined table the distinct records named. */
function readFrom(answer: Answer, distinct: Record<string, string> = {}) {
  return answer.readFrom.map((table) => {
    const key = distinct[table.toLowerCase()];
    const rows = key ? new Set(answer.rows.map((row) => String(row[key]))).size : answer.rows.length;
    return { table, rows };
  });
}

/** The cards the script raises from what the four questions found. */
function proposals(answers: Partial<Record<Question, Answer>>) {
  const calls: Array<{ name: string; input: unknown }> = [];
  const overdue = answers.overdue;
  if (overdue?.rows.length) {
    const total = overdue.rows.reduce((sum, row) => sum + Number(row.owed), 0);
    const oldest = overdue.rows[0]!;
    calls.push({
      name: "propose_item",
      input: {
        kind: "ISSUE",
        sourceModule: "books",
        headline: `${money(oldest.currency, total)} is overdue across ${overdue.rows.length} invoices.`,
        body: `${String(oldest.customer)} has owed ${oldest.invoiceNumber} the longest, ${oldest.days_late} days past its due date. Let's go through the overdue invoices, oldest first.`,
        action: { type: "open", label: "Open the overdue invoices", target: "/books/invoices?view=overdue" },
        sql: overdue.sql,
        readFrom: readFrom(overdue, { customer: "customer" }),
      },
    });
    calls.push({
      name: "propose_plan",
      input: {
        title: "Collect what is overdue",
        steps: [
          { label: `List what each of the ${new Set(overdue.rows.map((row) => row.customer)).size} customers owes, and for how long`, owner: "VANE" },
          { label: "Call the customers who owe the most", owner: "PERSON" },
          { label: "Send statements to the rest", owner: "PERSON" },
          { label: "Check what was paid by the end of the week", owner: "VANE" },
        ],
      },
    });
  }
  const quotes = answers.quotes;
  if (quotes?.rows.length) {
    const oldest = quotes.rows[0]!;
    calls.push({
      name: "propose_item",
      input: {
        kind: "SUGGESTION",
        sourceModule: "crm",
        headline: `${quotes.rows.length} quotes have waited more than two weeks with no answer.`,
        body: `The oldest is ${oldest.quotationNumber} for ${String(oldest.customer)}, ${money(oldest.currency, Number(oldest.total))}, sent on ${day(oldest.sent_on)}. Let's follow them up or close the ones that are gone.`,
        action: { type: "open", label: "Open the quotes", target: "/crm/quotes" },
        sql: quotes.sql,
        // No invoice row answered: the join found none for these quotes.
        readFrom: readFrom(quotes, { customer: "customer" }).map((entry) => (entry.table.toLowerCase() === "salesinvoice" ? { ...entry, rows: 0 } : entry)),
      },
    });
  }
  const tasks = answers.tasks;
  if (tasks?.rows.length) {
    const oldest = tasks.rows[0]!;
    calls.push({
      name: "propose_item",
      input: {
        kind: "ISSUE",
        sourceModule: "crm",
        headline: `${tasks.rows.length} tasks are past their due date.`,
        body: `The oldest, “${String(oldest.title)}”, was due on ${day(oldest.due_on)}. Let's finish them or give them new dates.`,
        action: { type: "open", label: "Open the tasks", target: "/crm/tasks" },
        sql: tasks.sql,
        readFrom: readFrom(tasks),
      },
    });
  }
  const followUps = answers.followUps;
  if (followUps?.rows.length) {
    calls.push({
      name: "propose_item",
      input: {
        kind: "SUGGESTION",
        sourceModule: "crm",
        headline: `${followUps.rows.length} follow-ups are overdue.`,
        body: `The oldest, “${String(followUps.rows[0]!.title)}”, was due on ${day(followUps.rows[0]!.due_on)}. Let's make the calls today.`,
        action: { type: "open", label: "Open the follow-ups", target: "/crm/follow-ups" },
        sql: followUps.sql,
        readFrom: readFrom(followUps),
      },
    });
  }
  return calls;
}

function reply(content: Anthropic.ContentBlock[], stop: Anthropic.Message["stop_reason"]): Anthropic.Message {
  return {
    id: `msg_seed_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: SCRIPTED_MODEL,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

/** A person's job too large for one look: it becomes a plan that waits for Start. */
const PLAN_REQUEST =
  "Get every quote that has waited more than two weeks answered or closed by Friday, so the pipeline is honest for Monday's meeting.";

/** The Friday after `now`, YYYY-MM-DD. */
function nextFriday(now: Date): string {
  const day = new Date(`${shopDay(now)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (((5 - day.getUTCDay() + 7) % 7) || 7));
  return day.toISOString().slice(0, 10);
}

/** Claude's part for the person's job, scripted: read the waiting quotes, then lay the work out as a plan. */
function scriptedPlanner(now: Date): MessagesClient {
  const create = async (params: { messages: Anthropic.MessageParam[] }) => {
    const turn = params.messages.filter((message) => message.role === "assistant").length;
    const last = params.messages[params.messages.length - 1];
    const results = Array.isArray(last?.content)
      ? (last.content as Anthropic.ToolResultBlockParam[]).filter((block) => block.type === "tool_result")
      : [];
    if (turn === 0) {
      return reply([{ type: "tool_use", id: "q_quotes", name: "run_sql", input: { sql: QUESTIONS.quotes } } as unknown as Anthropic.ContentBlock], "tool_use");
    }
    if (turn === 1) {
      const answer = results[0] && !results[0].is_error ? (JSON.parse(String(results[0].content)) as Answer) : null;
      const quotes = answer?.rows.length ?? 0;
      const customers = new Set(answer?.rows.map((row) => row.customer)).size;
      return reply(
        [
          {
            type: "tool_use",
            id: "p_plan",
            name: "propose_plan",
            input: {
              title: "Answer or close the quotes waiting over two weeks",
              dueOn: nextFriday(now),
              steps: [
                { label: `List the ${quotes} quotes with their customer, value and the day each went out`, owner: "VANE" },
                { label: `Find which of the ${customers} customers have been in touch since their quote`, owner: "VANE" },
                { label: "Call the customers with the five largest quotes", owner: "PERSON" },
                { label: "Close the quotes that are gone, with the reason", owner: "PERSON" },
                { label: "On Friday, raise a card for each quote still waiting", owner: "VANE" },
              ],
            },
          } as unknown as Anthropic.ContentBlock,
        ],
        "tool_use",
      );
    }
    return reply(
      [{ type: "text", text: "Read the quotes waiting over two weeks and laid out a plan in five steps; it waits for Start.", citations: null } as unknown as Anthropic.ContentBlock],
      "end_turn",
    );
  };
  return { messages: { create } } as unknown as MessagesClient;
}

/** Claude's part, scripted: ask the four questions, raise what they found, then say what it did. */
function scriptedClaude(): MessagesClient {
  const order = Object.keys(QUESTIONS) as Question[];
  let cards = 0;
  let plans = 0;
  const create = async (params: { messages: Anthropic.MessageParam[] }) => {
    const turn = params.messages.filter((message) => message.role === "assistant").length;
    const last = params.messages[params.messages.length - 1];
    const results = Array.isArray(last?.content)
      ? (last.content as Anthropic.ToolResultBlockParam[]).filter((block) => block.type === "tool_result")
      : [];
    if (turn === 0) {
      return reply(
        order.map((question) => ({ type: "tool_use", id: `q_${question}`, name: "run_sql", input: { sql: QUESTIONS[question] } }) as unknown as Anthropic.ContentBlock),
        "tool_use",
      );
    }
    if (turn === 1) {
      const answers: Partial<Record<Question, Answer>> = {};
      for (const result of results) {
        const question = result.tool_use_id.replace(/^q_/, "") as Question;
        if (result.is_error) {
          console.warn(`[vane-dev-seed] ${question}: ${String(result.content)}`);
          continue;
        }
        answers[question] = JSON.parse(String(result.content)) as Answer;
      }
      const calls = proposals(answers);
      cards = calls.filter((call) => call.name === "propose_item").length;
      plans = calls.length - cards;
      if (calls.length === 0) return reply([{ type: "text", text: "Looked over the workspace and found nothing to raise.", citations: null } as unknown as Anthropic.ContentBlock], "end_turn");
      return reply(
        calls.map((call, index) => ({ type: "tool_use", id: `p_${index}`, ...call }) as unknown as Anthropic.ContentBlock),
        "tool_use",
      );
    }
    const failed = results.filter((result) => result.is_error).length;
    const raised = `${cards} ${cards === 1 ? "card" : "cards"}${plans ? " and a plan" : ""}`;
    const text = `Looked over invoices, quotes, tasks and follow-ups, and raised ${raised}${failed ? `; ${failed} did not go through` : ""}.`;
    return reply([{ type: "text", text, citations: null } as unknown as Anthropic.ContentBlock], "end_turn");
  };
  return { messages: { create } } as unknown as MessagesClient;
}

/** A figure explained on Deals (PageVaneReport): the question a person asks by pressing Explain on the "Lost" bar. */
function lostQuestion(from: string): string {
  return `SELECT coalesce(d."lostReason", 'No reason given') AS "Lost because",
       count(*)::int AS "Deals",
       round(sum(coalesce(d."value", 0))::numeric, 2) AS "Value",
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM "CrmActivity" a
         WHERE a."dealId" = d."id" AND a."type" = 'CALL' AND a."createdAt" BETWEEN d."lostAt" - interval '30 days' AND d."lostAt"))::int AS "No call, 30 days"
FROM "CrmDeal" d
JOIN "CrmPipelineStage" s ON s."id" = d."stageId"
WHERE s."name" = 'Lost' AND d."archivedAt" IS NULL AND (d."expectedCloseDate" >= '${from}' OR d."expectedCloseDate" IS NULL)
GROUP BY 1
ORDER BY 2 DESC`;
}

/** The report's address with a view: the Lost deals, grouped by why. */
function lostView(): string {
  const definition = getReportDefinition("crm-deals");
  if (!definition) return "/reports/crm-deals";
  const view = {
    ...defaultView({ columns: definition.columns, defaults: definition.defaults }),
    conditions: [{ column: "stage", op: "is" as const, value: ["Lost"] }],
    groupBy: "lostReason",
    columns: definition.columns.map((column) => ({ key: column.key, hidden: column.key === "lostReason" ? false : column.hidden === true })),
  };
  return `/reports/crm-deals?v=${encodeView(view)}`;
}

/**
 * Claude's part for an Explain, scripted: one question through the reader, a
 * suggestion card when the breakdown is worth keeping, then the answer in two
 * sentences, every figure in it worked out from the rows the question drew.
 */
function scriptedExplainer(from: string): MessagesClient {
  let answer = "Read the lost deals and found none in these dates.";
  const create = async (params: { messages: Anthropic.MessageParam[] }) => {
    const turn = params.messages.filter((message) => message.role === "assistant").length;
    const last = params.messages[params.messages.length - 1];
    const results = Array.isArray(last?.content)
      ? (last.content as Anthropic.ToolResultBlockParam[]).filter((block) => block.type === "tool_result")
      : [];
    if (turn === 0) {
      return reply([{ type: "tool_use", id: "q_lost", name: "run_sql", input: { sql: lostQuestion(from) } } as unknown as Anthropic.ContentBlock], "tool_use");
    }
    if (turn === 1) {
      const read = results[0] && !results[0].is_error ? (JSON.parse(String(results[0].content)) as Answer) : null;
      const rows = read?.rows ?? [];
      const deals = rows.reduce((sum, row) => sum + Number(row.Deals), 0);
      if (!read || deals === 0) return reply([{ type: "text", text: answer, citations: null } as unknown as Anthropic.ContentBlock], "end_turn");
      const top = rows[0]!;
      const silent = rows.reduce((sum, row) => sum + Number(row["No call, 30 days"]), 0);
      const share = Number(top.Deals) === deals ? `All ${deals}` : `${top.Deals} of the ${deals}`;
      answer =
        `${share} deals lost this year went one way: “${String(top["Lost because"])}”, ${money("USD", Number(top.Value))} between them. ` +
        (silent === deals
          ? `None of the ${deals} had a call logged in the 30 days before it was lost.`
          : `${silent} of the ${deals} had no call logged in the 30 days before it was lost.`);
      return reply(
        [
          {
            type: "tool_use",
            id: "p_keep",
            name: "propose_item",
            input: {
              kind: "SUGGESTION",
              sourceModule: "reports",
              headline: "Let’s keep this view.",
              body: "Deals lost this year, grouped by why they were lost. I would call it “Deals lost, and why”.",
              action: {
                type: "open",
                label: "Save as a template",
                shortcut: "Ctrl ↵",
                target: `${lostView()}&save=1`,
                also: { label: `Open the ${deals} rows`, target: lostView() },
              },
              sql: read.sql,
              readFrom: readFrom(read),
            },
          } as unknown as Anthropic.ContentBlock,
        ],
        "tool_use",
      );
    }
    return reply([{ type: "text", text: answer, citations: null } as unknown as Anthropic.ContentBlock], "end_turn");
  };
  return { messages: { create } } as unknown as MessagesClient;
}

/** A person presses Explain on Deals' "Lost" bar; the worker runs it with the scripted explainer. */
async function explainLost(company: { id: string }, owner: { id: string }, now: Date): Promise<void> {
  const from = `${shopDay(now).slice(0, 4)}-01-01`;
  const lost = await prisma.crmDeal.aggregate({
    where: {
      companyId: company.id,
      archivedAt: null,
      stage: { name: "Lost" },
      OR: [{ expectedCloseDate: { gte: new Date(`${from}T00:00:00Z`) } }, { expectedCloseDate: null }],
    },
    _sum: { value: true },
    _count: true,
  });
  if (!lost._count) return;
  const value = money("USD", Number(lost._sum.value ?? 0));
  const about = { report: "crm-deals", title: "Deals", figure: "Lost", value, params: { from } };
  const asked = await prisma.vaneJob.findFirst({ where: { companyId: company.id, kind: "explain", label: explainQuestion(about) }, select: { id: true } });
  if (asked) {
    console.log(`[vane-dev-seed] Lost was explained already: /reports/crm-deals?explain=${asked.id}`);
    return;
  }
  const job = await giveVaneJob(prisma, { companyId: company.id, userId: owner.id, text: `Lost, ${value}`, about });
  console.log(`[vane-dev-seed] ${await runNextJob(new Date(), { client: scriptedExplainer(from), companyId: company.id, jobId: job.id })}`);
  console.log(`[vane-dev-seed] its answer: /reports/crm-deals?explain=${job.id}`);
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("vane-dev-seed is for development databases only.");
  const slug = process.argv[2] ?? "floorcode";
  const company = await prisma.company.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!company) throw new Error(`No workspace is called ${slug}.`);
  if (!process.env.VANE_READER_DATABASE_URL) await signInTestReaders();
  // The scripted stand-in answers instead of Claude; nothing is sent anywhere.
  process.env.VANE_MODEL ||= SCRIPTED_MODEL;

  const now = new Date();
  const key = `nightly:${shopDay(now)}`;
  const existing = await prisma.vaneJob.findUnique({ where: { companyId_key: { companyId: company.id, key } }, select: { id: true } });
  if (existing) {
    console.log(`[vane-dev-seed] ${company.name} already had today's look (${key}); nothing new.`);
  } else {
    await prisma.vaneJob.create({
      data: { companyId: company.id, key, kind: "nightly", label: "Looking over the workspace", trigger: "NIGHTLY", runAfter: now },
    });
    console.log(`[vane-dev-seed] ${await runNextJob(now, { client: scriptedClaude(), companyId: company.id })}`);
  }

  const owner = await prisma.user.findFirst({ where: { companyId: company.id, role: { in: ["SUPERADMIN", "MANAGER"] } }, select: { id: true } });
  const waiting = await prisma.vaneJob.count({ where: { companyId: company.id, trigger: "PERSON", status: { in: ["QUEUED", "WAITING", "RUNNING"] } } });
  if (owner && waiting === 0) {
    const job = await giveVaneJob(prisma, {
      companyId: company.id,
      userId: owner.id,
      text: "Which site visits from the last two weeks have no quote yet?",
    });
    console.log(`[vane-dev-seed] queued a person's job: ${job.label}`);
  }

  // A person's larger job, run now: the plan it lays out waits for that person to press Start.
  const planned = await prisma.vaneJob.findFirst({ where: { companyId: company.id, request: PLAN_REQUEST }, select: { id: true } });
  if (owner && !planned) {
    const job = await giveVaneJob(prisma, { companyId: company.id, userId: owner.id, text: PLAN_REQUEST });
    console.log(`[vane-dev-seed] ${await runNextJob(new Date(), { client: scriptedPlanner(now), companyId: company.id, jobId: job.id })}`);
    console.log(`[vane-dev-seed] its plan waits for Start: /vane/plans?job=${job.id}`);
  } else if (planned) {
    console.log(`[vane-dev-seed] the planned job is there already: /vane/plans?job=${planned.id}`);
  }

  if (owner) await explainLost(company, owner, now);
}

main()
  .catch((error) => {
    console.error("[vane-dev-seed]", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
