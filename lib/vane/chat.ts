import { randomUUID } from "node:crypto";

import type Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";

import { actionsFor, proposeActions, type ActionProposal, type VaneActionView } from "./actions/engine";
import { VaneError, type MessagesClient } from "./claude";
import { runConversation } from "./conversation";
import { jobsStartedThisMonthFor } from "./jobs";
import { moduleName } from "./panel";
import { vaneRules } from "./prompt";
import { tablesFor } from "./reader";

/**
 * A person's chat with Vane, in the panel (`VaneMessage`). Each person has
 * their own conversation. A turn runs while they wait: Vane reads what it
 * needs through its tools and answers in words, with any actions it proposes
 * hung on the answer for them to approve or deny. The panel is blocked until
 * it finishes, and hears what Vane is doing as it goes. Each turn is a
 * `VaneJob` of kind "chat", so it counts against the month's allowance and
 * keeps what it cost.
 */

export type VaneChatMessage = {
  id: string;
  author: "person" | "vane";
  text: string;
  createdAt: string;
  actions: VaneActionView[];
};

export type ChatEvent =
  /** What Vane is doing now: "Reading the workspace". */
  | { type: "working"; label: string }
  | { type: "answer"; message: VaneChatMessage }
  | { type: "error"; error: string };

type Who = { companyId: string; userId: string; role: string; name: string | null };

/** A turn's share of time: the route holds the request open for it. */
const TURN_MS = 90_000;
/** A chat turn left RUNNING longer than this lost its request, and no longer holds the person's panel. */
const STALE_MS = 3 * 60_000;
/** Turns of the conversation Claude is shown before the new one. */
const HISTORY = 20;

/** What each tool is doing, in the panel's words. */
function workingLabel(tool: string, input: unknown): string {
  const table = input && typeof input === "object" && "table" in input ? String((input as { table: unknown }).table) : null;
  switch (tool) {
    case "describe_table":
      return table ? `Looking at ${table.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}` : "Looking at the tables";
    case "run_sql":
      return "Reading the workspace";
    case "get_record":
      return "Reading a record";
    case "propose_item":
      return "Writing a card";
    case "propose_plan":
      return "Breaking it into a plan";
    case "propose_actions":
      return "Getting the actions ready";
    default:
      return "Working it out";
  }
}

const CHAT = (who: Who, page: string | null) => `

You are talking with ${who.name ?? "a person"} (${who.role.toLowerCase().replace(/_/g, " ")}) in the Vane panel${page ? `, on ${page}` : ""}. Answer what they ask, in a few short sentences, first person, with names and exact amounts. When what you find can be done, propose it with propose_actions, one per record, so they approve or deny each; then say in a sentence what you proposed. When they ask for something only they can do, say where. Write every link as [words](/path?filters), never a bare path. Never say you did something you only proposed.`;

/** This person's conversation, oldest first, with the actions on each answer. */
export async function chatHistory(
  db: Pick<PrismaClient, "vaneMessage" | "vaneAction">,
  { companyId, userId }: { companyId: string; userId: string },
  take = 40,
): Promise<VaneChatMessage[]> {
  const rows = await db.vaneMessage.findMany({
    where: { companyId, userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, author: true, text: true, createdAt: true },
  });
  rows.reverse();
  const { byMessage } = await actionsFor(db, companyId, { messageIds: rows.map((row) => row.id) });
  return rows.map((row) => ({
    id: row.id,
    author: row.author === "PERSON" ? "person" : "vane",
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    actions: byMessage.get(row.id) ?? [],
  }));
}

/** The conversation as Claude reads it: alternating turns, starting with the person's. */
function asMessages(history: Array<{ author: "PERSON" | "VANE"; text: string }>): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    const role = turn.author === "PERSON" ? "user" : "assistant";
    const last = messages[messages.length - 1];
    if (last?.role === role && typeof last.content === "string") last.content = `${last.content}\n\n${turn.text}`;
    else if (messages.length > 0 || role === "user") messages.push({ role, content: turn.text });
  }
  return messages;
}

/**
 * One turn: the person's words, then Vane's answer. Refused while Vane is
 * paused or the month's jobs are used, and while this person's last turn is
 * still running. `onEvent` hears what Vane is doing; the answer (or why there
 * is none) comes last.
 */
export async function chatTurn(
  db: PrismaClient,
  who: Who,
  { text, module }: { text: string; module?: string | null },
  { onEvent, client, now = () => new Date() }: { onEvent: (event: ChatEvent) => void; client?: MessagesClient; now?: () => Date },
): Promise<void> {
  const settings = await db.vaneSettings.findUnique({ where: { companyId: who.companyId }, select: { paused: true, monthlyAllowance: true } });
  if (settings?.paused) return onEvent({ type: "error", error: "Vane is paused. Resume it to ask it anything new." });
  if ((await jobsStartedThisMonthFor(db, who.companyId, now())) >= (settings?.monthlyAllowance ?? 5000)) {
    return onEvent({ type: "error", error: "This month's jobs are used. Vane starts again on the 1st." });
  }
  const busy = await db.vaneJob.findFirst({
    where: { companyId: who.companyId, requestedById: who.userId, kind: "chat", status: "RUNNING", startedAt: { gt: new Date(now().getTime() - STALE_MS) } },
    select: { id: true },
  });
  if (busy) return onEvent({ type: "error", error: "Vane is still answering your last message." });

  const earlier = await db.vaneMessage.findMany({
    where: { companyId: who.companyId, userId: who.userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY,
    select: { author: true, text: true },
  });
  await db.vaneMessage.create({ data: { companyId: who.companyId, userId: who.userId, author: "PERSON", text } });
  const job = await db.vaneJob.create({
    data: {
      companyId: who.companyId,
      key: `chat:${randomUUID()}`,
      kind: "chat",
      label: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      trigger: "PERSON",
      requestedById: who.userId,
      status: "RUNNING",
      attempts: 1,
      startedAt: now(),
    },
    select: { id: true },
  });

  onEvent({ type: "working", label: "Reading your question" });
  const answerActions: ActionProposal[] = [];
  try {
    const tables = [...(await tablesFor(who.companyId)).values()].map((table) => table.name).sort();
    const outcome = await runConversation({
      system: vaneRules(tables) + CHAT(who, module ? moduleName(module) : null),
      messages: asMessages([...earlier.reverse(), { author: "PERSON", text }]),
      context: { companyId: who.companyId, jobId: job.id, answerActions },
      deadline: Date.now() + TURN_MS,
      client,
      onTool: (tool, input) => onEvent({ type: "working", label: workingLabel(tool, input) }),
    });
    const answer = await db.vaneMessage.create({
      data: { companyId: who.companyId, userId: who.userId, author: "VANE", text: outcome.text || "Done.", jobId: job.id },
      select: { id: true, text: true, createdAt: true },
    });
    if (answerActions.length) await proposeActions(db, { companyId: who.companyId, messageId: answer.id }, answerActions);
    await db.vaneJob.update({
      where: { id: job.id },
      data: {
        status: "DONE",
        finishedAt: now(),
        result: outcome.text.slice(0, 2000),
        model: outcome.model,
        tokensIn: outcome.usage.input,
        tokensOut: outcome.usage.output,
        cacheReadTokens: outcome.usage.cacheRead,
        cacheWriteTokens: outcome.usage.cacheWrite,
        tools: outcome.tools,
      },
    });
    const { byMessage } = await actionsFor(db, who.companyId, { messageIds: [answer.id] });
    onEvent({
      type: "answer",
      message: { id: answer.id, author: "vane", text: answer.text, createdAt: answer.createdAt.toISOString(), actions: byMessage.get(answer.id) ?? [] },
    });
  } catch (error) {
    const why =
      error instanceof VaneError
        ? error.retryable
          ? "Vane cannot reach the service just now. Try again in a minute."
          : error.code === "misconfigured"
            ? "Vane is not set up on this server yet."
            : error.message
        : "Vane could not finish that.";
    if (!(error instanceof VaneError)) console.error("[vane] chat turn failed", error);
    await db.vaneJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: now(), error: error instanceof Error ? error.message : why } });
    onEvent({ type: "error", error: why });
  }
}
