/**
 * Development only: Explain a figure (PageVaneReport) answered the way the
 * engine answers it, for checking the report's Vane panel without a key to
 * Claude.
 *
 *   pnpm exec tsx scripts/vane-explain-seed.ts [workspace-slug]      (default: floorcode)
 *
 * A manager presses Explain on Deals' "Lost" bar, which queues the question
 * as a job of its own (`queueExplain`); the worker runs it (`runNextJob`)
 * with a scripted explainer standing in for Claude's part: one question
 * through Vane's own reader login (`run_sql`), a suggestion card raised with
 * `propose_item`, and two sentences worked out from the rows. The job records
 * its model as "scripted (dev seed)". Its answer opens at
 * `/reports/crm-deals?explain=<job>`.
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
import { explainQuestion, queueExplain } from "@/lib/vane/explain";
import { runNextJob } from "@/lib/vane/jobs";
import { useTestReaderLogins as signInTestReaders } from "@/lib/vane/test-reader-logins";

const SCRIPTED_MODEL = "scripted (dev seed)";

type Answer = { rows: Array<Record<string, unknown>>; sql: string; readFrom: string[] };

const money = (currency: unknown, amount: number) =>
  `${currency === "USD" || !currency ? "$" : `${String(currency)} `}${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What a table answered: the rows it gave. */
function readFrom(answer: Answer) {
  return answer.readFrom.map((table) => ({ table, rows: answer.rows.length }));
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
  const from = `${String(now.getUTCFullYear())}-01-01`;
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
  const asked = await prisma.vaneJob.findFirst({
    where: { companyId: company.id, kind: "explain", label: { startsWith: explainQuestion(about) } },
    select: { id: true },
  });
  if (asked) {
    console.log(`[vane-explain-seed] Lost was explained already: /reports/crm-deals?explain=${asked.id}`);
    return;
  }
  const job = await queueExplain(prisma, { companyId: company.id, userId: owner.id, about });
  console.log(`[vane-explain-seed] ${await runNextJob(new Date(), { client: scriptedExplainer(from), companyId: company.id, jobId: job.id })}`);
  console.log(`[vane-explain-seed] its answer: /reports/crm-deals?explain=${job.id}`);
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("vane-explain-seed is for development databases only.");
  const slug = process.argv[2] ?? "floorcode";
  const company = await prisma.company.findFirst({ where: { slug }, select: { id: true } });
  if (!company) throw new Error(`No workspace is called ${slug}.`);
  if (!process.env.VANE_READER_DATABASE_URL) await signInTestReaders();
  // The scripted stand-in answers instead of Claude; nothing is sent anywhere.
  process.env.VANE_MODEL ||= SCRIPTED_MODEL;
  const owner = await prisma.user.findFirst({ where: { companyId: company.id, role: { in: ["SUPERADMIN", "MANAGER"] } }, select: { id: true } });
  if (!owner) throw new Error(`No manager in ${slug} to ask the question.`);
  await explainLost(company, owner, new Date());
}

main()
  .catch((error) => {
    console.error("[vane-explain-seed]", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
